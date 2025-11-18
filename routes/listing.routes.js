// routes/listing.routes.js
const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listing.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');
const upload = require('../middleware/upload.middleware');

// market suggestion (public)
// “แนะนำราคาให้เกษตรกร” โดยดึงข้อมูลที่ สรุปแล้วจากออเดอร์ทั้งหมดในระบบ
router.get('/market-suggestion', listingController.marketSuggestion);

// public
router.get('/', listingController.getAll);
router.get('/my-listings',authenticateToken, checkRole('farmer'), listingController.getMyListings);
router.get('/:id', listingController.getById);

// protected (farmer only)
router.post('/', authenticateToken, checkRole('farmer'), upload.array('images', 5), listingController.create);
router.put('/:id', authenticateToken, checkRole('farmer'), listingController.update);
router.delete('/:id', authenticateToken, checkRole('farmer'), listingController.remove);

module.exports = router;
