// controllers/demand.controller.js
const db = require('../models');
const Demands = db.Demands;
const Listings = db.Listings;
const Farmers = db.Farmers;
const Notifications = db.Notifications;
const { Op } = require('sequelize');
const { geocodeAddress } = require('../utils/geocode');
const { haversineDistance } = require('../utils/distance');
const { sendEmail } = require('../utils/email');

// 1. สร้างความต้องการใหม่ (และจับคู่แจ้งเตือนเกษตรกร + แจ้งเตือนตัวเองถ้าเจอ)
exports.createDemand = async (req, res) => {
  try {
    if (!req.identity || !req.identity.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const buyer_id = req.identity.id;
    const { product_name, desired_quantity, unit, desired_price } = req.body;

    if (!product_name || !desired_quantity || !unit) {
      return res.status(400).json({ message: 'กรุณาระบุข้อมูลให้ครบ' });
    }

    const qty = parseFloat(desired_quantity);
    let price = null;
    if (desired_price !== undefined && desired_price !== null && desired_price !== '') {
        price = parseFloat(desired_price);
    }

    // ดึงข้อมูลผู้ซื้อ (เพื่อเอาพิกัด)
    let location_geom = null;
    try {
      const buyer = await db.Buyers.findByPk(buyer_id);
      if (buyer && buyer.address) {
        const coords = await geocodeAddress(buyer.address);
        if (coords) {
          location_geom = { type: 'Point', coordinates: [coords.lng, coords.lat] };
        }
      }
    } catch (geoErr) {
      console.log("Geocode warning:", geoErr.message);
    }

    // 1. บันทึก Demand ลง Database
    const demand = await Demands.create({
      buyer_id,
      product_name,
      desired_quantity: qty,
      unit,
      desired_price: price,
      location_geom,
      status: 'open'
    });

    // -------------------------------------------------------------
    // 🎯 2. Matching Logic
    // -------------------------------------------------------------

    const listings = await Listings.findAll({
      where: {
        product_name: product_name,
        quantity_available: { [Op.gte]: qty },
        status: 'available'
      },
      include: [
        { model: Farmers, as: 'seller', attributes: ['id', 'fullname', 'email', 'device_token', 'address'] }
      ]
    });

    const notifyList = [];

    for (const l of listings) {
      if (price !== null) { 
        const sellerPrice = parseFloat(l.price_per_unit);
        const diff = Math.abs(sellerPrice - price);
        if (diff > 5) continue; 
      }

      let listingCoords = null;
      if (l.location_geom) {
        listingCoords = {
          lat: l.location_geom.coordinates[1],
          lng: l.location_geom.coordinates[0]
        };
      }

      let distance_km = null;
      if (location_geom && listingCoords) {
        const lat1 = location_geom.coordinates[1];
        const lon1 = location_geom.coordinates[0];
        distance_km = haversineDistance(
          lat1, lon1,
          listingCoords.lat, listingCoords.lng
        );
      }

      notifyList.push({ listing: l, distance_km });
    }

    // เรียงลำดับตามระยะทาง
    notifyList.sort((a, b) => {
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });

    // 3. Loop แจ้งเตือน
    const emitToUser = req.app.locals.emitToUser;

    for (const item of notifyList) {
      // 3.1 บันทึก Match
      await db.Matches.create({
        listing_id: item.listing.id,
        demand_id: demand.id,
        distance_km: item.distance_km,
        matched_price: item.listing.price_per_unit,
        status: 'pending'
      });

      // -------------------------------------------------------
      // 🔔 แจ้งเตือนฝั่ง "เกษตรกร" (Seller)
      // -------------------------------------------------------
      let sellerMsg = `มีผู้ซื้อต้องการ ${product_name} จำนวน ${qty} ${unit}`;
      if (item.distance_km !== null) sellerMsg += ` ห่าง ${item.distance_km.toFixed(1)} กม.`;
      if (price !== null) sellerMsg += ` ราคา ${price} บ.`;

      const notifSeller = await Notifications.create({
        user_id: item.listing.seller_id,
        type: 'match',
        message: sellerMsg,
        related_id: demand.id,
        meta: { distance_km: item.distance_km }
      });

      if (emitToUser) {
        emitToUser(item.listing.seller_id, 'notification', {
          id: notifSeller.id,
          message: sellerMsg,
          demand_id: demand.id,
          distance_km: item.distance_km
        });
      }
      
      // ส่งอีเมลหาเกษตรกร
      const sellerEmail = item.listing.seller?.email;
      if (sellerEmail) {
        sendEmail({
          to: sellerEmail,
          subject: `มีผู้ต้องการ ${product_name} ใกล้คุณ`,
          text: sellerMsg
        }).catch(e => console.log("Email error:", e.message));
      }

      // -------------------------------------------------------
      // 🔔 ✅ เพิ่มใหม่: แจ้งเตือนฝั่ง "ผู้ซื้อ" (Buyer - ตัวเราเอง)
      // -------------------------------------------------------
      let buyerMsg = `เจอสินค้าแล้ว! ${product_name} ของ ${item.listing.seller.fullname}`;
      buyerMsg += ` ราคา ${item.listing.price_per_unit} บาท`;
      
      const notifBuyer = await Notifications.create({
        user_id: buyer_id, // ส่งให้ตัวเอง
        type: 'match',
        message: buyerMsg,
        related_id: item.listing.id, // คลิกแล้วไปดู Listing ของเขา
        meta: { distance_km: item.distance_km }
      });

      if (emitToUser) {
        emitToUser(buyer_id, 'notification', {
          id: notifBuyer.id,
          message: buyerMsg,
          related_id: item.listing.id,
          distance_km: item.distance_km
        });
      }
    }

    res.status(201).json({ message: 'Demand created successfully', demand });

  } catch (err) {
    console.error("Create Demand Critical Error:", err);
    res.status(500).json({ message: 'Create demand failed', error: err.message });
  }
};

// ... (ฟังก์ชันอื่นๆ getDemandsByBuyer, getProductOptions, deleteDemand คงเดิม)
exports.getDemandsByBuyer = async (req, res) => {
  try {
    const buyer_id = req.identity.id;
    const demands = await Demands.findAll({ 
        where: { buyer_id },
        order: [['created_at', 'DESC']]
    });
    res.json(demands);
  } catch (err) {
    res.status(500).json({ message: 'Fetch demands failed', error: err.message });
  }
};

exports.getProductOptions = async (req, res) => {
  try {
    const products = await db.Listings.findAll({
      attributes: [
        [db.Sequelize.fn('DISTINCT', db.Sequelize.col('product_name')), 'product_name']
      ],
      where: { status: 'available' },
      order: [['product_name', 'ASC']]
    });
    const list = products.map(p => p.product_name);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Fetch product list failed', error: err.message });
  }
};

exports.deleteDemand = async (req, res) => {
  try {
    const { id } = req.params;
    const demand = await Demands.findByPk(id);
    if (!demand) return res.status(404).json({ message: 'Demand not found' });
    if (demand.buyer_id !== req.identity.id) return res.status(403).json({ message: 'Not allowed' });
    await demand.destroy();
    res.json({ message: 'Demand deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
};