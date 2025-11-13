const express = require('express');
const router = express.Router();
const demandController = require('../controllers/demand.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');

// ผู้ซื้อสร้างความต้องการ
router.post('/', authenticateToken, checkRole('buyer'), demandController.createDemand);

// ดึงความต้องการทั้งหมดของผู้ซื้อ
router.get('/', authenticateToken, checkRole('buyer'), demandController.getDemandsByBuyer);

// ลบความต้องการ
router.delete('/:id', authenticateToken, checkRole('buyer'), demandController.deleteDemand);

module.exports = router;
