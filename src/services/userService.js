const { User } = require('../models');

class UserService {
  /**
   * Find or create user from Telegram context
   */
  async findOrCreateTelegramUser(from) {
    if (!from || !from.id) {
      throw new Error('Invalid Telegram user context');
    }

    const telegramId = from.id.toString();
    const update = {
      username: from.username || '',
      firstName: from.first_name || '',
      lastName: from.last_name || '',
      lastActivityAt: new Date(),
    };

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: update, $setOnInsert: { role: 'user', isBlocked: false } },
      { new: true, upsert: true }
    );

    return user;
  }

  async getUserByTelegramId(telegramId) {
    return User.findOne({ telegramId: telegramId.toString() });
  }

  async getUserById(id) {
    return User.findById(id);
  }

  async listUsers({ page = 1, limit = 20, search = '', isBlocked } = {}) {
    const query = {};
    if (typeof isBlocked === 'boolean') {
      query.isBlocked = isBlocked;
    }
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { telegramId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
    ]);

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async setUserBlockStatus(userId, isBlocked, reason = '') {
    const user = await User.findByIdAndUpdate(
      userId,
      { isBlocked, blockedReason: isBlocked ? reason : '' },
      { new: true }
    );
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
}

module.exports = new UserService();
