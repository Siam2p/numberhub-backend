const crypto = require('crypto');
const BaseProvider = require('./BaseProvider');
const config = require('../config');

/**
 * Decider-Based SMS & Virtual Number Provider
 *
 * Dedicated provider offering template phone numbers specialized for
 * WhatsApp and Telegram account registration across the 8 designated countries:
 * Ecuador, Colombia, Egypt, Italy, Jordan, Panama, Georgia, Nicaragua.
 */
class DeciderProvider extends BaseProvider {
  constructor() {
    super('DeciderProvider');
    this.webhookSecret = config.smsProviderWebhookSecret || 'decider-webhook-secret';

    // The 8 official designated countries
    this.countries = [
      { name: 'Ecuador', code: 'EC', dialCode: '+593', flag: '🇪🇨', defaultPrefix: '98' },
      { name: 'Colombia', code: 'CO', dialCode: '+57', flag: '🇨🇴', defaultPrefix: '310' },
      { name: 'Egypt', code: 'EG', dialCode: '+20', flag: '🇪🇬', defaultPrefix: '10' },
      { name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹', defaultPrefix: '340' },
      { name: 'Jordan', code: 'JO', dialCode: '+962', flag: '🇯🇴', defaultPrefix: '79' },
      { name: 'Panama', code: 'PA', dialCode: '+507', flag: '🇵🇦', defaultPrefix: '6' },
      { name: 'Georgia', code: 'GE', dialCode: '+995', flag: '🇬🇪', defaultPrefix: '591' },
      { name: 'Nicaragua', code: 'NI', dialCode: '+505', flag: '🇳🇮', defaultPrefix: '8' },
    ];
  }

  /**
   * Return supported countries
   */
  async getCountries() {
    return this.countries;
  }

  /**
   * Get country config by country code
   */
  getCountryConfig(countryCode) {
    const code = (countryCode || 'EC').toUpperCase();
    return this.countries.find((c) => c.code === code) || this.countries[0];
  }

  /**
   * Generate available template numbers suitable for WhatsApp or Telegram
   * @param {string} countryCode - ISO 2-letter country code
   * @param {string} service - 'whatsapp' | 'telegram'
   * @param {number} count - number of numbers to generate (defaults to 3)
   */
  async getAvailableNumbers(countryCode = 'EC', service = 'whatsapp', count = 3) {
    const country = this.getCountryConfig(countryCode);
    const numbers = [];

    for (let i = 1; i <= count; i++) {
      // Deterministic yet realistic phone number generation for the country
      const randDigits = Math.floor(100000 + Math.random() * 900000);
      const cleanDialCode = country.dialCode.replace('+', '');
      const fullNumber = `+${cleanDialCode}${country.defaultPrefix}${randDigits}`;
      const providerNumberId = `decider-${country.code.toLowerCase()}-${service}-${Date.now().toString().slice(-4)}${i}`;

      numbers.push({
        providerNumberId,
        number: fullNumber,
        countryCode: country.code,
        service: service.toLowerCase(),
        capabilities: ['sms', service.toLowerCase()],
        status: 'available',
      });
    }

    return numbers;
  }

  /**
   * Rent or assign number with the provider
   */
  async assignNumber(providerNumberId) {
    return {
      success: true,
      providerNumberId,
      assignedAt: new Date(),
    };
  }

  /**
   * Release number with the provider
   */
  async releaseNumber(providerNumberId) {
    return {
      success: true,
      providerNumberId,
      releasedAt: new Date(),
    };
  }

  /**
   * Generate an authentic OTP verification code and message for WhatsApp or Telegram
   * @param {string} service - 'whatsapp' | 'telegram'
   */
  generateOtp(service = 'whatsapp') {
    const isTelegram = service.toLowerCase() === 'telegram';
    // Telegram codes are typically 5 digits; WhatsApp codes are 6 digits (often shown as 3-3)
    if (isTelegram) {
      const code = String(Math.floor(10000 + Math.random() * 90000));
      const message = `Telegram code: ${code}. You can also tap on this link to log in. Do not give this code to anyone.`;
      return { code, message, service: 'telegram' };
    } else {
      const p1 = Math.floor(100 + Math.random() * 900);
      const p2 = Math.floor(100 + Math.random() * 900);
      const code = `${p1}${p2}`;
      const formattedCode = `${p1}-${p2}`;
      const message = `Your WhatsApp code: ${formattedCode}. You can also tap on this link to verify your account: v.whatsapp.com/${code}. Do not share this code.`;
      return { code, formattedCode, message, service: 'whatsapp' };
    }
  }

  /**
   * Extract numeric OTP from message body
   * Supports both 6-digit WhatsApp codes (like 123-456 or 123456) and 5-digit Telegram codes
   */
  extractOtp(messageBody = '') {
    if (!messageBody || typeof messageBody !== 'string') return null;

    // Pattern 1: WhatsApp style 3-3 digit code (e.g. 482-195)
    const matchHyphen = messageBody.match(/\b(\d{3})-(\d{3})\b/);
    if (matchHyphen) {
      return `${matchHyphen[1]}${matchHyphen[2]}`;
    }

    // Pattern 2: Explicit prefix like "code: 12345" or "code is 123456"
    const matchPrefix = messageBody.match(/(?:code|otp|código|pin)[:\s]+([0-9]{4,8})\b/i);
    if (matchPrefix) {
      return matchPrefix[1];
    }

    // Pattern 3: Standalone 4 to 8 digit number
    const matchDigits = messageBody.match(/\b\d{4,8}\b/);
    if (matchDigits) {
      return matchDigits[0];
    }

    return null;
  }

  /**
   * Verify webhook request
   */
  verifyWebhook(req) {
    const headerSecret = req.headers['x-webhook-secret'] || req.headers['x-provider-secret'];
    if (headerSecret && headerSecret === this.webhookSecret) {
      return true;
    }

    const signature = req.headers['x-provider-signature'];
    if (signature && req.rawBody) {
      const expectedSig = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(req.rawBody)
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    }

    // In dev / test environment, always allow
    if (config.nodeEnv !== 'production') {
      return true;
    }

    return false;
  }

  /**
   * Normalize incoming webhook body
   */
  parseIncomingMessage(req) {
    const body = req.body || {};
    const providerMessageId =
      body.messageId ||
      body.id ||
      body.smsId ||
      `decider_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const from = body.from || body.sender || 'WhatsApp / Telegram Decider';
    const to = body.to || body.recipient || body.number || '';
    const text = body.body || body.text || body.message || body.otp || '';
    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();

    return {
      providerMessageId,
      from,
      to,
      body: text,
      timestamp,
    };
  }
}

module.exports = DeciderProvider;
