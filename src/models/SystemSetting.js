const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: 'payment_config',
    },
    binancePayId: {
      type: String,
      default: '987654321',
      trim: true,
    },
    binanceUid: {
      type: String,
      default: '876543210',
      trim: true,
    },
    binanceAddress: {
      type: String,
      default: 'TYDzsYndWh2EzfNgPv5smvWgkBFqRmsBgp',
      trim: true,
    },
    payeeName: {
      type: String,
      default: 'NumberHub Pay',
      trim: true,
    },
    network: {
      type: String,
      default: 'TRC20 / BEP20',
      trim: true,
    },
    instructions: {
      type: String,
      default: 'Send USDT to the address or Pay ID above, then tap Submit Binance Pay ID / TxID.',
    },
    minDeposit: {
      type: Number,
      default: 0.5,
    },
    adminTelegramId: {
      type: String,
      default: '',
      trim: true,
    },
    smsProvider: {
      type: String,
      enum: ['decider', 'fivesim', 'freetemp', 'free', 'mock'],
      default: 'fivesim',
    },
    fiveSimApiKey: {
      type: String,
      default: '',
      trim: true,
    },
    // AI Assistant Configuration
    aiEnabled: {
      type: Boolean,
      default: true,
    },
    aiProvider: {
      type: String,
      enum: ['auto', 'gemini', 'groq'],
      default: 'auto',
    },
    geminiApiKey: {
      type: String,
      default: '',
      trim: true,
    },
    groqApiKey: {
      type: String,
      default: '',
      trim: true,
    },
    aiSystemPrompt: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

module.exports = SystemSetting;
