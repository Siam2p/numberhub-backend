const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    telegramId: {
      type: String,
      required: true,
      index: true,
    },
    merchantTradeNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    prepayId: {
      type: String,
      default: '',
    },
    amountUSDT: {
      type: Number,
      required: true,
      min: 0.1,
    },
    method: {
      type: String,
      enum: ['binance_manual', 'binance_pay'],
      default: 'binance_manual',
    },
    transactionId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'pending_verification', 'paid', 'rejected', 'failed', 'expired', 'canceled'],
      default: 'pending',
      index: true,
    },
    checkoutUrl: { type: String, default: '' },
    qrcodeLink: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    binanceOrderId: { type: String, default: '' },
    senderNote: { type: String, default: '' },
    adminNote: { type: String, default: '' },
    verifiedBy: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    webhookPayload: { type: Object, default: null },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
