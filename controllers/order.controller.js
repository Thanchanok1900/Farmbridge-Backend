// controllers/order.controller.js
const db = require('../models');
const { Op } = require('sequelize');


// Models
const Orders = db.Orders;
const Listings = db.Listings;
const Buyers = db.Buyers;
const Farmers = db.Farmers;
const Notifications = db.Notifications;

// 1. (Buyer) สร้างออเดอร์ใหม่(Frontend จะเรียก API นี้ "หลังจาก" หน่วงเวลา 5 วินาที ฟีลๆแกล้งๆโหลด 5 วินาที เพื่อจำลองการจ่ายเงิน)
exports.createOrder = async (req, res) => {
  
  const { listing_id, quantity, pickup_slot } = req.body;
  const buyer_id = req.identity.id; // มาจาก authenticateToken

  // ตรวจสอบ Input
  if (!listing_id || !quantity || !pickup_slot) {
    return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน (listing_id, quantity, pickup_slot)' });
  }

  try {
    
    const listing = await Listings.findByPk(listing_id);

    if (!listing) {
      return res.status(404).json({ message: 'ไม่พบสินค้า' });
    }
    if (listing.status !== 'available') {
      return res.status(400).json({ message: 'สินค้านี้ขายไปแล้ว' });
    }
    
    //  ตรวจสอบสต็อก
    if (parseFloat(listing.quantity_available) < parseFloat(quantity)) {
      return res.status(400).json({ message: `สินค้ามีไม่เพียงพอ (เหลือ: ${listing.quantity_available})` });
    }

    //  คำนวณราคา
    const total_price = parseFloat(listing.price_per_unit) * parseFloat(quantity);
    
    // "จ่ายเงิน(จำลอง)สำเร็จแล้ว" -> เริ่มทำงานตัดสต็อก
    const t = await db.sequelize.transaction();
    try {
     //ล็อคแถวข้อมูลและตัดสต็อก
      const lockedListing = await Listings.findByPk(listing_id, { transaction: t, lock: t.LOCK.UPDATE });
      
      const newQuantity = parseFloat(lockedListing.quantity_available) - parseFloat(quantity);
      
      await lockedListing.update({
        quantity_available: newQuantity,
        status: newQuantity <= 0 ? 'sold_out' : 'available',
        updated_at: new Date() // (อัปเดตเวลาด้วย)
      }, { transaction: t });

      // สร้างรหัสรับสินค้า (สุ่ม 6 ตัว)
      const confirmation_code = Math.random().toString(36).substring(2, 8).toUpperCase();

      //  สร้างออเดอร์
      const order = await Orders.create({
        listing_id: listing_id,
        buyer_id: buyer_id,
        seller_id: lockedListing.seller_id,
        quantity_ordered: quantity,
        total_price: total_price,
        status: 'Processing',
        confirmation_code: confirmation_code,
        pickup_slot: pickup_slot
        
      }, { transaction: t });

      // สร้างการแจ้งเตือนไปหาเกษตรกร
      const seller = await Farmers.findByPk(lockedListing.seller_id);
      const message = `คุณมียอดสั่งซื้อ: ${lockedListing.product_name} จำนวน ${quantity} (รหัส ${confirmation_code})`;
      
      await Notifications.create({
        user_id: listing.seller_id,
        type: 'sale',
        message: message,
        related_id: order.id
      }, { transaction: t });

      // (ส่วน Real-time/FCM)
      const emitToUser = req.app.locals.emitToUser;
      const admin = req.app.locals.firebaseAdmin;
      const pushed = emitToUser ? emitToUser(listing.seller_id, 'notification', { message, orderId: order.id }) : false;
      
      if (!pushed && admin && seller && seller.device_token) {
        try {
          await admin.messaging().send({
            token: seller.device_token,
            notification: { title: 'คุณขายของได้แล้ว!', body: message },
            data: { type: 'order', order_id: String(order.id) }
          });
        } catch (e) { console.error('FCM send failed', e); }
      }
      
      await t.commit();
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
    const order = await Orders.findByPk(order_id);
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
    
    await Notifications.create({
      user_id: order.buyer_id,
      type: 'order_completed',
      message: `รับสินค้า ${order.confirmation_code} สำเร็จแล้ว`,
      related_id: order.id
    });
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






