const express = require('express');
const router = express.Router();
const priceController = require('../controllers/price.controller');
const orderController = require('../controllers/order.controller');

router.get('/seller/:productName', priceController.getSellerPriceInfo);
router.get('/buyer/:productName', priceController.getBuyerPriceInfo);

// GET /api/orders/prices/real-market (ดึงราคาตลาดจริง)
// “ดึงราคาทั้งหมดที่เคยซื้อขายจริง” จาก PriceHistory
router.get('/real-market', orderController.realMarketPrices);

module.exports = router;
