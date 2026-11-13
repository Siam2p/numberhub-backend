const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      default: '',
    },
    firstName: {
      type: String,
      trim: true,
      default: '',
    },
    lastName: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    blockedReason: {
      type: String,
      default: '',
    },
    selectedCountryCode: {
      type: String,
      default: 'EC',
      uppercase: true,
      trim: true,
    },
    selectedService: {
      type: String,
      enum: ['whatsapp', 'telegram'],
      default: 'whatsapp',
    },
    activeBatchId: {
      type: String,
      default: null,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDeposited: {
      type: Number,
      default: 0,
    },
    adminNotes: {
      type: String,
      default: '',
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.displayName = function () {
  if (this.firstName && this.lastName) return `${this.firstName} ${this.lastName}`;
  if (this.firstName) return this.firstName;
  if (this.username) return `@${this.username}`;
  return `User ${this.telegramId}`;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
