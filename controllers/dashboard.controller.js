// controllers/dashboard.controller.js
const db = require('../models');
const Orders = db.Orders;
const Listings = db.Listings;
const PriceHistory = db.PriceHistory;
const DashboardMetrics = db.DashboardMetrics;
const Farmers = db.Farmers;
const Buyers = db.Buyers;

exports.getImpactDashboard = async (req, res) => {
  try {
    const farmer_id = req.identity.id;

    // 1. ดึง transactions ที่สำเร็จแล้ว
    const completedOrders = await Orders.findAll({
      where: {
        seller_id: farmer_id,
        status: 'Completed'
      }
    });

    // 2. คำนวณ total revenue
    const totalRevenue = completedOrders.reduce(
      (sum, order) => sum + Number(order.total_price || 0),
      0
    );
    const totalTransactions = completedOrders.length;

    // 3. placeholder: เปรียบเทียบราคาขายให้พ่อค้าคนกลาง
    const estimatedMiddlemanRevenue = totalRevenue * 0.7; // สมมติ 70% ของราคา
    const increasePercent = estimatedMiddlemanRevenue > 0
      ? (((totalRevenue - estimatedMiddlemanRevenue) / estimatedMiddlemanRevenue) * 100).toFixed(0)
      : 0;

    // 4. ราคาตลาดล่าสุดของสินค้าที่ขายได้
    const latestOrder = await Orders.findOne({
      where: { seller_id: farmer_id, status: 'Completed' },
      order: [['updated_at', 'DESC']],
      include: [{ 
        model: Listings, 
        attributes: ['product_name', 'grade'] // ดึงชื่อสินค้าและเกรดมาแสดง
      }]
    });

    const targetProducts = ['มะม่วง', 'ทุเรียน', 'มังคุด', 'องุ่น'];
    const priceTrends = {};

    for (const product of targetProducts) {
      const prices = await PriceHistory.findAll({
        where: { product_name: product },
        order: [['record_date', 'ASC']],
        limit: 6 
      });

      priceTrends[product] = prices.map(p => ({
        date: p.record_date,
        price: Number(p.average_price)
      }));
    }

    res.json({
      metrics: {
        totalRevenue,
        totalTransactions,
        increasePercent,
        latestSale: latestOrder ? {
          product_name: latestOrder.Listing.product_name,
          grade: latestOrder.Listing.grade,
          quantity: latestOrder.quantity_ordered
        } : null
      },
      priceTrends
    });

  } catch (err) {
    console.error('Dashboard Error:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard data', error: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const latestMetrics = await DashboardMetrics.findOne({
      order: [['updated_at', 'DESC']]
    });

    const [
      activeListings,
      completedOrders,
      totalFarmers,
      totalBuyers
    ] = await Promise.all([
      Listings.count({ where: { status: 'available' } }),
      Orders.count({ where: { status: 'Completed' } }),
      Farmers.count(),
      Buyers.count()
    ]);

    const formattedMetrics = latestMetrics ? {
      total_sales_value: Number(latestMetrics.total_sales_value || 0),
      total_transactions: Number(latestMetrics.total_transactions || 0),
      average_price: Number(latestMetrics.average_price || 0),
      waste_reduced_kg: Number(latestMetrics.waste_reduced_kg || 0),
      updated_at: latestMetrics.updated_at
    } : {
      total_sales_value: 0,
      total_transactions: 0,
      average_price: 0,
      waste_reduced_kg: 0,
      updated_at: null
    };

    res.json({
      metrics: formattedMetrics,
      totals: {
        activeListings,
        completedOrders,
        totalFarmers,
        totalBuyers
      }
    });
  } catch (err) {
    console.error('Dashboard Stats Error:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard stats', error: err.message });
  }
};
