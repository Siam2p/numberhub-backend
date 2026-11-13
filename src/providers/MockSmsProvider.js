const crypto = require('crypto');
const BaseProvider = require('./BaseProvider');
const config = require('../config');

class MockSmsProvider extends BaseProvider {
  constructor() {
    super('MockSmsProvider');
    this.webhookSecret = config.smsProviderWebhookSecret || 'mock-webhook-secret';
  }

  async getCountries() {
    return [
      { code: 'US', name: 'United States', dialCode: '+1' },
      { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
      { code: 'CA', name: 'Canada', dialCode: '+1' },
      { code: 'DE', name: 'Germany', dialCode: '+49' },
      { code: 'NL', name: 'Netherlands', dialCode: '+31' },
      { code: 'FR', name: 'France', dialCode: '+33' },
    ];
  }

  async getAvailableNumbers(countryCode) {
    const code = (countryCode || 'US').toUpperCase();
    const prefixes = {
      US: '+12025550',
      GB: '+447700900',
      CA: '+14165550',
      DE: '+491512345',
      NL: '+31612345',
      FR: '+33612345',
    };

    const prefix = prefixes[code] || '+12025550';
    return [1, 2, 3, 4, 5].map((idx) => {
      const suffix = String(100 + idx);
      const number = `${prefix}${suffix}`;
      return {
        providerNumberId: `mock-${code.toLowerCase()}-${suffix}`,
        number,
        capabilities: ['sms'],
      };
    });
  }

  async assignNumber(providerNumberId) {
    return {
      success: true,
      providerNumberId,
      assignedAt: new Date(),
    };
  }

  async releaseNumber(providerNumberId) {
    return {
      success: true,
      providerNumberId,
      releasedAt: new Date(),
    };
  }

  /**
   * Verifies signature from provider webhook
   * Checks both HMAC-SHA256 signature and shared secret header
   */
  verifyWebhook(req) {
    // 1. Direct secret header check
    const headerSecret = req.headers['x-webhook-secret'] || req.headers['x-provider-secret'];
    if (headerSecret && headerSecret === this.webhookSecret) {
      return true;
    }

    // 2. HMAC signature check if signature header provided
    const signature = req.headers['x-provider-signature'];
    if (signature && req.rawBody) {
      const expectedSig = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(req.rawBody)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    }

    // Allow in test environment if explicitly set
    if (config.nodeEnv === 'test') {
      return true;
    }

    return false;
  }

  /**
   * Normalizes incoming webhook body
   */
  parseIncomingMessage(req) {
    const body = req.body || {};
    const providerMessageId = body.messageId || body.id || body.smsId || `mock_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const from = body.from || body.sender || 'Unknown';
    const to = body.to || body.recipient || '';
    const text = body.body || body.text || body.message || '';
    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();

    if (!to || !text) {
      throw new Error('Invalid webhook payload: Missing recipient (to) or message content (body)');
    }

    return {
      providerMessageId,
      from,
      to,
      body: text,
      timestamp,
    };
  }
}

module.exports = MockSmsProvider;
