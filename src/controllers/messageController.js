const messageService = require('../services/messageService');
const { Message } = require('../models');

class MessageController {
  async getMessages(req, res, next) {
    try {
      const { page, limit, search, assignmentId } = req.query;
      const result = await messageService.listMessages({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        search,
        assignmentId,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMessageById(req, res, next) {
    try {
      const message = await Message.findById(req.params.id).populate({
        path: 'assignmentId',
        populate: [
          { path: 'userId', select: 'telegramId username firstName lastName' },
          { path: 'phoneNumberId', select: 'number countryId' },
        ],
      });

      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found.' });
      }

      res.status(200).json({
        success: true,
        message,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MessageController();
