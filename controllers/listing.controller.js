const db = require('../models');
const Listings = db.Listings;
const Farmers = db.Farmers;
const { geocodeAddress } = require('../utils/geocode');
const { Op } = require('sequelize');
// ตรวจสอบ path ให้ถูกว่าไฟล์ distance.js อยู่ที่ไหน
const { haversineDistance } = require('../utils/distance'); 
const { sendEmail } = require('../utils/email');

const allowedProducts = ['มะม่วง', 'มังคุด', 'ทุเรียน', 'องุ่น'];
const allowedGrades = ['เกรด B', 'เกรด C', 'เกรดต่ำกว่า C'];

// GET all listings (ดึงทั้งหมด)
exports.getAll = async (req, res) => {
  try {
    const { product_name, status ,keyword } = req.query;
    const where = {};
    if (product_name) where.product_name = product_name.trim();
    if (status) where.status = status.trim();

    // ค้นหาด้วย keyword (search)
      if (keyword) {
      const searchTerm = keyword.trim();
      where[Op.or] = [
        { product_name: { [Op.like]: `%${searchTerm}%` } }, // เช่น พิมพ์ "ทุ" ก็เจอ "ทุเรียน"
        { description:  { [Op.like]: `%${searchTerm}%` } }, // เจอในรายละเอียด
        { grade:        { [Op.like]: `%${searchTerm}%` } }  // เจอในเกรด
      ];
    }


    const rows = await Listings.findAll({
      where,
      attributes: [
          'id', 'product_name', 'price_per_unit', 'unit', 
          'grade', 'image_url', 'status', 'location_geom', 'created_at' 
      ],
      include: [
        { model: Farmers, as: 'seller', attributes: ['id', 'fullname', 'email', 'phone', 'address'] }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch listings', error: err.message });
  }
};

// GET listings for current farmer (ดึงของฉัน)
exports.getMyListings = async (req, res) => {
  try {
    const identity = req.identity;
    const { product_name, status } = req.query;
    const where = { seller_id: identity.id };
    
    if (product_name) where.product_name = product_name.trim();
    if (status) where.status = status.trim();

    const rows = await Listings.findAll({
      where,
      include: [
        { model: Farmers, as: 'seller', attributes: ['id', 'fullname', 'email', 'phone', 'address'] }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch your listings', error: err.message });
  }
};

// GET listing by id (ดูรายละเอียด)
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Listings.findByPk(id, {
      include: [
        { model: Farmers, as: 'seller', attributes: ['id', 'fullname', 'email', 'phone', 'address'] }
      ]
    });
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ⭐️⭐️⭐️ CREATE listing & MATCHING Logic ⭐️⭐️⭐️
exports.create = async (req, res) => {
  try {
    const farmer_id = req.identity.id;
    let { product_name, grade, quantity_total, price_per_unit, pickup_date, description, image_urls, unit } = req.body;

    // 1. Validation
    if (!allowedProducts.includes(product_name)) return res.status(400).json({ message: 'ชื่อสินค้าไม่ถูกต้อง' });

    // ตรวจสอบ grade (ถ้ามีส่งเข้ามา)
    if (grade && !allowedGrades.includes(grade)) {
      return res.status(400).json({ message: 'เกรดสินค้าไม่ถูกต้อง' });
    }

    let image_filenames = [];
    if (req.files && req.files.length > 0) {
        // map เอาแค่ชื่อไฟล์เก็บลง Database (เช่น '170555-image.jpg')
        image_filenames = req.files.map(file => file.filename);
    }
    
    // แปลงตัวเลขให้ชัวร์
    const qty = parseFloat(quantity_total);
    const price = parseFloat(price_per_unit);

    if (!qty || !price || !pickup_date) {
      return res.status(400).json({ message: 'ข้อมูลไม่ครบ (quantity, price, date)' });
    }

    // 2. หาพิกัดเกษตรกร
    const farmer = await Farmers.findByPk(farmer_id);
    let location_geom = null;
    if (farmer && farmer.address) {
      const coords = await geocodeAddress(farmer.address);
      if (coords) location_geom = { type: 'Point', coordinates: [coords.lng, coords.lat] };
    }

    // 3. สร้าง Listing ลง Database
    const listing = await Listings.create({
      seller_id: farmer_id,
      product_name,
      grade: grade || null,
      quantity_total: qty,
      quantity_available: qty,
      unit,
      price_per_unit: price,
      pickup_date,
      description: description || null,
      image_url: image_filenames,
      status: 'available',
      location_geom
    });

    // ------------------------------------------------------------
    // 🎯 4. Matching Logic (ตามเงื่อนไขของคุณ)
    // ------------------------------------------------------------
    
    // 4.1 ดึง Demand ที่ชื่อตรงกัน และ ปริมาณตรงเงื่อนไขมาก่อน
    const demands = await db.Demands.findAll({
      where: {
        // ชื่อสินค้าตรงกัน
        product_name: product_name,
        // ⭐️ ปริมาณที่คนซื้อต้องการ (desired) <= ปริมาณที่คนขายโพสต์ (qty)
        desired_quantity: { [Op.lte]: qty },
        // สถานะเป็น open
        status: 'open'
      }
    });

    const notifyList = [];

    // 4.2 วนลูปเพื่อเช็ก "ราคา" และคำนวณ "ระยะทาง"
    for (const d of demands) {
      const buyerProfile = await db.Buyers.findByPk(d.buyer_id);
      
      // ✅ เช็กเงื่อนไขราคา (บวกลบไม่เกิน 5 บาท)
      if (d.desired_price) {
        const buyerPrice = parseFloat(d.desired_price);
        const sellerPrice = price;
        
        // คำนวณส่วนต่าง (Absolute Difference)
        const diff = Math.abs(sellerPrice - buyerPrice); // เช่น |18 - 15| = 3
        
        // ถ้าห่างกันเกิน 5 บาท -> ข้ามคนนี้ไปเลย (ไม่แจ้งเตือน)
        if (diff > 5) {
          continue; 
        }
      }

      // ✅ คำนวณระยะทาง
      let distance_km = null;
      let buyerCoords = null;

      // หาพิกัดผู้ซื้อ (จาก Demand หรือ Profile)
      if (d.location_geom) {
         buyerCoords = { lat: d.location_geom.coordinates[1], lng: d.location_geom.coordinates[0] };
      } else if (buyerProfile && buyerProfile.location_geom) {
         buyerCoords = { lat: buyerProfile.location_geom.coordinates[1], lng: buyerProfile.location_geom.coordinates[0] };
      }

      if (buyerCoords && location_geom) {
        distance_km = haversineDistance(
          buyerCoords.lat, buyerCoords.lng,
          location_geom.coordinates[1], location_geom.coordinates[0]
        );
      }

      notifyList.push({ demand: d, distance_km, buyer: buyerProfile });
    }

    // เรียงลำดับ (ใกล้สุดขึ้นก่อน)
    notifyList.sort((a, b) => {
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });

    // 5. สร้างการแจ้งเตือน
    const emitToUser = req.app.locals.emitToUser;

    for (const item of notifyList) {
      // 5.1 สร้างข้อความ (ใส่ราคาและระยะทาง)
      let msg = `พบ ${product_name} ราคา ${price} บ. (คุณขอ ${item.demand.desired_price || '-'} บ.)`;
      if (item.distance_km !== null) {
        msg += ` ห่าง ${item.distance_km.toFixed(1)} กม.`; // ✅ โชว์ระยะทาง
      }

      // 5.2 บันทึก Match (เก็บประวัติ)
      await db.Matches.create({
        listing_id: listing.id,
        demand_id: item.demand.id,
        distance_km: item.distance_km,
        matched_price: price,
        status: 'pending'
      });

      // 5.3 ⭐️ บันทึก Notification ลง DB (เพื่อให้ผู้ซื้อไปเปิดดูในหน้าแจ้งเตือน)
      const notif = await db.Notifications.create({
        user_id: item.demand.buyer_id, // ส่งหาผู้ซื้อ
        type: 'match',
        message: msg,
        related_id: listing.id, // ✅ ใส่ ID เพื่อให้กดแล้วไปหน้า Listing Detail
        meta: { distance_km: item.distance_km }
      });

      // 5.4 Realtime (ถ้าเปิดแอปอยู่)
      if (emitToUser) {
        emitToUser(item.demand.buyer_id, 'notification', {
           id: notif.id,
           message: msg,
           related_id: listing.id,
           distance_km: item.distance_km
        });
      }

      const buyerEmail = item.buyer?.email;
      if (buyerEmail) {
        sendEmail({
          to: buyerEmail,
          subject: `พบสินค้า ${product_name} ที่ตรงกับคำขอของคุณ`,
          text: msg
        });
      }
    }

    res.status(201).json({ message: 'Listing created', listing });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Create listing failed', error: err.message });
  }
};

// UPDATE listing
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const identity = req.identity;
    const listing = await Listings.findByPk(id);

    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (Number(listing.seller_id) !== Number(identity.id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { product_name, grade, quantity_total, price_per_unit, pickup_date, description, image_urls } = req.body;
    const payload = {};

    // ⭐️⭐️ ตรวจสอบ grade ว่าต้องอยู่ใน allowedGrades เท่านั้น ⭐️⭐️
    if (grade && !allowedGrades.includes(grade)) {
      return res.status(400).json({ message: 'เกรดสินค้าไม่ถูกต้อง' });
    }
    if (grade) payload.grade = grade;

    // ⭐️ product_name validation (ถ้ามีแก้)
    if (product_name && !allowedProducts.includes(product_name)) {
      return res.status(400).json({ message: 'ชื่อสินค้าไม่ถูกต้อง' });
    }
    if (product_name) payload.product_name = product_name;

    // ... (ใส่ logic update ปกติของคุณตรงนี้ได้เลย) ...
    // เพื่อความสั้น ผมละส่วน update ไว้ (ใช้โค้ดเดิมของคุณได้เลยครับ มันถูกต้องแล้ว)
    // แค่อย่าลืมใช้ parseFloat() ถ้ามีการคำนวณ

    // (ตัวอย่างการแก้บั๊ก DECIMAL ที่ผมเคยให้)
    if (quantity_total !== undefined) {
       const newQty = parseFloat(quantity_total);
       const diff = newQty - parseFloat(listing.quantity_total);
       payload.quantity_total = newQty;
       payload.quantity_available = (parseFloat(listing.quantity_available) || 0) + diff;
    }
    
    if (product_name) payload.product_name = product_name;
    if (price_per_unit) payload.price_per_unit = parseFloat(price_per_unit);
    if (pickup_date) payload.pickup_date = pickup_date;
    if (description) payload.description = description;
    if (image_urls) payload.image_url = image_urls;

    await listing.update(payload);
    res.json({ message: 'Listing updated', listing });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed', error: err.message });
  }
};

// DELETE listing
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const identity = req.identity;
    const listing = await Listings.findByPk(id);
    if (!listing) return res.status(404).json({ message: 'Not found' });
    if (Number(listing.seller_id) !== Number(identity.id)) return res.status(403).json({ message: 'Not authorized' });
    await listing.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
};

// Market Suggestion
exports.marketSuggestion = async (req, res) => {
  try {
    const { product_name, days = 7 } = req.query;
    if (!product_name) return res.status(400).json({ message: 'product_name required' });

    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    const rows = await db.PriceHistory.findAll({
      where: {
        product_name,
        record_date: { [Op.gte]: since },
        source: 'real_order'  // ⭐ ใช้เฉพาะราคาซื้อขายจริง
      }
    });

    if (!rows || rows.length === 0)
      return res.json({ count: 0, avg: null, low: null, high: null });

    const prices = rows.map(r => parseFloat(r.average_price));
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

    res.json({
      count: prices.length,
      avg: Number(avg.toFixed(2)),
      low: Math.min(...prices),
      high: Math.max(...prices)
    });

  } catch (err) {
    res.status(500).json({ message: 'Suggestion failed', error: err.message });
  }
};
