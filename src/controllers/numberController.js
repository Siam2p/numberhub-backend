const numberService = require('../services/numberService');
const messageService = require('../services/messageService');
const { getProvider } = require('../providers');
const { logAuditEvent } = require('../utils/auditLogger');

class NumberController {
  async getNumbers(req, res, next) {
    try {
      const { page, limit, status, countryId, search } = req.query;
      const result = await numberService.listNumbers({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        status,
        countryId,
        search,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getNumberById(req, res, next) {
    try {
      const number = await numberService.getNumberById(req.params.id);
      if (!number) {
        return res.status(404).json({ success: false, message: 'Phone number not found.' });
      }

      res.status(200).json({
        success: true,
        number,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAvailable(req, res, next) {
    try {
      const { countryCode, limit } = req.query;
      const numbers = await numberService.getAvailableNumbers({
        countryCode,
        limit: limit ? parseInt(limit, 10) : 50,
      });

      res.status(200).json({
        success: true,
        numbers,
      });
    } catch (error) {
      next(error);
    }
  }

  async createNumber(req, res, next) {
    try {
      const number = await numberService.addAuthorizedNumber(req.body);

      await logAuditEvent({
        req,
        action: 'ADD_NUMBER',
        targetType: 'PhoneNumber',
        targetId: number._id,
        details: { number: number.number, countryId: number.countryId },
      });

      res.status(201).json({
        success: true,
        number,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Simulate or send an OTP to a designated number
   */
  async simulateOtp(req, res, next) {
    try {
      const { number, service = 'whatsapp', otp } = req.body;
      if (!number) {
        return res.status(400).json({ success: false, message: 'Phone number is required.' });
      }

      const provider = getProvider();
      const targetService = (service || 'whatsapp').toLowerCase();
      const generatedOtp = otp
        ? { code: otp, message: `Your ${targetService === 'whatsapp' ? 'WhatsApp' : 'Telegram'} code is: ${otp}. Do not share this code.` }
        : provider.generateOtp(targetService);

      const result = await messageService.processInboundMessage({
        from: targetService === 'whatsapp' ? 'WhatsApp' : 'Telegram',
        to: number,
        body: generatedOtp.message,
        receivedAt: new Date(),
      });

      res.status(200).json({
        success: true,
        otp: generatedOtp.code,
        message: generatedOtp.message,
        result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NumberController();
