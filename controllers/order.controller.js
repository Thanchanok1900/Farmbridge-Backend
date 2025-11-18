// controllers/order.controller.js
const db = require('../models');
const { Op } = require('sequelize');
const { haversineDistance } = require('../utils/distance'); 

// Models
const Orders = db.Orders;
const Listings = db.Listings;
const Buyers = db.Buyers;
const Farmers = db.Farmers;
const Notifications = db.Notifications;
const PriceHistory = db.PriceHistory;
const { sendEmail } = require('../utils/email');

// 1. (Buyer) สร้างออเดอร์ใหม่
exports.createOrder = async (req, res) => {
  const { listing_id, quantity, pickup_slot } = req.body;
  const buyer_id = req.identity.id;

  if (!listing_id || !quantity || !pickup_slot) {
    return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน (listing_id, quantity, pickup_slot)' });
  }

  try {
    const listing = await Listings.findByPk(listing_id);
    if (!listing) return res.status(404).json({ message: 'ไม่พบสินค้า' });

    if (listing.status !== 'available') {
      return res.status(400).json({ message: 'สินค้านี้ขายไปแล้ว' });
    }

    if (parseFloat(listing.quantity_available) < parseFloat(quantity)) {
      return res.status(400).json({
        message: `สินค้ามีไม่เพียงพอ (เหลือ: ${listing.quantity_available})`
      });
    }

    // คำนวณราคา
    const total_price = parseFloat(listing.price_per_unit) * parseFloat(quantity);

    const t = await db.sequelize.transaction();

    try {
      const lockedListing = await Listings.findByPk(
        listing_id,
        { transaction: t, lock: t.LOCK.UPDATE }
      );

      const newQuantity = parseFloat(lockedListing.quantity_available) - parseFloat(quantity);

      await lockedListing.update({
        quantity_available: newQuantity,
        status: newQuantity <= 0 ? 'sold_out' : 'available',
        updated_at: new Date()
      }, { transaction: t });

      // สร้างรหัสรับสินค้า
      const confirmation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

      // สร้างออเดอร์
      const order = await Orders.create({
        listing_id,
        buyer_id,
        seller_id: lockedListing.seller_id,
        quantity_ordered: quantity,
        total_price,
        status: 'Processing',
        confirmation_code,
        pickup_slot
      }, { transaction: t });

      // ===============================
      // ⭐ คำนวณระยะทาง Buyer ↔ Farmer
      // ===============================

      const buyer = await Buyers.findByPk(buyer_id);
      const farmer = await Farmers.findByPk(lockedListing.seller_id);

      let distance_km = null;

      if (buyer?.location_geom && farmer?.location_geom) {
        distance_km = haversineDistance(
          buyer.location_geom.coordinates[1],
          buyer.location_geom.coordinates[0],
          farmer.location_geom.coordinates[1],
          farmer.location_geom.coordinates[0]
        );
      }

      // สร้าง notification
      const message = `คุณมียอดสั่งซื้อ: ${lockedListing.product_name} จำนวน ${quantity} (รหัส ${confirmation_code})`;
      const sellerEmailPayload = seller && seller.email ? {
        to: seller.email,
        subject: 'คุณมีคำสั่งซื้อใหม่บน Farmbridge',
        text: message
      } : null;

      await Notifications.create({
        user_id: listing.seller_id,
        type: 'sale',
        message,
        related_id: order.id,
        meta: { distance_km }   // ⭐ เพิ่มตรงนี้
      }, { transaction: t });

      // FCM / Real-time (ไม่แก้)
      const seller = farmer;
      const emitToUser = req.app.locals.emitToUser;
      const admin = req.app.locals.firebaseAdmin;

      const pushed = emitToUser
        ? emitToUser(listing.seller_id, 'notification', { message, orderId: order.id })
        : false;

      if (!pushed && admin && seller?.device_token) {
        try {
          await admin.messaging().send({
            token: seller.device_token,
            notification: { title: 'คุณขายของได้แล้ว!', body: message },
            data: { type: 'order', order_id: String(order.id) }
          });
        } catch (e) { console.error('FCM send failed', e); }
      }

      await t.commit();

      if (sellerEmailPayload) {
        sendEmail(sellerEmailPayload);
      }
      res.status(201).json({ message: 'สั่งซื้อสำเร็จ!', order: order });

    } catch (dbErr) {
      await t.rollback();
      console.error('DB Error after payment:', dbErr);
      res.status(500).json({ message: 'สร้างออเดอร์ล้มเหลว (DB Error)', error: dbErr.message });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'การสั่งซื้อล้มเหลว', error: err.message });
  }
};

