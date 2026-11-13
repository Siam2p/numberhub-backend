const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    phoneNumberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PhoneNumber',
      required: true,
      index: true,
    },
    service: {
      type: String,
      enum: ['whatsapp', 'telegram', 'general'],
      default: 'whatsapp',
      index: true,
    },
    batchId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'released', 'expired'],
      default: 'active',
      index: true,
    },
    lastOtp: {
      type: String,
      default: null,
    },
    lastOtpReceivedAt: {
      type: Date,
      default: null,
    },
    lastOtpBody: {
      type: String,
      default: null,
    },
    telegramMessageId: {
      type: Number,
      default: null,
    },
    telegramChatId: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // Default 24 hours active rental
      index: true,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releasedReason: {
      type: String,
      enum: ['user_released', 'expired', 'admin_revoked', 'number_maintenance'],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Optimize query for active user assignments & active number lookup
assignmentSchema.index({ userId: 1, status: 1 });
assignmentSchema.index({ phoneNumberId: 1, status: 1 });
assignmentSchema.index({ batchId: 1, status: 1 });

const Assignment = mongoose.model('Assignment', assignmentSchema);

module.exports = Assignment;
