const mongoose = require('mongoose');

const phoneNumberSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    countryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Country',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      default: 'decider',
      trim: true,
    },
    providerNumberId: {
      type: String,
      default: '',
      trim: true,
    },
    capabilities: {
      type: [String],
      default: ['sms', 'whatsapp', 'telegram'],
    },
    supportedServices: {
      type: [String],
      default: ['whatsapp', 'telegram'],
      index: true,
    },
    status: {
      type: String,
      enum: ['available', 'assigned', 'suspended', 'maintenance'],
      default: 'available',
      index: true,
    },
    currentAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      default: null,
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
  },
  {
    timestamps: true,
  }
);

// Compound index for querying available numbers in a country for specific services
phoneNumberSchema.index({ countryId: 1, status: 1 });
phoneNumberSchema.index({ status: 1, supportedServices: 1 });

const PhoneNumber = mongoose.model('PhoneNumber', phoneNumberSchema);

module.exports = PhoneNumber;
