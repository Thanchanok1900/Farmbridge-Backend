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

    const demand = await Demands.create({
      buyer_id,
      product_name,
      desired_quantity,
      unit,
      desired_price,
    });

    // ตรวจสอบ Listing ที่ตรงกัน
    const listings = await Listings.findAll({
      where: {
        product_name: { [Op.iLike]: `%${product_name}%` },
        quantity_available: { [Op.gte]: desired_quantity },
        status: 'available'
      }
    });

    if (listings.length > 0) {
      // ส่ง Notification match
      for (const listing of listings) {
        await Notifications.create({
          user_id: buyer_id,
          type: 'match',
          message: `มีรายการขายตรงกับความต้องการของคุณ: ${listing.product_name}`
        });
      }
    }

    res.status(201).json(demand);
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
