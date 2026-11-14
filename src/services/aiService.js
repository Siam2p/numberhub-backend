/**
 * AI Assistant Service for NumberHub Telegram Bot
 *
 * Supports:
 * 1. Google Gemini 1.5/2.0 Flash (Completely free API key from Google AI Studio)
 * 2. Groq Cloud (Free Llama 3 models)
 * 3. Built-in Smart FAQ & Intent Matcher (Instant zero-config fallback)
 */

const https = require('https');
const mongoose = require('mongoose');
const SystemSetting = require('../models/SystemSetting');

const DEFAULT_SYSTEM_PROMPT =
  `You are NumberHub AI Support Assistant. NumberHub provides virtual phone numbers for instant SMS and OTP verification on WhatsApp and Telegram.\n` +
  `Key Info:\n` +
  `- Supported Countries & Prices: Ecuador ($0.13), Colombia ($0.14), Egypt ($0.14), Italy ($0.22), Jordan ($0.16), Panama ($0.10), Georgia ($0.16), Nicaragua ($0.10).\n` +
  `- How to get a number: Tap "📱 Get Number" or send /start, choose a country, and copy the assigned number.\n` +
  `- How to add balance: Tap "💰 Add Balance", choose or type deposit amount, send USDT via Binance Pay ID, UID, or TRC20 address, and submit your TxID/Pay ID for 1-click admin approval.\n` +
  `- OTP verification: As soon as WhatsApp sends the SMS, the OTP code appears live on the number card with a one-tap copy button.\n` +
  `- Support: Admin verifies deposits manually. Balance updates automatically once approved.\n` +
  `Rules: Be concise, friendly, and helpful. Use clean Telegram Markdown (*bold*, \`code\`). Reply in the exact same language the user uses (English, Bengali, Spanish, Arabic, Hindi, etc.).`;

/**
 * Call Google Gemini REST API (100% Free tier available on AI Studio)
 */
const callGemini = (apiKey, userMessage, systemPrompt) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.7,
      },
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              return reject(new Error(`Gemini API error (${res.statusCode}): ${body.slice(0, 150)}`));
            }
            const data = JSON.parse(body);
            const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (answer) resolve(answer.trim());
            else reject(new Error('No response text in Gemini payload'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API timeout'));
    });
    req.write(payload);
    req.end();
  });
};

/**
 * Call Groq Cloud API (Free Llama 3 models)
 */
const callGroq = (apiKey, userMessage, systemPrompt) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const req = https.request(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              return reject(new Error(`Groq error (${res.statusCode}): ${body.slice(0, 150)}`));
            }
            const data = JSON.parse(body);
            const answer = data.choices?.[0]?.message?.content;
            if (answer) resolve(answer.trim());
            else reject(new Error('No response text in Groq payload'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Groq API timeout'));
    });
    req.write(payload);
    req.end();
  });
};

/**
 * Built-in Intelligent Fallback Assistant
 * Automatically handles common intents when no API key is configured
 */
