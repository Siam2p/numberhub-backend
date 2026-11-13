const { getProvider } = require('../providers');
const messageService = require('../services/messageService');

class WebhookController {
  async handleSmsWebhook(req, res, next) {
    try {
      const provider = getProvider();

      // 1. Webhook Signature / Secret Verification
      const isValid = provider.verifyWebhook(req);
      if (!isValid) {
        console.warn('[Webhook] Rejected webhook request with invalid signature or secret.');
        return res.status(401).json({
          success: false,
          message: 'Webhook signature verification failed.',
        });
      }

      // 2. Parse and normalize incoming message
      const parsedData = provider.parseIncomingMessage(req);

      // 3. Process inbound message
      const result = await messageService.processInboundMessage(parsedData);

      if (!result.success && result.reason === 'unregistered_number') {
        return res.status(404).json({
          success: false,
          message: 'Recipient number is not an authorized service number.',
        });
      }

      if (!result.success && result.reason === 'no_active_assignment') {
        return res.status(200).json({
          success: true,
          status: 'ignored_unassigned_number',
        });
      }

      res.status(200).json({
        success: true,
        status: result.duplicate ? 'duplicate_ignored' : 'processed',
        messageId: result.message?._id,
        notifiedUser: result.notified,
      });
    } catch (error) {
      console.error('[Webhook] Inbound processing error:', error.message);
      res.status(400).json({
        success: false,
        message: error.message || 'Error processing webhook payload.',
      });
    }
  }
}

module.exports = new WebhookController();