// (Farmer) ยืนยันการรับสินค้า (เกษตรกรกรอกรหัส)
exports.confirmPickup = async (req, res) => {
  const { confirmation_code } = req.body;
  const { order_id } = req.params;
  const farmer_id = req.identity.id; 

  if (!confirmation_code) {
    return res.status(400).json({ message: 'กรุณาระบุรหัสรับสินค้า' });
  }
  try {
    const order = await Orders.findByPk(order_id, { include: Listings });
    if (!order) {
      return res.status(404).json({ message: 'ไม่พบออเดอร์' });
    }
    if (order.seller_id !== farmer_id) {
      return res.status(403).json({ message: 'คุณไม่ใช่เจ้าของออเดอร์นี้' });
    }
    if (order.status !== 'Processing') {
      return res.status(400).json({ message: 'ออเดอร์นี้ถูกจัดการไปแล้ว' });
    }
    if (order.confirmation_code !== confirmation_code.trim().toUpperCase()) {
      return res.status(400).json({ message: 'รหัสรับสินค้าไม่ถูกต้อง' });
    }
    
    // (PoC) "การโอนเงิน" เข้าบัญชีเกษตรกร เกิดขึ้นที่นี่...
    
    await order.update({ 
      status: 'Completed',
      updated_at: new Date() 
    });
    
    // บันทึกราคาต่อหน่วยลง PriceHistory
    if (order.Listing) {
      const unitPrice = parseFloat(order.total_price) / parseFloat(order.quantity_ordered);
      await PriceHistory.create({
        product_name: order.Listing.product_name,
        average_price: unitPrice,
        min_price: unitPrice,
        max_price: unitPrice,
        source: 'real_order',
        record_date: new Date()
      });
    }
    
    await Notifications.create({
      user_id: order.buyer_id,
      type: 'order_completed',
      message: `รับสินค้า ${order.confirmation_code} สำเร็จแล้ว`,
      related_id: order.id
    });

    const buyer = await Buyers.findByPk(order.buyer_id);
    if (buyer && buyer.email) {
      sendEmail({
        to: buyer.email,
        subject: 'ยืนยันการรับสินค้าสำเร็จ',
        text: `คำสั่งซื้อรหัส ${order.confirmation_code} ของคุณเสร็จสมบูรณ์แล้ว`
      });
    }
    res.json({ message: 'ยืนยันการรับสินค้าสำเร็จ!', order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'การยืนยันล้มเหลว', error: err.message });
  }
};

//3. (Buyer) ดึงประวัติการซื้อของฉัน
exports.getPurchaseHistory = async (req, res) => {
  try {
    const orders = await Orders.findAll({
      where: { buyer_id: req.identity.id },
      order: [['created_at', 'DESC']], 
      include: [
        { 
          model: Listings, 
          attributes: ['id', 'product_name', 'image_url'] 
        },
        { 
          model: Farmers, 
          as: 'Seller', 
          attributes: ['id', 'fullname', 'phone']
        }
      ]
    });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch purchase history', error: err.message });
  }
};

// (Farmer) ดึงประวัติการขายของฉัน
exports.getSalesHistory = async (req, res) => {
  try {
    const orders = await Orders.findAll({
      where: { seller_id: req.identity.id }, 
      order: [['created_at', 'DESC']], 
      include: [
        { 
          model: Listings, 
          attributes: ['id', 'product_name'] 
        },
        { 
          model: Buyers, 
          as: 'Buyer', 
          attributes: ['id', 'fullname']
        }
      ]
    });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch sales history', error: err.message });
  }
};

// GET /api/prices/real-market
exports.realMarketPrices = async (req, res) => {
  try {
    const prices = await PriceHistory.findAll({
      where: { source: 'real_order' },
      order: [['record_date', 'DESC']]
    });
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch real market prices', error: err.message });
  }
};
