const db = require('../models');
const Notifications = db.Notifications;

// GET /api/notifications
exports.getMyNotifications = async (req, res) => {
  try {
    const user_id = req.identity.id; // ดึง ID ของคน Login (Buyer)

    // ดึงข้อมูลจากตาราง Notifications ที่ create ไว้ใน listing.controller.js
    const notifications = await Notifications.findAll({
      where: { user_id: user_id },
      order: [['created_at', 'DESC']], // ใหม่สุดขึ้นก่อน
      limit: 50
    });
    
    // สิ่งที่ Frontend จะได้:
    // [
    //   {
    //     "id": 1,
    //     "type": "match",
    //     "message": "พบ มะม่วง ราคา 18 บ. (คุณขอ 15 บ.) ห่าง 5.2 กม.",
    //     "related_id": 105,  <-- เอา ID นี้ไปเปิดหน้า Listing Detail เพื่อกดซื้อ
    //     "is_read": false,
    //     "created_at": "..."
    //   }
    // ]

    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

// POST /api/notifications/:id/read (มาร์คว่าอ่านแล้ว)
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const notif = await Notifications.findByPk(id);
        if(notif && notif.user_id === req.identity.id) {
            await notif.update({ is_read: true });
            res.json({ message: 'Read' });
        } else {
            res.status(404).json({ message: 'Not found' });
        }
    } catch(err) {
        res.status(500).json({ message: 'Error' });
    }
};