const db = require('../models');
const Demands = db.Demands;
const Listings = db.Listings;
const Notifications = db.Notifications;
const { Op } = require('sequelize');

// สร้างความต้องการใหม่
exports.createDemand = async (req, res) => {
  try {
    const { product_name, desired_quantity, unit, desired_price } = req.body;
    const buyer_id = req.identity.id;

    if (!product_name || !desired_quantity || !unit) {
      return res.status(400).json({ message: 'กรุณาระบุชื่อสินค้า จำนวน และหน่วย' });
    }

    const demand = await db.Demands.create({
      buyer_id,
      product_name,
      desired_quantity,
      unit,
      desired_price
    });

    // ตรวจสอบ listings ที่ตรงกัน
    const listings = await db.Listings.findAll({
      where: {
        product_name: { [Op.iLike]: `%${product_name}%` },
        quantity_available: { [Op.gte]: desired_quantity },
        status: 'available'
      }
    });

    // ถ้ามีสินค้าตรงกับความต้องการ → สร้าง Notification
    if (listings.length > 0) {
      for (const listing of listings) {
        await db.Notifications.create({
          user_id: buyer_id,
          type: 'match',
          message: `พบสินค้าตรงกับความต้องการของคุณ: ${listing.product_name} (${listing.price_per_unit} บาท/${listing.unit})`
        });
      }
    }

    res.status(201).json({ message: 'บันทึกความต้องการเรียบร้อย', demand });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Create demand failed', error: err.message });
  }
};

// ดึงความต้องการทั้งหมดของผู้ซื้อ
exports.getDemandsByBuyer = async (req, res) => {
  try {
    const buyer_id = req.identity.id;
    const demands = await Demands.findAll({ where: { buyer_id } });
    res.json(demands);
  } catch (err) {
    res.status(500).json({ message: 'Fetch demands failed', error: err.message });
  }
};

// ดึงตัวเลือกสินค้าจาก Listings
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

// ลบความต้องการ
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
