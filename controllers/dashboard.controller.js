// controllers/dashboard.controller.js
const db = require('../models');
const Orders = db.Orders;
const Listings = db.Listings;
const DashboardMetrics = db.DashboardMetrics;
const priceData = require('../utils/priceData');

exports.getImpactDashboard = async (req, res) => {
  try {
    const farmer_id = req.identity.id;

    // 1. ดึง orders ที่สำเร็จแล้ว พร้อม join Listing เพื่อเอา product_name
    const orders = await Orders.findAll({
      where: {
        seller_id: farmer_id,
        status: 'Completed'
      },
      include: [
        {
          model: Listings,
          attributes: ['product_name']
        }
      ]
    });

    // 2. คำนวณ total revenue
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price), 0);
    const totalTransactions = orders.length;

    // 3. เปรียบเทียบราคาขายให้พ่อค้าคนกลาง (ใช้ priceData)
    let revenueFromMiddlemen = 0;
    for (const o of orders) {
      const productName = o.Listing?.product_name || 'Unknown';
      const productPrice = priceData.find(p => p.product_name === productName);
      if (productPrice) {
        const [minStr, maxStr] = productPrice.lheng_low_grade.split('-');
        const min = parseFloat(minStr);
        const max = parseFloat(maxStr) || min;
        const avgMarketPrice = (min + max) / 2;

        revenueFromMiddlemen += avgMarketPrice * Number(o.quantity_ordered);
      }
    }

    const increasePercent = revenueFromMiddlemen > 0
      ? ((totalRevenue - revenueFromMiddlemen) / revenueFromMiddlemen * 100).toFixed(2)
      : null;

    // 4. ราคาที่ขายจริงของสินค้าที่ขายได้ (แทน priceData)
    const soldProducts = [...new Set(orders.map(o => o.Listing?.product_name || 'Unknown'))];
    const priceTrends = {};

    for (const product of soldProducts) {
      // เลือก orders ของ product นี้
      const productOrders = orders.filter(o => o.Listing?.product_name === product);

      // คำนวณ min, max, avg จากราคาที่ขายจริง
      const prices = productOrders.map(o => Number(o.total_price) / Number(o.quantity_ordered));

      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;

      priceTrends[product] = {
        avg,
        min,
        max,
        unit: 'บาท/กก.',
        last_updated: new Date() // หรือเอาเวลาของ order ล่าสุด
      };
    }


    // 5. บันทึก metrics ลง dashboard_metrics
    await DashboardMetrics.create({
      farmer_id,
      total_revenue: totalRevenue,
      total_transactions: totalTransactions,
      revenue_from_middlemen: revenueFromMiddlemen,
      increase_percent: increasePercent,
      created_at: new Date()
    });

    // ส่งข้อมูลไป dashboard
    res.json({
      metrics: {
        totalRevenue,
        totalTransactions,
        revenueFromMiddlemen,
        increasePercent
      },
      priceTrends
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch dashboard', error: err.message });
  }
};
