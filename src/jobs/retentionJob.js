const cron = require('node-cron');
const { Assignment, PhoneNumber } = require('../models');
const messageService = require('../services/messageService');

const expireOverdueAssignments = async () => {
  try {
    const now = new Date();
    const expiredAssignments = await Assignment.find({
      status: 'active',
      expiresAt: { $lte: now },
    });

    if (expiredAssignments.length === 0) return;

    console.log(`[Job] Found ${expiredAssignments.length} overdue assignments to expire.`);

    for (const assignment of expiredAssignments) {
      assignment.status = 'expired';
      assignment.releasedAt = now;
      assignment.releasedReason = 'expired';
      await assignment.save();

      // Return phone number to available status
      await PhoneNumber.findByIdAndUpdate(assignment.phoneNumberId, {
        $set: { status: 'available', currentAssignmentId: null },
      });
    }

    console.log(`[Job] Successfully processed ${expiredAssignments.length} expired assignments.`);
  } catch (error) {
    console.error('[Job] Error processing overdue assignments:', error);
  }
};

const runRetentionCleanup = async () => {
  try {
    await messageService.cleanupExpiredMessages();
  } catch (error) {
    console.error('[Job] Error running retention cleanup:', error);
  }
};

const startRetentionJobs = () => {
  // Run every 10 minutes: "*/10 * * * *"
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Job] Running periodic assignment expiration check...');
    await expireOverdueAssignments();
  });

  // Run once daily at 02:00 AM: "0 2 * * *"
  cron.schedule('0 2 * * *', async () => {
    console.log('[Job] Running message retention policy cleanup...');
    await runRetentionCleanup();
  });

  console.log('[Job] Scheduled background retention and expiration tasks.');
};

module.exports = {
  startRetentionJobs,
  expireOverdueAssignments,
  runRetentionCleanup,
};
