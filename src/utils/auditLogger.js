const { AuditLog } = require('../models');

const logAuditEvent = async ({
  req,
  admin,
  action,
  targetType,
  targetId = '',
  details = {},
}) => {
  try {
    const adminId = admin?._id || req?.admin?._id;
    const adminEmail = admin?.email || req?.admin?.email || 'system';
    const ipAddress =
      req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || '';

    await AuditLog.create({
      adminId,
      adminEmail,
      action,
      targetType,
      targetId: String(targetId),
      details,
      ipAddress: String(ipAddress),
    });
  } catch (error) {
    console.error('[AuditLog] Failed to record event:', error.message);
  }
};

module.exports = { logAuditEvent };
