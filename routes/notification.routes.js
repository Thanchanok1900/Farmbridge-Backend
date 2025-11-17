const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// ⭐️ API สำหรับดึงหน้าแจ้งเตือน
router.get('/', authenticateToken, notificationController.getMyNotifications);

router.post('/:id/read', authenticateToken, notificationController.markAsRead);

module.exports = router;