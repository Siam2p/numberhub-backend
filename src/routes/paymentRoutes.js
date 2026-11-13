/**
 * Payment Routes — /api/payments
 * Admin dashboard endpoints for manual Binance payment management and history.
 */

const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getBot } = require('../bot');

// GET /api/payments — list payments with filter & pagination
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const filter = status ? { status } : {};
    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('userId', 'telegramId username firstName balance');
    const total = await Payment.countDocuments(filter);
    return res.json({ success: true, payments, total });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/:id/approve — admin approves manual deposit
router.post('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { adminNote } = req.body || {};
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });

    if (payment.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Payment is already approved' });
    }

    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.verifiedBy = req.admin?.email || 'admin';
    if (adminNote) payment.adminNote = adminNote;
    await payment.save();

    const user = await User.findById(payment.userId);
    if (user) {
      user.balance = Number(((user.balance || 0) + payment.amountUSDT).toFixed(4));
      user.totalDeposited = Number(((user.totalDeposited || 0) + payment.amountUSDT).toFixed(4));
      await user.save();

      // Notify user via Telegram
      try {
        const bot = getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            user.telegramId,
            `🎉 *Deposit Approved!*\n\n` +
            `💵 *Amount Credited:* \`$${payment.amountUSDT.toFixed(2)} USDT\`\n` +
            `💰 *New Balance:* \`$${user.balance.toFixed(2)} USDT\`\n\n` +
            `Your funds are now ready! Tap *📱 Get Number* to get your virtual numbers.`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (notifErr) {
        console.warn('[Payments] User notify error:', notifErr.message);
      }
    }

    return res.json({ success: true, message: 'Payment approved and balance credited', payment });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/:id/reject — admin rejects manual deposit
router.post('/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });

    payment.status = 'rejected';
    payment.adminNote = reason || 'Rejected by administrator';
    payment.verifiedBy = req.admin?.email || 'admin';
    await payment.save();

    const user = await User.findById(payment.userId);
    if (user) {
      try {
        const bot = getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            user.telegramId,
            `⚠️ *Deposit Not Approved*\n\n` +
            `Your deposit request \`${payment.merchantTradeNo}\` for \`$${payment.amountUSDT.toFixed(2)} USDT\` was not approved.\n` +
            (reason ? `Reason: _${reason}_\n\n` : '\n') +
            `Please check your Binance transfer details or contact support.`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (e) {}
    }

    return res.json({ success: true, message: 'Payment marked as rejected', payment });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments/user/:telegramId
router.get('/user/:telegramId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.params.telegramId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const payments = await Payment.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);
    return res.json({ success: true, balance: user.balance || 0, totalDeposited: user.totalDeposited || 0, payments });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
