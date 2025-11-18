// controllers/demand.controller.js
const db = require('../models');
const Demands = db.Demands;
const Listings = db.Listings;
const Farmers = db.Farmers;
const Notifications = db.Notifications;
const { Op } = require('sequelize');
const { geocodeAddress } = require('../utils/geocode');
const { haversineDistance } = require('../utils/distance');

// 1. สร้างความต้องการใหม่ (และจับคู่แจ้งเตือนเกษตรกร)
exports.createDemand = async (req, res) => {
  try {
    const buyer_id = req.identity.id;
    const { product_name, desired_quantity, unit, desired_price } = req.body;

    // Validation
    if (!product_name || !desired_quantity || !unit) {
      return res.status(400).json({ message: 'กรุณาระบุข้อมูลให้ครบ' });
    }

    const qty = parseFloat(desired_quantity);
    const price = desired_price ? parseFloat(desired_price) : null;

    // ดึงข้อมูลผู้ซื้อ (เพื่อเอาพิกัด)
    const buyer = await db.Buyers.findByPk(buyer_id);
    let location_geom = null;
    if (buyer && buyer.address) {
      const coords = await geocodeAddress(buyer.address);
      if (coords)
        location_geom = { type: 'Point', coordinates: [coords.lng, coords.lat] };
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
    // 🎯 2. Matching Logic (จับคู่กับ Listing ที่มีอยู่)
    // -------------------------------------------------------------

    // 2.1 หา Listing ที่ "ชื่อตรงกัน" และ "มีของพอ" (Listing >= Demand)
    const listings = await Listings.findAll({
      where: {
        product_name: product_name,
        quantity_available: { [Op.gte]: qty }, // ของที่มี >= ของที่อยากได้
        status: 'available'
      },
      include: [
        { model: Farmers, as: 'seller', attributes: ['id', 'fullname', 'device_token', 'address'] }
      ]
    });

    const notifyList = [];

    for (const l of listings) {
      // ✅ 2.2 เช็กราคา (บวกลบไม่เกิน 5 บาท)
      if (price) { // ถ้าผู้ซื้อระบุราคามา
        const sellerPrice = parseFloat(l.price_per_unit);
        const diff = Math.abs(sellerPrice - price);

        // ถ้าห่างกันเกิน 5 บาท -> ข้าม (ไม่แจ้งเตือนเกษตรกรคนนี้)
        if (diff > 5) {
          continue;
        }
      }

      // 2.3 คำนวณระยะทาง
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

    // เรียงลำดับตามระยะทาง (ใกล้สุดขึ้นก่อน)
    notifyList.sort((a, b) => {
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });

    // 3. ส่งแจ้งเตือนหา "เกษตรกร"
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

      // 3.2 สร้างข้อความ (ใส่ราคาและระยะทาง)
      let msg = `มีผู้ซื้อต้องการ ${product_name} จำนวน ${qty} ${unit}`;
      if (item.distance_km !== null) msg += ` ห่าง ${item.distance_km.toFixed(1)} กม.`;
      if (price) {
        msg += ` ราคา ${price} บ. (คุณขาย ${item.listing.price_per_unit} บ.)`;
      }
      
      await Notifications.create({
        user_id: item.listing.seller_id,
        type: 'match',
        message: msg,
        related_id: demand.id,
        meta: { distance_km: item.distance_km }
      });
      if (emitToUser) emitToUser(item.listing.seller_id, 'notification', { message: msg });

      // 3.3 ⭐️ สร้าง Notification ลง DB (ส่งหาเกษตรกร)
      const notif = await Notifications.create({
        user_id: item.listing.seller_id, // ส่งหา Seller
        type: 'match',
        message: msg,
        related_id: demand.id, // ⭐️ ลิงก์มาที่ Demand นี้ เพื่อให้เกษตรกรกดดูรายละเอียด
        meta: { distance_km: item.distance_km }
      });

      // 3.4 Realtime
      if (emitToUser) {
        emitToUser(item.listing.seller_id, 'notification', {
          id: notif.id,
          message: msg,
          demand_id: demand.id,
          distance_km: item.distance_km
        });
      }
    }

    res.status(201).json({ message: 'Demand created successfully', demand });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Create demand failed', error: err.message });
  }
};

// 2. ดึงความต้องการทั้งหมดของผู้ซื้อ
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

// 3. ดึงตัวเลือกสินค้าจาก Listings (สำหรับ Dropdown)
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

// 4. ลบความต้องการ
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