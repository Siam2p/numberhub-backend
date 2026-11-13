const { Message, Assignment, PhoneNumber } = require('../models');
const config = require('../config');
const { getProvider } = require('../providers');
const assignmentService = require('./assignmentService');

class MessageService {
  /**
   * Process inbound authorized SMS / OTP
   */
  async processInboundMessage({ providerMessageId, from, to, body, receivedAt = new Date() }) {
    // 1. Normalize recipient phone number
    const normalizedTo = to.replace(/\s+/g, '').trim();

    // 2. Locate phone number in inventory
    const phone = await PhoneNumber.findOne({ number: normalizedTo });
    if (!phone) {
      console.warn(`[SMS] Received message for unregistered number: ${normalizedTo}`);
      return { success: false, reason: 'unregistered_number' };
    }

    // 3. Find active assignment for this phone number
    const assignment = await Assignment.findOne({
      phoneNumberId: phone._id,
      status: 'active',
    }).populate('userId');

    if (!assignment) {
      console.warn(`[SMS] Number ${normalizedTo} received SMS but has no active assignment.`);
      return { success: false, reason: 'no_active_assignment' };
    }

    // 4. Duplicate message check
    if (providerMessageId) {
      const existingMsg = await Message.findOne({ providerMessageId });
      if (existingMsg) {
        console.log(`[SMS] Duplicate webhook ignored for message ID: ${providerMessageId}`);
        return { success: true, duplicate: true, message: existingMsg };
      }
    }

    // 5. Calculate data retention expiration
    const retentionDays = config.retentionDays || 7;
    const retentionExpiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    // 6. Extract OTP code if present
    const provider = getProvider();
    const otpCode = provider.extractOtp ? provider.extractOtp(body) : null;

    // 7. Store message securely
    const message = await Message.create({
      assignmentId: assignment._id,
      providerMessageId,
      from,
      to: normalizedTo,
      body,
      receivedAt,
      retentionExpiresAt,
    });

    console.log(`[SMS] Stored incoming message ${message._id} for number ${normalizedTo}`);

    // 8. Record OTP onto Assignment and PhoneNumber
    if (otpCode) {
      await assignmentService.recordOtpForNumber(normalizedTo, otpCode, body);
    }

    // 9. Dispatch notification & update Telegram UI in real-time
    let notified = false;
    try {
      const { notifyUserNewMessage, updateBatchMessageWithOtp } = require('../bot');

      // Update 3-numbers card message if telegramChatId & telegramMessageId exist
      if (otpCode && assignment.telegramChatId && assignment.telegramMessageId) {
        await updateBatchMessageWithOtp({
          chatId: assignment.telegramChatId,
          messageId: assignment.telegramMessageId,
          batchId: assignment.batchId,
          updatedNumber: normalizedTo,
          otpCode,
        });
      }

      // Also deliver direct push message
      if (assignment.userId && assignment.userId.telegramId) {
        await notifyUserNewMessage(assignment.userId.telegramId, {
          from,
          to: normalizedTo,
          body,
          otpCode,
          receivedAt,
          assignmentId: assignment._id,
          service: assignment.service,
        });
        notified = true;
      }
    } catch (notifErr) {
      console.error(`[SMS] Failed to send Telegram notification/update: ${notifErr.message}`);
    }

    return {
      success: true,
      duplicate: false,
      message,
      otpCode,
      notified,
      userTelegramId: assignment.userId?.telegramId,
    };
  }

  async getMessagesForAssignment(assignmentId) {
    return Message.find({ assignmentId }).sort({ receivedAt: -1 }).lean();
  }

  async getMessagesForUser(userId, limit = 50) {
    const assignments = await Assignment.find({ userId }).select('_id');
    const assignmentIds = assignments.map((a) => a._id);

    return Message.find({ assignmentId: { $in: assignmentIds } })
      .populate({
        path: 'assignmentId',
        populate: { path: 'phoneNumberId', select: 'number' },
      })
      .sort({ receivedAt: -1 })
      .limit(limit)
      .lean();
  }

  async listMessages({ page = 1, limit = 20, assignmentId, search } = {}) {
    const query = {};
    if (assignmentId) query.assignmentId = assignmentId;
    if (search) {
      query.$or = [{ to: { $regex: search, $options: 'i' } }, { body: { $regex: search, $options: 'i' } }];
    }

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      Message.find(query)
        .populate({
          path: 'assignmentId',
          populate: [
            { path: 'userId', select: 'telegramId username firstName lastName' },
            { path: 'phoneNumberId', select: 'number' },
          ],
        })
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments(query),
    ]);

    return {
      messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

module.exports = new MessageService();
