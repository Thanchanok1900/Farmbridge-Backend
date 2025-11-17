// controllers/notification.controller.js
const db = require('../models');
const Notifications = db.Notifications;
// ลบ require modules ที่ไม่จำเป็นออกไป (Listings, Buyers, Farmers, calculateDistance)
// เนื่องจากเราจะใช้ข้อมูลระยะห่างที่ถูกบันทึกไว้แล้วใน field 'meta'

// GET /api/notifications
exports.getMyNotifications = async (req, res) => {
  try {
    const user_id = req.identity.id;

    const notifications = await Notifications.findAll({
      where: { user_id },
      // ⭐️ ไม่ต้องมี include แล้ว
      order: [["created_at", "DESC"]], // เรียงตามเวลาสร้างก่อนเบื้องต้น
      limit: 50
    });

    const enhanced = notifications.map(n => {
      
      // ⭐️ ดึงค่า distance_km จาก field meta (JSONB)
      const distance = n.meta?.distance_km ?? null;
      let distanceKm = null;
      let message = n.message;
      
      if (distance !== null) {
          // แปลงค่า distance เป็นตัวเลข (ทศนิยม 2 ตำแหน่ง)
          distanceKm = Number(parseFloat(distance).toFixed(2)); 
          
          // ⭐️ เพิ่มข้อความระยะห่างเข้าใน message 
          message += ` (ห่าง ${distanceKm.toFixed(1)} กม.)`; 
      }
      
      return {
        id: n.id,
        type: n.type,
        message: message,
        related_id: n.related_id,
        is_read: n.is_read,
        distance: distanceKm, // ใช้ Field นี้ในการเรียงลำดับ
        created_at: n.created_at
      };
    });

    // ⭐️ เรียงลำดับสุดท้ายตามระยะทาง (น้อยไปมาก)
    // การแจ้งเตือนที่ไม่มีระยะทาง (distance === null) จะถูกย้ายไปอยู่ท้ายสุด
    enhanced.sort((a, b) => {
        // จัดการกรณี distance เป็น null
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        // เรียงจากน้อยไปมาก
        return a.distance - b.distance; 
    });

    res.json(enhanced);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.identity.id; // ใช้ ID ของผู้ใช้ปัจจุบัน

    const notification = await Notifications.findOne({
      where: { id: id, user_id: user_id }
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.is_read) {
      return res.status(200).json({ message: 'Notification already marked as read' });
    }

    await notification.update({ is_read: true });

    res.json({ message: 'Notification marked as read successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mark as read', error: err.message });
  }
};