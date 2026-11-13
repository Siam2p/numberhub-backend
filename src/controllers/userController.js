const userService = require('../services/userService');
const { User, Assignment, Payment, Message } = require('../models');
const { logAuditEvent } = require('../utils/auditLogger');

class UserController {
  async getUsers(req, res, next) {
    try {
      const { page, limit, search, isBlocked } = req.query;
      const parsedIsBlocked =
        isBlocked === 'true' ? true : isBlocked === 'false' ? false : undefined;

      const result = await userService.listUsers({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        search,
        isBlocked: parsedIsBlocked,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req, res, next) {
    try {
      const user = await userService.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserHistory(req, res, next) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const [assignments, payments] = await Promise.all([
        Assignment.find({ userId: user._id })
          .populate('phoneNumberId')
          .sort({ startedAt: -1 })
          .limit(30)
          .lean(),
        Payment.find({ userId: user._id })
          .sort({ createdAt: -1 })
          .limit(30)
          .lean(),
      ]);

      res.status(200).json({
        success: true,
        user,
        history: {
          assignments,
          payments,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const { adminNotes, balance, role } = req.body;

      const updateData = {};
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
      if (balance !== undefined) updateData.balance = Number(balance);
      if (role !== undefined) updateData.role = role;

      const user = await User.findByIdAndUpdate(id, { $set: updateData }, { new: true });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      await logAuditEvent({
        req,
        action: 'UPDATE_USER_PROFILE',
        targetType: 'User',
        targetId: user._id,
        details: updateData,
      });

      res.status(200).json({
        success: true,
        message: 'User profile updated successfully.',
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async blockUser(req, res, next) {
    try {
      const { id } = req.params;
      const { isBlocked, reason } = req.body;

      if (typeof isBlocked !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Field "isBlocked" must be a boolean.',
        });
      }

      const user = await userService.setUserBlockStatus(id, isBlocked, reason);

      await logAuditEvent({
        req,
        action: isBlocked ? 'BLOCK_USER' : 'UNBLOCK_USER',
        targetType: 'User',
        targetId: user._id,
        details: { telegramId: user.telegramId, reason },
      });

      res.status(200).json({
        success: true,
        message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully.`,
        user,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
