const { Telegraf, Markup } = require('telegraf');
const config = require('../config');
const userService = require('../services/userService');
const assignmentService = require('../services/assignmentService');
const { getProvider } = require('../providers');
const {
  handleStart,
  handleGetNumber,
  handleCountries,
  handleConnectWs,
  handleTodayCalls,
  handleTotalCalls,
  handleBalance,
  handleAddBalance,
  handleHelp,
  handleOtpInput,
  handleTextMessage,
  formatSingleNumberCard,
  registerCallbacks,
} = require('./handlers');
const {
  singleWhatsAppNumberKeyboard,
  threeNumbersKeyboard,
} = require('./keyboards');

let bot = null;
let isBotRunning = false;

const initBot = async () => {
  if (!config.botToken || config.botToken.trim() === '' || config.botToken === 'your_telegram_bot_token_here') {
    console.warn('[Telegram Bot] BOT_TOKEN is not configured in .env. Bot polling is paused.');
    return null;
  }

  try {
    bot = new Telegraf(config.botToken);

    // Global Error Handler for Bot
    bot.catch((err, ctx) => {
      if (err.description && err.description.includes('message is not modified')) {
        return;
      }
      console.error(`[Telegram Bot] Error in update ${ctx.updateType}:`, err);
      try {
        ctx.reply('⚠️ An unexpected error occurred. Please try again.');
      } catch (e) {
        // Ignore reply error
      }
    });

    // User tracking & account block middleware
    bot.use(async (ctx, next) => {
      if (ctx.from) {
        try {
          const user = await userService.findOrCreateTelegramUser(ctx.from);
          ctx.state.user = user;

          if (user.isBlocked) {
            return ctx.reply(
              `⛔ *Your account has been suspended.*\nReason: ${user.blockedReason || 'Policy violation'}\nContact support for assistance.`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (err) {
          console.error('[Telegram Bot] User middleware error:', err);
        }
      }
      return next();
    });

    // Register slash commands
    bot.command('start', handleStart);
    bot.command('getnumber', handleGetNumber);
    bot.command('countries', handleCountries);
    bot.command('balance', handleBalance);
    bot.command('help', handleHelp);

    // Command to attach or test OTP manually: /otp 482015
    bot.command('otp', async (ctx) => {
      const parts = ctx.message.text.split(' ').slice(1);
      const code = parts[0]?.trim();
      if (!code) {
        return ctx.reply('💡 Usage: `/otp 123456`', { parse_mode: 'Markdown' });
      }
      return handleOtpInput(ctx, code);
    });

    // Register persistent reply keyboard actions matching the UI
    bot.hears('📱 Get Number', handleGetNumber);
    bot.hears('💬 Connect WS', handleConnectWs);
    bot.hears('🗓 Today Calls', handleTodayCalls);
    bot.hears('📊 Total Calls', handleTotalCalls);
    bot.hears('💰 Add Balance', handleAddBalance);

    // Extra aliases
    bot.hears('🌍 Countries', handleCountries);
    bot.hears('❓ Help & Support', handleHelp);

    // Listen to text messages (for custom amounts, TxID submissions, and OTP tests)
    bot.on('text', handleTextMessage);

    // Register inline callbacks
    registerCallbacks(bot);

    // Verify connection and start polling
    const botInfo = await bot.telegram.getMe();
    isBotRunning = true;
    console.log(`[Telegram Bot] Successfully connected to Telegram as @${botInfo.username} (${botInfo.first_name})`);

    bot.launch({
      dropPendingUpdates: true,
    }).catch((err) => {
      console.error(`[Telegram Bot] Polling loop error: ${err.message}`);
      isBotRunning = false;
    });

    return bot;
  } catch (error) {
    console.error('[Telegram Bot] Initialization error:', error.message);
    return null;
  }
};

/**
 * Update the number card live when an OTP arrives
 */
const updateBatchMessageWithOtp = async ({ chatId, messageId, batchId, updatedNumber, otpCode }) => {
  if (!bot || !chatId || !messageId) return false;

  try {
    const assignments = await assignmentService.getActiveBatch(null, batchId);
    if (!assignments || assignments.length === 0) return false;

    const assignment = assignments[0];
    const phone = assignment.phoneNumberId;
    const country = phone?.countryId || getProvider().getCountryConfig('EC');

    const cardText = formatSingleNumberCard({
      number: phone.number,
      country,
      otpCode,
      receivedAt: new Date(),
    });

    await bot.telegram.editMessageText(
      chatId,
      messageId,
      null,
      cardText,
      {
        parse_mode: 'Markdown',
        ...singleWhatsAppNumberKeyboard({
          numberId: phone._id,
          number: phone.number,
          otpCode,
          countryCode: country.code,
        }),
      }
    );

    console.log(`[Telegram Bot] Updated card with OTP for ${updatedNumber}`);
    return true;
  } catch (err) {
    console.warn(`[Telegram Bot] Could not live-edit message ${messageId}: ${err.message}`);
    return false;
  }
};

/**
 * Dispatch Inbound SMS / OTP notification to user via Telegram
 */
const notifyUserNewMessage = async (telegramId, { from, to, body, otpCode, receivedAt, service = 'whatsapp' }) => {
  if (!bot || !isBotRunning) {
    console.log(`[Telegram Bot] Bot offline. Notification queued for user ${telegramId}`);
    return false;
  }

  try {
    const time = new Date(receivedAt).toLocaleTimeString();
    const serviceName = service.toLowerCase() === 'telegram' ? 'Telegram' : 'WhatsApp';

    let text =
      `📬 *New ${serviceName} OTP Received!*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📞 *Number:* \`${to}\`  _(tap to copy)_\n` +
      `👤 *From:* *${from}*\n` +
      `🕒 *Time:* ${time}\n\n`;

    if (otpCode) {
      text += `🔑 *OTP Code:* \`${otpCode}\`  _(tap to copy)_\n\n`;
    }

    text += `💬 *Message:*\n\`${body}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `_Tap on the code or click the button below to copy._`;

    const buttons = [];
    if (otpCode) {
      buttons.push([
        {
          text: `📋 Copy OTP (${otpCode})`,
          copy_text: { text: String(otpCode) },
          callback_data: `copy_otp_${otpCode}`,
        },
      ]);
    }
    buttons.push([
      {
        text: `📋 Copy Number (${to})`,
        copy_text: { text: to },
        callback_data: `copy_num_${to}`,
      },
    ]);

    await bot.telegram.sendMessage(telegramId, text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    });

    console.log(`[Telegram Bot] SMS alert delivered to user ${telegramId}`);
    return true;
  } catch (err) {
    console.error(`[Telegram Bot] Failed to deliver alert to ${telegramId}:`, err.message);
    return false;
  }
};

const getBotStatus = () => {
  return {
    configured: Boolean(config.botToken && config.botToken !== 'your_telegram_bot_token_here'),
    running: isBotRunning,
  };
};

module.exports = {
  initBot,
  updateBatchMessageWithOtp,
  notifyUserNewMessage,
  getBotStatus,
  getBot: () => bot,
};
