const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const binancePayWebhook = require('./webhooks/binancePay');

router.post('/sms', webhookController.handleSmsWebhook);

// Binance Pay payment confirmation webhook
router.use('/', binancePayWebhook);

module.exports = router;
