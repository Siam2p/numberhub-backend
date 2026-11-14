const { User, PhoneNumber, Assignment, Message, AuditLog, SystemSetting } = require('../models');
const numberService = require('../services/numberService');
const { getBotStatus } = require('../bot');
const { getProvider } = require('../providers');
const config = require('../config');
const { logAuditEvent } = require('../utils/auditLogger');

class AdminController {
  async getDashboard(req, res, next) {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Aggregations and counts in parallel
      const [
        totalUsers,
        activeUsers,
        totalNumbers,
        availableNumbers,
        assignedNumbers,
        todayMessages,
        recentAssignments,
        recentMessages,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isBlocked: false }),
        PhoneNumber.countDocuments(),
        PhoneNumber.countDocuments({ status: 'available' }),
        PhoneNumber.countDocuments({ status: 'assigned' }),
        Message.countDocuments({ receivedAt: { $gte: todayStart } }),
        Assignment.find()
          .populate('userId', 'telegramId username firstName')
          .populate('phoneNumberId', 'number')
          .sort({ startedAt: -1 })
          .limit(5)
          .lean(),
        Message.find()
          .populate({
            path: 'assignmentId',
            populate: { path: 'userId', select: 'telegramId username firstName' },
          })
          .sort({ receivedAt: -1 })
          .limit(5)
          .lean(),
      ]);

      // Last 7 days metrics for chart
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const [dailyAssignments, dailyMessages] = await Promise.all([
        Assignment.aggregate([
          { $match: { startedAt: { $gte: sevenDaysAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
              count: { $sum: 1 },
            },
          },
        ]),
        Message.aggregate([
          { $match: { receivedAt: { $gte: sevenDaysAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt' } },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const dailyAssignmentMap = dailyAssignments.reduce((acc, cur) => {
        acc[cur._id] = cur.count;
        return acc;
      }, {});

      const dailyMessageMap = dailyMessages.reduce((acc, cur) => {
        acc[cur._id] = cur.count;
        return acc;
      }, {});

      const chartData = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgo);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
        chartData.push({
          date: dateStr,
          day: dayLabel,
          assignments: dailyAssignmentMap[dateStr] || 0,
          messages: dailyMessageMap[dateStr] || 0,
        });
      }

      res.status(200).json({
        success: true,
        stats: {
          totalUsers,
          activeUsers,
          totalNumbers,
          availableNumbers,
          assignedNumbers,
          todayMessages,
        },
        chartData,
        recentActivity: {
          assignments: recentAssignments,
          messages: recentMessages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async syncNumbers(req, res, next) {
    try {
      const { countryCode } = req.body || {};
      const result = await numberService.syncInventory(countryCode);

      await logAuditEvent({
        req,
        action: 'SYNC_INVENTORY',
        targetType: 'Inventory',
        details: result,
      });

      res.status(200).json({
        success: true,
        message: `Inventory sync complete. Added ${result.newNumbersAdded} new numbers.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAuditLogs(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const [logs, total] = await Promise.all([
        AuditLog.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit, 10))
          .lean(),
        AuditLog.countDocuments(),
      ]);

      res.status(200).json({
        success: true,
        logs,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: Math.ceil(total / parseInt(limit, 10)) || 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getSettings(req, res, next) {
    try {
      const provider = getProvider();
      const botStatus = getBotStatus();

      res.status(200).json({
        success: true,
        settings: {
          provider: {
            name: provider.name,
            type: config.smsProvider,
            hasApiKey: Boolean(config.smsProviderApiKey),
            hasWebhookSecret: Boolean(config.smsProviderWebhookSecret),
          },
          bot: {
            configured: botStatus.configured,
            running: botStatus.running,
          },
          retention: {
            days: config.retentionDays,
          },
          environment: config.nodeEnv,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPaymentSettings(req, res, next) {
    try {
      let setting = await SystemSetting.findOne({ key: 'payment_config' });
      if (!setting) {
        setting = await SystemSetting.create({
          key: 'payment_config',
          binancePayId: process.env.BINANCE_PAY_ID || '987654321',
          binanceUid: process.env.BINANCE_UID || '876543210',
          binanceAddress: process.env.BINANCE_USDT_ADDRESS || 'TYDzsYndWh2EzfNgPv5smvWgkBFqRmsBgp',
          payeeName: process.env.BINANCE_PAYEE_NAME || 'NumberHub Pay',
          network: 'TRC20 / BEP20',
          instructions: 'Send exact USDT to the Binance Pay ID, UID, or Address above, then tap Submit Binance Pay ID / TxID.',
          adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '',
          minDeposit: 0.5,
          smsProvider: process.env.SMS_PROVIDER || 'decider',
          fiveSimApiKey: process.env.FIVESIM_API_KEY || '',
        });
      }
      res.status(200).json({ success: true, paymentSettings: setting });
    } catch (error) {
      next(error);
    }
  }

  async updatePaymentSettings(req, res, next) {
    try {
      const {
        binancePayId,
        binanceUid,
        binanceAddress,
        payeeName,
        network,
        instructions,
        adminTelegramId,
        minDeposit,
        smsProvider,
        fiveSimApiKey,
      } = req.body;

      const update = {
        binancePayId,
        binanceUid,
        binanceAddress,
        payeeName,
        network,
        instructions,
        adminTelegramId,
        minDeposit: Number(minDeposit) || 0.5,
      };

      if (smsProvider) {
        update.smsProvider = smsProvider;
        try {
          const { setProvider } = require('../providers');
          setProvider(null);
        } catch (_) {}
      }
      if (fiveSimApiKey !== undefined) update.fiveSimApiKey = fiveSimApiKey;
      if (req.body.aiEnabled !== undefined) update.aiEnabled = Boolean(req.body.aiEnabled);
      if (req.body.aiProvider !== undefined) update.aiProvider = req.body.aiProvider;
      if (req.body.geminiApiKey !== undefined) update.geminiApiKey = req.body.geminiApiKey;
      if (req.body.groqApiKey !== undefined) update.groqApiKey = req.body.groqApiKey;
      if (req.body.aiSystemPrompt !== undefined) update.aiSystemPrompt = req.body.aiSystemPrompt;

      const setting = await SystemSetting.findOneAndUpdate(
        { key: 'payment_config' },
        { $set: update },
        { new: true, upsert: true }
      );

      await logAuditEvent({
        req,
        action: 'UPDATE_PAYMENT_CONFIG',
        targetType: 'SystemSetting',
        details: update,
      });

      res.status(200).json({
        success: true,
        message: 'Payment settings updated successfully.',
        paymentSettings: setting,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
