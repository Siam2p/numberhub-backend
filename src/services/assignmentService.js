const { Assignment, PhoneNumber, Country, User } = require('../models');
const { getProvider } = require('../providers');

class AssignmentService {
  /**
   * Assign an available number to a user with atomic lock
   */
  async assignNumber(userId, phoneNumberId, durationHours = 24, service = 'whatsapp') {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found.');
    }
    if (user.isBlocked) {
      throw new Error(`User account is blocked: ${user.blockedReason || 'Terms violation'}`);
    }

    // Atomic status update on PhoneNumber
    const updatedNumber = await PhoneNumber.findOneAndUpdate(
      { _id: phoneNumberId, status: 'available' },
      { $set: { status: 'assigned' } },
      { new: true }
    );

    if (!updatedNumber) {
      throw new Error('The selected phone number is no longer available. Please select another number.');
    }

    try {
      const provider = getProvider();
      if (updatedNumber.providerNumberId) {
        await provider.assignNumber(updatedNumber.providerNumberId);
      }

      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
      const assignment = await Assignment.create({
        userId: user._id,
        phoneNumberId: updatedNumber._id,
        service,
        status: 'active',
        startedAt: new Date(),
        expiresAt,
      });

      updatedNumber.currentAssignmentId = assignment._id;
      await updatedNumber.save();

      return await Assignment.findById(assignment._id)
        .populate('userId', 'telegramId username firstName lastName')
        .populate({
          path: 'phoneNumberId',
          populate: { path: 'countryId', select: 'name code flag dialCode' },
        });
    } catch (err) {
      await PhoneNumber.findByIdAndUpdate(phoneNumberId, {
        $set: { status: 'available', currentAssignmentId: null },
      });
      throw err;
    }
  }

  /**
   * Assign a batch of 3 numbers for WhatsApp or Telegram
   * Bypasses payment system entirely (Free mode as requested)
   * If existing numbers in pool are insufficient, uses DeciderProvider to dynamically provision them.
   */
  async assignBatch(userId, countryCode = 'EC', service = 'whatsapp', count = 3) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found.');
    }
    if (user.isBlocked) {
      throw new Error(`User account is blocked: ${user.blockedReason || 'Terms violation'}`);
    }

    // Release any previous active batch for clean state if desired
    if (user.activeBatchId) {
      await this.releaseBatch(user._id, user.activeBatchId).catch(() => {});
    }

    const code = (countryCode || 'EC').toUpperCase();
    let country = await Country.findOne({ code });
    if (!country) {
      // Find or create country if missing
      const provider = getProvider();
      const cConfig = provider.getCountryConfig(code);
      country = await Country.create({
        name: cConfig.name,
        code: cConfig.code,
        dialCode: cConfig.dialCode,
        flag: cConfig.flag,
        isActive: true,
      });
    }

    // 1. Look for available numbers in DB (matches WhatsApp/Telegram or any available in fleet)
    let availableNumbers = await PhoneNumber.find({
      countryId: country._id,
      status: 'available',
      $or: [
        { supportedServices: service.toLowerCase() },
        { capabilities: service.toLowerCase() },
        { supportedServices: { $exists: false } },
        { supportedServices: { $size: 0 } },
      ],
    }).limit(count);

    // 2. If fewer than needed, query provider with graceful fallback
    if (availableNumbers.length < count) {
      const needed = count - availableNumbers.length;
      const provider = getProvider();
      let newNumbers = [];
      try {
        newNumbers = await provider.getAvailableNumbers(country.code, service, needed);
      } catch (providerErr) {
        console.warn(`[Assignment] Provider ${provider.name} failed (${providerErr.message}). Falling back to Decider provider.`);
        const DeciderProvider = require('../providers/DeciderProvider');
        const fallbackProvider = new DeciderProvider();
        newNumbers = await fallbackProvider.getAvailableNumbers(country.code, service, needed);
      }

      for (const item of newNumbers) {
        let phone = await PhoneNumber.findOne({ number: item.number });
        if (!phone) {
          phone = await PhoneNumber.create({
            number: item.number,
            countryId: country._id,
            provider: 'decider',
            providerNumberId: item.providerNumberId,
            capabilities: ['sms', service.toLowerCase()],
            supportedServices: ['whatsapp', 'telegram'],
            status: 'available',
          });
        } else {
          phone.status = 'available';
          phone.currentAssignmentId = null;
          await phone.save();
        }
        availableNumbers.push(phone);
      }
    }

    // Limit to exactly count (3)
    const numbersToAssign = availableNumbers.slice(0, count);
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const assignments = [];

    for (const phone of numbersToAssign) {
      // Atomically set status
      phone.status = 'assigned';
      phone.lastOtp = null;
      phone.lastOtpReceivedAt = null;
      phone.lastOtpBody = null;
      await phone.save();

      const assignment = await Assignment.create({
        userId: user._id,
        phoneNumberId: phone._id,
        service: service.toLowerCase(),
        batchId,
        status: 'active',
        startedAt: new Date(),
        expiresAt,
      });

      phone.currentAssignmentId = assignment._id;
      await phone.save();

      assignments.push(assignment);
    }

    // Update user active batch
    user.activeBatchId = batchId;
    user.selectedCountryCode = country.code;
    user.selectedService = service.toLowerCase();
    await user.save();

    // Re-query populated
    return this.getActiveBatch(user._id, batchId);
  }

  /**
   * Get all active assignments in a batch
   */
  async getActiveBatch(userId, batchId = null) {
    const query = { userId, status: 'active' };
    if (batchId) {
      query.batchId = batchId;
    }
    return Assignment.find(query)
      .populate({
        path: 'phoneNumberId',
        populate: { path: 'countryId', select: 'name code flag dialCode' },
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  /**
   * Update or link Telegram message ID to batch assignments
   */
  async attachTelegramMessage(batchId, chatId, messageId) {
    if (!batchId) return;
    await Assignment.updateMany(
      { batchId },
      { $set: { telegramChatId: String(chatId), telegramMessageId: Number(messageId) } }
    );
  }

  /**
   * Record received OTP for a phone number or assignment
   */
  async recordOtpForNumber(numberOrAssignmentId, otpCode, rawBody = '') {
    const cleanNumber = typeof numberOrAssignmentId === 'string'
      ? numberOrAssignmentId.replace(/\s+/g, '').trim()
      : '';

    let assignment = null;
    let phone = null;

    if (cleanNumber.startsWith('+') || /^\d+$/.test(cleanNumber)) {
      phone = await PhoneNumber.findOne({ number: cleanNumber });
      if (phone) {
        assignment = await Assignment.findOne({
          phoneNumberId: phone._id,
          status: 'active',
        }).populate({
          path: 'phoneNumberId',
          populate: { path: 'countryId', select: 'name code flag dialCode' },
        });
      }
    } else {
      assignment = await Assignment.findById(numberOrAssignmentId).populate({
        path: 'phoneNumberId',
        populate: { path: 'countryId', select: 'name code flag dialCode' },
      });
      if (assignment) {
        phone = await PhoneNumber.findById(assignment.phoneNumberId);
      }
    }

    if (!assignment) {
      return { success: false, reason: 'assignment_not_found' };
    }

    const now = new Date();
    assignment.lastOtp = otpCode;
    assignment.lastOtpReceivedAt = now;
    assignment.lastOtpBody = rawBody;
    await assignment.save();

    if (phone) {
      phone.lastOtp = otpCode;
      phone.lastOtpReceivedAt = now;
      phone.lastOtpBody = rawBody;
      await phone.save();
    }

    return {
      success: true,
      assignment,
      phone,
      batchId: assignment.batchId,
      telegramChatId: assignment.telegramChatId,
      telegramMessageId: assignment.telegramMessageId,
    };
  }

  /**
   * Release an entire batch
   */
  async releaseBatch(userId, batchId) {
    const assignments = await Assignment.find({ userId, batchId, status: 'active' });
    for (const a of assignments) {
      a.status = 'released';
      a.releasedAt = new Date();
      a.releasedReason = 'user_released';
      await a.save();

      await PhoneNumber.findByIdAndUpdate(a.phoneNumberId, {
        $set: { status: 'available', currentAssignmentId: null },
      });
    }

    await User.findByIdAndUpdate(userId, { $set: { activeBatchId: null } });
    return { success: true, count: assignments.length };
  }

  /**
   * Release an active assignment
   */
  async releaseAssignment(assignmentId, { reason = 'user_released', userId = null } = {}) {
    const query = { _id: assignmentId, status: 'active' };
    if (userId) {
      query.userId = userId;
    }

    const assignment = await Assignment.findOne(query);
    if (!assignment) {
      throw new Error('Active assignment not found or already released.');
    }

    assignment.status = 'released';
    assignment.releasedAt = new Date();
    assignment.releasedReason = reason;
    await assignment.save();

    const phone = await PhoneNumber.findByIdAndUpdate(
      assignment.phoneNumberId,
      {
        $set: { status: 'available', currentAssignmentId: null },
      },
      { new: true }
    );

    if (phone && phone.providerNumberId) {
      const provider = getProvider();
      await provider.releaseNumber(phone.providerNumberId).catch((e) => {
        console.warn(`[Assignment] Provider release notice failed: ${e.message}`);
      });
    }

    return assignment;
  }

  async getActiveAssignmentsForUser(userId) {
    return Assignment.find({ userId, status: 'active' })
      .populate({
        path: 'phoneNumberId',
        populate: { path: 'countryId', select: 'name code flag dialCode' },
      })
      .sort({ startedAt: -1 })
      .lean();
  }

  async getAssignmentHistoryForUser(userId, limit = 20) {
    return Assignment.find({ userId })
      .populate({
        path: 'phoneNumberId',
        populate: { path: 'countryId', select: 'name code flag dialCode' },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async getAssignmentById(id) {
    return Assignment.findById(id)
      .populate('userId', 'telegramId username firstName lastName')
      .populate({
        path: 'phoneNumberId',
        populate: { path: 'countryId', select: 'name code flag dialCode' },
      });
  }

  async listAssignments({ page = 1, limit = 20, status, userId, search } = {}) {
    const query = {};
    if (status) query.status = status;
    if (userId) query.userId = userId;

    const skip = (page - 1) * limit;
    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate('userId', 'telegramId username firstName lastName')
        .populate({
          path: 'phoneNumberId',
          populate: { path: 'countryId', select: 'name code flag dialCode' },
        })
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    return {
      assignments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

module.exports = new AssignmentService();
