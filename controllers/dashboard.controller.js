// controllers/dashboard.controller.js
const db = require('../models');
const Orders = db.Orders;
const Listings = db.Listings;
const DashboardMetrics = db.DashboardMetrics;
const priceData = require('../utils/priceData');

exports.getImpactDashboard = async (req, res) => {
  try {
    const farmer_id = req.identity.id;

    console.log('🔍 Fetching dashboard for farmer_id:', farmer_id);

    // 1. ดึง orders ที่สำเร็จแล้ว พร้อม join Listing
    const orders = await Orders.findAll({
      where: {
        seller_id: farmer_id,
        status: 'Completed'
      },
      include: [
        {
          model: Listings,
          attributes: ['product_name', 'grade'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']]
    });

    console.log('📦 Found orders:', orders.length);

    // 2. คำนวณ total revenue
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
    const totalTransactions = orders.length;

    // 3. หา latest order
    //const latestOrder = orders.length > 0 ? orders[0] : null;

    // 4. เปรียบเทียบราคาขายให้พ่อค้าคนกลาง
    let revenueFromMiddlemen = 0;
    for (const o of orders) {
      const productName = o.Listing?.product_name || 'Unknown';
      const productPrice = priceData.find(p => p.product_name === productName);
      
      if (productPrice && productPrice.lheng_low_grade) {
        const priceRange = productPrice.lheng_low_grade.split('-');
        const min = parseFloat(priceRange[0]) || 0;
        const max = parseFloat(priceRange[1]) || min;
        const avgMarketPrice = (min + max) / 2;
        revenueFromMiddlemen += avgMarketPrice * Number(o.quantity_ordered || 0);
      }
    }

    const increasePercent = revenueFromMiddlemen > 0
      ? Number(((totalRevenue - revenueFromMiddlemen) / revenueFromMiddlemen * 100).toFixed(2))
      : 0;

      const salesHistory = orders.map(o => ({
        product_name: o.Listing?.product_name || 'สินค้าไม่ระบุ',
        grade: o.Listing?.grade || '-',
        quantity: Number(o.quantity_ordered),
        total_price: Number(o.total_price),
        date: o.created_at
    }));

    console.log('💰 Revenue:', { totalRevenue, revenueFromMiddlemen, increasePercent });

    // 5. สร้าง price trends จากข้อมูลจริง
    const soldProducts = [...new Set(orders.map(o => o.Listing?.product_name).filter(Boolean))];
    const priceTrends = {};

    for (const product of soldProducts) {
      const productOrders = orders.filter(o => o.Listing?.product_name === product);
      
      // จัดกลุ่มตามเดือน
      const monthlyData = {};
      productOrders.forEach(o => {
        const date = new Date(o.created_at);
        const month = date.toLocaleDateString('th-TH', { month: 'short' });
        const quantity = Number(o.quantity_ordered || 1);
        const pricePerKg = quantity > 0 ? Number(o.total_price || 0) / quantity : 0;
        
        if (!monthlyData[month]) {
          monthlyData[month] = [];
        }
        monthlyData[month].push(pricePerKg);
      });

      // แปลงเป็น array สำหรับกราฟ
      priceTrends[product] = Object.entries(monthlyData).map(([date, prices]) => ({
        date,
        price: Math.round(
          prices.reduce((sum, p) => sum + p, 0) / prices.length
        )
      }));
    }

    console.log('📊 Price trends:', Object.keys(priceTrends));

    // 6. บันทึก metrics (ถ้ามีข้อมูล)
    if (totalTransactions > 0) {
      try {
        await DashboardMetrics.create({
          farmer_id,
          total_sales_value: totalRevenue,
          total_transactions: totalTransactions,
          average_price: totalRevenue / totalTransactions,
          waste_reduced_kg: totalTransactions * 10,
          updated_at: new Date()
        });
      } catch (metricsErr) {
        console.warn('⚠️  Failed to save metrics:', metricsErr.message);
      }
    }

    // 7. ส่งข้อมูลกลับ
    const response = {
      success: true,
      metrics: {
        totalRevenue,
        totalTransactions,
        increasePercent,
        salesHistory
      },
      priceTrends
    };

    console.log('✅ Dashboard response sent');
    res.json(response);

  } catch (err) {
    console.error('❌ Dashboard Error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch dashboard data', 
      error: err.message 
    });
  }
};