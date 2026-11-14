/**
 * 5SIM Virtual Number & SMS Activation Provider
 *
 * Official API documentation: https://5sim.net/docs/
 * Supports instant number acquisition, real-time OTP polling, order finish, and order cancellation.
 */

const https = require('https');
const BaseProvider = require('./BaseProvider');
const config = require('../config');

class FiveSimProvider extends BaseProvider {
  constructor(apiKey = null) {
    super('FiveSimProvider');
    this.apiKey = apiKey || process.env.FIVESIM_API_KEY || config.smsProviderApiKey || '';
    this.baseUrl = '5sim.net';

    // Mapping ISO country codes to 5sim country names
    this.countryMap = {
      EC: 'ecuador',
      CO: 'colombia',
      EG: 'egypt',
      IT: 'italy',
      JO: 'jordan',
      PA: 'panama',
      GE: 'georgia',
      NI: 'nicaragua',
    };

    // Supported countries details
    this.countries = [
      { name: 'Ecuador', code: 'EC', dialCode: '+593', flag: '🇪🇨', fivesimName: 'ecuador' },
      { name: 'Colombia', code: 'CO', dialCode: '+57', flag: '🇨🇴', fivesimName: 'colombia' },
      { name: 'Egypt', code: 'EG', dialCode: '+20', flag: '🇪🇬', fivesimName: 'egypt' },
      { name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹', fivesimName: 'italy' },
      { name: 'Jordan', code: 'JO', dialCode: '+962', flag: '🇯🇴', fivesimName: 'jordan' },
      { name: 'Panama', code: 'PA', dialCode: '+507', flag: '🇵🇦', fivesimName: 'panama' },
      { name: 'Georgia', code: 'GE', dialCode: '+995', flag: '🇬🇪', fivesimName: 'georgia' },
      { name: 'Nicaragua', code: 'NI', dialCode: '+505', flag: '🇳🇮', fivesimName: 'nicaragua' },
    ];
  }

  /**
   * Helper method for 5sim HTTP requests
   */
  async request(path, method = 'GET', body = null) {
    let apiKey = this.apiKey || process.env.FIVESIM_API_KEY;

    // Check database system settings if not set in environment
    if (!apiKey) {
      try {
        const SystemSetting = require('../models/SystemSetting');
        const s = await SystemSetting.findOne({ key: 'payment_config' });
        if (s?.fiveSimApiKey) apiKey = s.fiveSimApiKey;
      } catch (_) {}
    }

    if (!apiKey || apiKey === 'your_5sim_api_key_here') {
      throw new Error('5SIM API key not configured. Add FIVESIM_API_KEY in .env or Admin Panel Settings.');
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path,
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'NumberHub/1.0',
        },
      };

      if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 404) {
              return reject(new Error(`5SIM API Error (${res.statusCode}): ${data}`));
            }
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            // Some 5sim endpoints return raw string or status
            if (data.includes('no free phones') || data.includes('no numbers')) {
              return reject(new Error('5SIM: No numbers available for this country right now. Please try another country.'));
            }
            if (data.includes('low balance') || data.includes('not enough user balance')) {
              return reject(new Error('5SIM: Account balance too low. Please top up your 5sim.net account.'));
            }
            resolve(data);
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`5SIM Network Error: ${err.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Get 5sim user profile (balance, rating)
   */
  async getProfile() {
    return this.request('/v1/user/profile');
  }

  /**
   * Get supported countries list
   */
  async getCountries() {
    return this.countries;
  }

  /**
   * Get country config by ISO code
   */
  getCountryConfig(countryCode) {
    const code = (countryCode || 'EC').toUpperCase();
    return this.countries.find((c) => c.code === code) || this.countries[0];
  }

  /**
   * Buy / Activate a number from 5sim for WhatsApp
   * @param {string} countryCode - ISO 2-letter code (e.g. 'EC', 'CO')
   * @param {string} service - 'whatsapp' | 'telegram'
   * @param {string} operator - 'any' or operator name
   */
  async buyNumber(countryCode = 'EC', service = 'whatsapp', operator = 'any') {
    const fivesimCountry = this.countryMap[countryCode.toUpperCase()] || 'ecuador';
    const fivesimProduct = service.toLowerCase() === 'telegram' ? 'telegram' : 'whatsapp';

    const path = `/v1/user/buy/activation/${fivesimCountry}/${operator}/${fivesimProduct}`;
    const result = await this.request(path);

    return {
      orderId: result.id,
      number: result.phone,
      country: result.country,
      product: result.product,
      operator: result.operator,
      price: result.price,
      status: result.status,
      expiresAt: result.expires ? new Date(result.expires) : new Date(Date.now() + 15 * 60 * 1000),
      raw: result,
    };
  }

  /**
   * Check order status and check for incoming SMS / OTP
   * @param {string|number} orderId
   */
  async checkOrder(orderId) {
    const result = await this.request(`/v1/user/check/${orderId}`);

    let otpCode = null;
    let smsBody = null;

    if (result.sms && Array.isArray(result.sms) && result.sms.length > 0) {
      const latestSms = result.sms[result.sms.length - 1];
      smsBody = latestSms.text;
      otpCode = latestSms.code || this.extractOtp(latestSms.text);
    }

    return {
      orderId: result.id,
      status: result.status, // "PENDING", "RECEIVED", "CANCELED", "TIMEOUT", "FINISHED", "BANNED"
      phone: result.phone,
      sms: result.sms || [],
      otpCode,
      smsBody,
      isReceived: Boolean(otpCode || (result.sms && result.sms.length > 0)),
      raw: result,
    };
  }

  /**
   * Mark order as finished on 5sim after OTP is received
   */
  async finishOrder(orderId) {
    return this.request(`/v1/user/finish/${orderId}`);
  }

  /**
   * Cancel order on 5sim and get refund if SMS hasn't arrived
   */
  async cancelOrder(orderId) {
    return this.request(`/v1/user/cancel/${orderId}`);
  }

  /**
   * Ban number on 5sim if already used or blocked on WhatsApp
   */
  async banOrder(orderId) {
    return this.request(`/v1/user/ban/${orderId}`);
  }

  /**
   * BaseProvider compliance: getAvailableNumbers
   */
  async getAvailableNumbers(countryCode = 'EC', service = 'whatsapp', count = 1) {
    const country = this.getCountryConfig(countryCode);
    const numbers = [];

    for (let i = 0; i < count; i++) {
      try {
        const order = await this.buyNumber(countryCode, service);
        numbers.push({
          providerNumberId: String(order.orderId),
          number: order.number,
          countryCode: country.code,
          service: service.toLowerCase(),
          capabilities: ['sms', service.toLowerCase()],
          status: 'available',
          fivesimOrderId: order.orderId,
        });
      } catch (err) {
        // If 5sim fails, provide clear error message
        throw new Error(`5SIM error for ${country.name}: ${err.message}`);
      }
    }

    return numbers;
  }

  /**
   * BaseProvider compliance: assignNumber
   */
  async assignNumber(providerNumberId) {
    return {
      success: true,
      providerNumberId,
      assignedAt: new Date(),
    };
  }

  /**
   * BaseProvider compliance: releaseNumber (cancels on 5sim)
   */
  async releaseNumber(providerNumberId) {
    try {
      if (providerNumberId && !providerNumberId.startsWith('decider')) {
        await this.cancelOrder(providerNumberId);
      }
      return { success: true, providerNumberId, releasedAt: new Date() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Extract numeric OTP from SMS text
   */
  extractOtp(messageBody = '') {
    if (!messageBody || typeof messageBody !== 'string') return null;

    // Pattern 1: WhatsApp style 3-3 digit code (e.g. 482-195)
    const matchHyphen = messageBody.match(/\b(\d{3})-(\d{3})\b/);
    if (matchHyphen) {
      return `${matchHyphen[1]}${matchHyphen[2]}`;
    }

    // Pattern 2: Explicit prefix like "code: 123456"
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
   * Fallback OTP generator for testing & manual fleet inventory
   */
  generateOtp(service = 'whatsapp') {
    const isTelegram = service.toLowerCase() === 'telegram';
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
   * Webhook verification (5sim uses polling check/id rather than webhooks)
   */
  verifyWebhook() {
    return true;
  }

  parseIncomingMessage(req) {
    const body = req.body || {};
    return {
      providerMessageId: body.id || `fivesim_msg_${Date.now()}`,
      from: body.sender || 'WhatsApp',
      to: body.phone || '',
      body: body.text || '',
      timestamp: new Date(),
    };
  }
}

module.exports = FiveSimProvider;
