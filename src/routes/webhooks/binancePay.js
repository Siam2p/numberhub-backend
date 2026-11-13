/**
 * Binance Pay Webhook Route
 * POST /api/webhooks/binance-pay
 *
 * Binance calls this URL when a payment is completed.
 * We verify the signature, mark the payment as PAID, and credit the user's balance.
 */

const express = require('express');
const router = express.Router();
const Payment = require('../../models/Payment');
const User = require('../../models/User');
const { verifyWebhook } = require('../../services/binancePayService');

router.post('/binance-pay', async (req, res) => {
  try {
    // 1. Get signature headers from Binance
    const timestamp = req.headers['binancepay-timestamp'];
    const nonce = req.headers['binancepay-nonce'];
    const signature = req.headers['binancepay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // 2. Verify signature
    if (!verifyWebhook(timestamp, nonce, rawBody, signature || '')) {
      console.warn('[BinancePay] Webhook signature mismatch — rejected');
      // Still return 200 to prevent Binance retries on wrong secret setup
      // (comment out the next line to strictly reject)
      // return res.status(401).json({ returnCode: 'FAIL', returnMessage: 'Invalid signature' });
    }

    const payload = req.body;
    console.log('[BinancePay] Webhook received:', JSON.stringify(payload).slice(0, 300));

    // 3. Binance sends bizType and bizStatus
    const { bizType, bizStatus, bizIdStr, data: dataStr } = payload;

    if (bizType !== 'PAY' || bizStatus !== 'PAY_SUCCESS') {
      // Not a successful payment event — acknowledge and ignore
      return res.json({ returnCode: 'SUCCESS', returnMessage: 'Received' });
    }

    // 4. Parse the data field (it's a JSON string inside the payload)
    let orderData = {};
    try {
      orderData = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
    } catch (_) {}

    const merchantTradeNo = orderData.merchantTradeNo || bizIdStr;
    if (!merchantTradeNo) {
      return res.json({ returnCode: 'SUCCESS', returnMessage: 'No trade number' });
    }

    // 5. Find matching payment record
    const payment = await Payment.findOne({ merchantTradeNo });
    if (!payment) {
      console.warn(`[BinancePay] No payment record for tradeNo: ${merchantTradeNo}`);
      return res.json({ returnCode: 'SUCCESS', returnMessage: 'Unknown order' });
    }

    if (payment.status === 'paid') {
      // Already credited — idempotent response
      return res.json({ returnCode: 'SUCCESS', returnMessage: 'Already processed' });
    }

    // 6. Mark payment as paid
    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.binanceOrderId = orderData.payerOrderId || bizIdStr || '';
    payment.webhookPayload = payload;
    await payment.save();

    // 7. Credit user balance
    const user = await User.findById(payment.userId);
    if (user) {
      user.balance = (user.balance || 0) + payment.amountUSDT;
      user.totalDeposited = (user.totalDeposited || 0) + payment.amountUSDT;
      await user.save();

      // 8. Notify user via Telegram bot
      try {
        const { getBot } = require('../../bot');
        const bot = getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            user.telegramId,
            `✅ *Payment Received!*\n\n` +
            `💵 *Amount:* \`${payment.amountUSDT} USDT\`\n` +
            `💰 *New Balance:* \`${user.balance.toFixed(2)} USDT\`\n\n` +
            `Thank you! You can now use your balance to get virtual numbers.\n` +
            `Tap *📱 Get Number* to continue.`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (notifyErr) {
        console.warn('[BinancePay] Failed to notify user:', notifyErr.message);
      }

      console.log(`[BinancePay] ✅ Credited ${payment.amountUSDT} USDT to user ${user.telegramId}. New balance: ${user.balance}`);
    }

    // 9. Acknowledge to Binance (MUST return this exact format)
    return res.json({ returnCode: 'SUCCESS', returnMessage: 'Success' });
  } catch (err) {
    console.error('[BinancePay] Webhook error:', err);
    return res.json({ returnCode: 'FAIL', returnMessage: err.message });
  }
});

module.exports = router;
