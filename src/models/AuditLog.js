const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: false,
    },
    adminEmail: {
      type: String,
      default: 'system',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true, // e.g., 'User', 'PhoneNumber', 'Assignment', 'Country', 'System'
    },
    targetId: {
      type: String,
      default: '',
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
