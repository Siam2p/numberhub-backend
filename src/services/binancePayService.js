/**
 * Binance Pay Service
 * Handles payment order creation, verification, and balance crediting.
 * Docs: https://developers.binance.com/docs/binance-pay/api-order-create-v2
 */

const crypto = require('crypto');
const https = require('https');

const BINANCE_PAY_BASE = 'bpay.binance.com';

/**
 * Generate Binance Pay API signature
 */
const generateSignature = (timestamp, nonce, body, secretKey) => {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createHmac('sha512', secretKey).update(payload).digest('hex').toUpperCase();
};

/**
 * Generate a random nonce string
 */
const generateNonce = (length = 32) => {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
};

/**
 * Make a signed request to Binance Pay API
 */
const binanceRequest = (path, body) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.BINANCE_PAY_API_KEY;
    const secretKey = process.env.BINANCE_PAY_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return reject(new Error('Binance Pay API keys not configured in .env'));
    }

    const timestamp = Date.now();
    const nonce = generateNonce();
    const bodyStr = JSON.stringify(body);
    const signature = generateSignature(String(timestamp), nonce, bodyStr, secretKey);

    const options = {
      hostname: BINANCE_PAY_BASE,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'BinancePay-Timestamp': timestamp,
        'BinancePay-Nonce': nonce,
        'BinancePay-Certificate-SN': apiKey,
        'BinancePay-Signature': signature,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from Binance: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
};

/**
 * Create a Binance Pay order
 * @param {Object} opts
 * @param {string} opts.merchantTradeNo - Unique order ID (your internal ID)
 * @param {number} opts.amountUSDT      - Amount in USDT
 * @param {string} opts.description     - Order description shown to user
 * @param {string} opts.userId          - Telegram user ID for reference
 * @returns {Object} { checkoutUrl, prepayId, qrcodeLink, deeplink }
 */
const createOrder = async ({ merchantTradeNo, amountUSDT, description, userId }) => {
  const webhookBase = process.env.WEBHOOK_BASE_URL || 'https://yourdomain.com';
  const merchantId = process.env.BINANCE_PAY_MERCHANT_ID;

  const body = {
    env: {
      terminalType: 'APP',
    },
    merchantTradeNo,
    orderAmount: amountUSDT.toFixed(2),
    currency: 'USDT',
    description: description || 'NumberHub Balance Top-Up',
    goodsDetails: [
      {
        goodsType: '02',
        goodsCategory: 'Z000',
        referenceGoodsId: 'numberhub-balance',
        goodsName: 'NumberHub Balance',
        goodsDetail: description || 'Virtual number balance',
        goodsUnitAmount: {
          currency: 'USDT',
          amount: amountUSDT.toFixed(2),
        },
        goodsQuantity: '1',
      },
    ],
    buyer: {
      referenceBuyerId: String(userId),
    },
    webhookUrl: `${webhookBase}/api/webhooks/binance-pay`,
    returnUrl: `https://t.me/code13pbot`,
    cancelUrl: `https://t.me/code13pbot`,
  };

  const response = await binanceRequest('/binancepay/openapi/v2/order', body);

  if (response.status !== 'SUCCESS') {
    throw new Error(`Binance Pay error: ${response.errorMessage || JSON.stringify(response)}`);
  }

  const data = response.data;
  return {
    prepayId: data.prepayId,
    checkoutUrl: data.checkoutUrl,
    qrcodeLink: data.qrcodeLink,
    deeplink: data.deeplink,
    expireTime: data.expireTime,
  };
};

/**
 * Query a Binance Pay order status
 * @param {string} merchantTradeNo - Your internal order ID
 */
const queryOrder = async (merchantTradeNo) => {
  const body = { merchantTradeNo };
  const response = await binanceRequest('/binancepay/openapi/v2/order/query', body);

  if (response.status !== 'SUCCESS') {
    throw new Error(`Binance order query error: ${response.errorMessage}`);
  }

  return response.data; // { status: 'PAID' | 'PENDING' | 'CANCELED', ... }
};

/**
 * Verify Binance Pay webhook signature
 * @param {string} timestamp - From BinancePay-Timestamp header
 * @param {string} nonce     - From BinancePay-Nonce header
 * @param {string} body      - Raw request body string
 * @param {string} signature - From BinancePay-Signature header
 */
const verifyWebhook = (timestamp, nonce, body, signature) => {
  const secretKey = process.env.BINANCE_PAY_SECRET_KEY;
  if (!secretKey) return false;
  const expected = generateSignature(timestamp, nonce, body, secretKey);
  return expected === signature.toUpperCase();
};

module.exports = { createOrder, queryOrder, verifyWebhook, generateNonce };