const getBuiltinAnswer = (text, user) => {
  const q = text.toLowerCase();

  // Greeting
  if (/^(hi|hello|hey|salam|assalam|halo|hola|help|start)\b/.test(q)) {
    return (
      `👋 *Hello ${user?.firstName || 'there'}! I am NumberHub AI Assistant.*\n\n` +
      `I can help you with:\n` +
      `• 📱 *Getting a virtual number:* Tap \`📱 Get Number\`\n` +
      `• 💰 *Depositing USDT:* Tap \`💰 Add Balance\`\n` +
      `• 🌍 *Country Prices:* 🇪🇨 Ecuador ($0.13), 🇨🇴 Colombia ($0.14), 🇪🇬 Egypt ($0.14), 🇮🇹 Italy ($0.22), 🇯🇴 Jordan ($0.16), 🇵🇦 Panama ($0.10), 🇬🇪 Georgia ($0.16), 🇳🇮 Nicaragua ($0.10)\n` +
      `• 🔑 *Receiving OTP:* Automatic real-time code detection with 1-tap copy!\n\n` +
      `_Feel free to ask me anything about your balance or WhatsApp numbers!_`
    );
  }

  // Pricing inquiry
  if (q.includes('price') || q.includes('cost') || q.includes('rate') || q.includes('how much') || q.includes('dam') || q.includes('taka')) {
    return (
      `🏷 *NumberHub Virtual Number Pricing:*\n\n` +
      `• 🇪🇨 *Ecuador:* \`$0.13 USDT\`\n` +
      `• 🇨🇴 *Colombia:* \`$0.14 USDT\`\n` +
      `• 🇪🇬 *Egypt:* \`$0.14 USDT\`\n` +
      `• 🇮🇹 *Italy:* \`$0.22 USDT\`\n` +
      `• 🇯🇴 *Jordan:* \`$0.16 USDT\`\n` +
      `• 🇵🇦 *Panama:* \`$0.10 USDT\`\n` +
      `• 🇬🇪 *Georgia:* \`$0.16 USDT\`\n` +
      `• 🇳🇮 *Nicaragua:* \`$0.10 USDT\`\n\n` +
      `💡 _All prices include exact cost + $0.02 fee. Tap 📱 Get Number to get started!_`
    );
  }

  // Deposit / Payment / Binance inquiry
  if (q.includes('deposit') || q.includes('binance') || q.includes('pay') || q.includes('recharge') || q.includes('balance') || q.includes('money')) {
    return (
      `💰 *How to Deposit USDT (Manual Binance Verification):*\n\n` +
      `1️⃣ Tap the *💰 Add Balance* button in the menu.\n` +
      `2️⃣ Pick a preset amount ($1, $2, $5, $10, etc.) or enter a custom amount.\n` +
      `3️⃣ Send the USDT using our *Binance Pay ID*, *UID*, or *USDT TRC20 Address*.\n` +
      `4️⃣ Submit your *Binance Order ID / TxID*.\n` +
      `5️⃣ Our admin will verify your transfer and your balance will be credited instantly!`
    );
  }

  // How to get WhatsApp / Telegram number
  if (q.includes('number') || q.includes('whatsapp') || q.includes('telegram') || q.includes('otp') || q.includes('code')) {
    return (
      `📱 *How to Get a Number & Receive OTP:*\n\n` +
      `1️⃣ Tap *📱 Get Number* below.\n` +
      `2️⃣ Choose your desired country from the grid.\n` +
      `3️⃣ Copy the number and enter it in WhatsApp or Telegram.\n` +
      `4️⃣ The OTP code will arrive right here in chat with a *📋 Copy OTP* button!`
    );
  }

  // General fallback
  return (
    `🤖 *NumberHub AI Assistant*\n\n` +
    `I received your question: _"${text}"_\n\n` +
    `Here are quick actions you can take right now:\n` +
    `• Tap *📱 Get Number* to receive a WhatsApp verification number.\n` +
    `• Tap *💰 Add Balance* to add funds via Binance USDT.\n` +
    `• Tap *🌍 Countries* to view active country numbers.\n` +
    `• Tap *❓ Help & Support* for guide and FAQs.\n\n` +
    `_Need further assistance? Our admin is also available to help you!_`
  );
};

/**
 * Main Answer Function
 */
const generateAnswer = async ({ user, userMessage }) => {
  try {
    // 1. Fetch live AI settings from MongoDB if connected
    let setting = null;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        setting = await SystemSetting.findOne({ key: 'payment_config' });
      } catch (_) {}
    }

    // Check if AI is disabled by admin
    if (setting?.aiEnabled === false) {
      return null;
    }

    const geminiKey = setting?.geminiApiKey || process.env.GEMINI_API_KEY;
    const groqKey = setting?.groqApiKey || process.env.GROQ_API_KEY;
    const systemPrompt = setting?.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT;

    // 2. Try Google Gemini if key is provided
    if (geminiKey && geminiKey.trim() !== '' && geminiKey !== 'your_gemini_api_key_here') {
      try {
        const answer = await callGemini(geminiKey.trim(), userMessage, systemPrompt);
        return `🤖 *AI Assistant:*\n\n${answer}`;
      } catch (geminiErr) {
        console.warn('[AI Service] Gemini error, falling back to built-in:', geminiErr.message);
      }
    }

    // 3. Try Groq if key is provided
    if (groqKey && groqKey.trim() !== '') {
      try {
        const answer = await callGroq(groqKey.trim(), userMessage, systemPrompt);
        return `🤖 *AI Assistant:*\n\n${answer}`;
      } catch (groqErr) {
        console.warn('[AI Service] Groq error, falling back to built-in:', groqErr.message);
      }
    }

    // 4. Built-in smart contextual fallback
    return getBuiltinAnswer(userMessage, user);
  } catch (err) {
    console.error('[AI Service] generateAnswer error:', err);
    return getBuiltinAnswer(userMessage, user);
  }
};

module.exports = {
  generateAnswer,
  DEFAULT_SYSTEM_PROMPT,
};
