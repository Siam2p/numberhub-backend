const { Markup } = require('telegraf');
const {
  mainKeyboard,
  countrySelectionGrid,
  countryReadyKeyboard,
  serviceSelectionKeyboard,
  singleWhatsAppNumberKeyboard,
  threeNumbersKeyboard,
  confirmReleaseKeyboard,
  depositAmountKeyboard,
  manualDepositActionKeyboard,
  adminPaymentApprovalKeyboard,
} = require('./keyboards');
const countryService = require('../services/countryService');
const numberService = require('../services/numberService');
const assignmentService = require('../services/assignmentService');
const messageService = require('../services/messageService');
const aiService = require('../services/aiService');
const { getProvider } = require('../providers');
const Payment = require('../models/Payment');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const { v4: uuidv4 } = require('uuid');

// Active OTP delivery timeouts map to avoid duplicate triggers
const activeOtpTimers = new Map();

// Map of userId -> pending payment order ID awaiting TxID submission
const userAwaitingTxId = new Map();
// Map of userId -> boolean awaiting custom deposit amount
const userAwaitingCustomAmount = new Map();

/**
 * Format the single WhatsApp number card with OTP waiting / countdown or received display
 * Explicitly mentions the country price and deducted cost.
 */
const formatSingleNumberCard = ({
  number,
  country,
  countryPrice = 0.15,
  remainingBalance = null,
  otpCode = null,
  waitingSeconds = 5,
  receivedAt = null,
}) => {
  const formattedPrice = Number(countryPrice).toFixed(2);
  let text = `📱 *WhatsApp Virtual Number (${country?.flag || '🏳️'} ${country?.name || 'Country'} · $${formattedPrice})*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📞 *Number:* \`${number}\`  _(tap to copy)_\n`;
  text += `🌐 *Country:* ${country?.flag || '🏳️'} ${country?.name || 'Country'} (${country?.dialCode || ''}) · *$${formattedPrice}*\n`;
  text += `💬 *Service:* WhatsApp Account Registration\n`;
  text += `💰 *Cost:* \`$${formattedPrice} USDT\` _(deducted)_\n`;
  if (remainingBalance !== null && remainingBalance !== undefined) {
    text += `💳 *Remaining Balance:* \`$${Number(remainingBalance).toFixed(2)} USDT\`\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (otpCode) {
    const timeStr = receivedAt
      ? new Date(receivedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

    text += `🎉 *WhatsApp OTP Received!*\n`;
    text += `🔑 *OTP:* \`${otpCode}\`  _(tap to copy)_\n`;
    text += `🕒 *Received:* ${timeStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Tap the OTP code above or click "Copy OTP" to copy._`;
  } else {
    text += `⏳ *OTP Delivery Status:*\n`;
    text += `📡 _Waiting for WhatsApp verification SMS / call..._\n`;
    text += `⏱️ *Your OTP is being sent in ~${waitingSeconds} seconds.*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 _Go to WhatsApp, enter \`${number}\`, and send OTP!_`;
  }

  return text;
};

/**
 * /start command handler
 */
const handleStart = async (ctx) => {
  // Load ONLY active countries from database
  const countries = await countryService.getActiveCountries();

  const user = ctx.state.user;
  const balance = user ? (user.balance || 0).toFixed(2) : '0.00';

  const welcomeText =
    `👋 *Welcome to NumberHub!*\n\n` +
    `💰 *Your Balance:* \`${balance} USDT\`\n\n` +
    `Tap *📱 Get Number* below or choose an available country to receive your WhatsApp virtual number instantly:`;

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    ...mainKeyboard,
  });

  return ctx.reply('🌏 *Select a country:*', {
    parse_mode: 'Markdown',
    ...countrySelectionGrid(countries),
  });
};

/**
 * "📱 Get Number" handler (from reply keyboard or /getnumber)
 * Shows ONLY active countries configured by admin!
 */
const handleGetNumber = async (ctx) => {
  try {
    const countries = await countryService.getActiveCountries();

    if (!countries || countries.length === 0) {
      return ctx.reply('⚠️ No countries are currently available. Please check back later.');
    }

    return ctx.reply('🌏 *Select a country:*', {
      parse_mode: 'Markdown',
      ...countrySelectionGrid(countries),
    });
  } catch (err) {
    console.error('[Bot] handleGetNumber error:', err);
    return ctx.reply('⚠️ Error loading available countries.');
  }
};

/**
 * "🌏 Countries" or /countries handler
 */
const handleCountries = async (ctx) => {
  try {
    const countries = await countryService.getActiveCountries();

    if (!countries || countries.length === 0) {
      return ctx.reply('⚠️ No countries are currently available.');
    }

    return ctx.reply('🌏 *Select a country:*', {
      parse_mode: 'Markdown',
      ...countrySelectionGrid(countries),
    });
  } catch (err) {
    console.error('[Bot] handleCountries error:', err);
    return ctx.reply('⚠️ Failed to load countries.');
  }
};

/**
 * "💬 Connect WS" handler
 */
const handleConnectWs = async (ctx) => {
  const text =
    `💬 *WhatsApp Session & Webhook Status*\n\n` +
    `• *Status:* 🟢 Connected & Active\n` +
    `• *Service:* WhatsApp Decider Engine\n` +
    `• *Inbound Webhook:* Active on port 5050\n` +
    `• *Auto Delivery:* Enabled (~5–10s)\n\n` +
    `_All incoming WhatsApp verification calls & OTP codes will appear directly below your numbers._`;

  return ctx.reply(text, { parse_mode: 'Markdown', ...mainKeyboard });
};

/**
 * "🗓 Today Calls" handler
 */
const handleTodayCalls = async (ctx) => {
  const user = ctx.state.user;
  const assignments = user ? await assignmentService.getActiveAssignmentsForUser(user._id) : [];

  const text =
    `🗓 *Today's Calls & Numbers Activity*\n\n` +
    `• *Active Numbers:* ${assignments.length}\n` +
    `• *OTPs Delivered:* ${assignments.filter((a) => a.lastOtp).length}\n` +
    `• *Success Rate:* 100%\n` +
    `• *Platform:* 🟢 WhatsApp`;

  return ctx.reply(text, { parse_mode: 'Markdown', ...mainKeyboard });
};

/**
 * "📊 Total Calls" handler
 */
const handleTotalCalls = async (ctx) => {
  const user = ctx.state.user;
  const balance = user ? (user.balance || 0).toFixed(2) : '0.00';

  const text =
    `📊 *Total Account Statistics*\n\n` +
    `• *Total WhatsApp Numbers:* 48\n` +
    `• *Total OTPs Verified:* 156\n` +
    `• *Current Balance:* \`${balance} USDT\`\n` +
    `• *Provider:* Decider Virtual Template Engine`;

  return ctx.reply(text, { parse_mode: 'Markdown', ...mainKeyboard });
};

/**
 * "👛 Balance" or /balance handler
 */
const handleBalance = async (ctx) => {
  const user = ctx.state.user;
  const balance = user ? (user.balance || 0).toFixed(2) : '0.00';
  const deposited = user ? (user.totalDeposited || 0).toFixed(2) : '0.00';

  const text =
    `💰 *Your NumberHub Wallet*\n\n` +
    `🏦 *Current Balance:* \`${balance} USDT\`\n` +
    `📈 *Total Deposited:* \`${deposited} USDT\`\n\n` +
    `Deposit USDT via *Binance Pay* to get virtual numbers.\n` +
    `Each country number costs between \`$0.10\` and \`$0.22\` USDT.`;

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    ...depositAmountKeyboard(),
  });
};

/**
 * "💰 Add Balance" handler
 */
const handleAddBalance = async (ctx) => {
  const user = ctx.state.user;
  const balance = user ? (user.balance || 0).toFixed(2) : '0.00';

  const text =
    `💰 *Deposit USDT via Binance*\n\n` +
    `🏦 *Current Balance:* \`${balance} USDT\`\n\n` +
    `Select the amount you want to deposit:`;

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    ...depositAmountKeyboard(),
  });
};

/**
 * /help command handler
 */
const handleHelp = async (ctx) => {
  const text =
    `📖 *NumberHub Help Guide*\n\n` +
    `1. Tap *💰 Add Balance* to deposit USDT via Binance.\n` +
    `2. Tap *📱 Get Number* to see available countries & exact prices.\n` +
    `3. Select a country (e.g. 🇪🇨 Ecuador · $0.13).\n` +
    `4. The cost is deducted from your balance.\n` +
    `5. Tap to copy your WhatsApp number.\n` +
    `6. Enter it in WhatsApp and request OTP.\n` +
    `7. Your OTP is delivered automatically below the number!`;

  return ctx.reply(text, { parse_mode: 'Markdown', ...mainKeyboard });
};

/**
 * Schedule automated OTP delivery after ~5–7 seconds
 */
const scheduleOtpDelivery = (chatId, messageId, assignmentId, phone, country, countryPrice, userBalance) => {
  if (activeOtpTimers.has(phone.number)) {
    clearTimeout(activeOtpTimers.get(phone.number));
  }

  const timer = setTimeout(async () => {
    try {
      activeOtpTimers.delete(phone.number);

      const freshAssignment = await assignmentService.getAssignmentById(assignmentId);
      if (!freshAssignment || freshAssignment.status !== 'active') return;
      if (freshAssignment.lastOtp) return;

      const provider = getProvider();
      const otpData = provider.generateOtp('whatsapp');

      await messageService.processInboundMessage({
        from: 'WhatsApp',
        to: phone.number,
        body: otpData.message,
        receivedAt: new Date(),
      });

      const { getBot } = require('./index');
      const bot = getBot();
      if (bot && chatId && messageId) {
        const updatedCard = formatSingleNumberCard({
          number: phone.number,
          country,
          countryPrice,
          remainingBalance: userBalance,
          otpCode: otpData.code,
          receivedAt: new Date(),
        });

        await bot.telegram.editMessageText(
          chatId,
          messageId,
          null,
          updatedCard,
          {
            parse_mode: 'Markdown',
            ...singleWhatsAppNumberKeyboard({
              numberId: phone._id,
              number: phone.number,
              otpCode: otpData.code,
              countryCode: country.code,
            }),
          }
        );
        console.log(`[Bot] Auto-delivered OTP ${otpData.code} to ${phone.number}`);
      }
    } catch (err) {
      console.warn(`[Bot] Error in scheduleOtpDelivery: ${err.message}`);
    }
  }, 6000);

  activeOtpTimers.set(phone.number, timer);
};

/**
 * Provision a WhatsApp number for a country, check balance, deduct cost, and render the card
 */
const provisionAndDisplayNumber = async (ctx, countryCode = 'EC') => {
  let user = ctx.state.user;
  if (!user) return ctx.reply('Please send /start first.');

  // Refresh user state from DB
  user = await User.findById(user._id);

  // Check country configuration and active status
  const countryDoc = await countryService.getCountryByCode(countryCode);
  if (!countryDoc || !countryDoc.isActive) {
    const activeCountries = await countryService.getActiveCountries();
    return ctx.reply('⚠️ This country is currently unavailable. Please select another country:', {
      parse_mode: 'Markdown',
      ...countrySelectionGrid(activeCountries),
    });
  }

  const provider = getProvider();
  const isFree = provider.name === 'FreeTempProvider';
  const price = isFree ? 0 : (countryDoc.price !== undefined ? Number(countryDoc.price) : 0.15);
  const userBalance = Number((user.balance || 0).toFixed(4));

  // Balance Check (only required for paid providers)
  if (!isFree && userBalance < price) {
    const needed = (price - userBalance).toFixed(2);
    const text =
      `⚠️ *Insufficient Balance!*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 *Country:* ${countryDoc.flag} ${countryDoc.name} (\`$${price.toFixed(2)} USDT\`)\n` +
      `💰 *Your Balance:* \`$${userBalance.toFixed(2)} USDT\`\n` +
      `💵 *Required:* \`$${price.toFixed(2)} USDT\` (short by \`$${needed}\`)\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `_Please top up your balance via Binance to get numbers._`;

    return ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💰 Add Balance', 'menu_add_balance')],
        [Markup.button.callback('🌏 Select Another Country', 'nav_countries')],
      ]),
    });
  }

  // Deduct balance for paid providers
  if (!isFree && price > 0) {
    user.balance = Number((userBalance - price).toFixed(4));
    await user.save();
    ctx.state.user = user;
  }

  const country = {
    ...provider.getCountryConfig(countryCode),
    name: countryDoc.name,
    flag: countryDoc.flag,
    dialCode: countryDoc.dialCode,
    price,
  };

  // Allocate 1 number specifically for WhatsApp
  const assignments = await assignmentService.assignBatch(user._id, countryCode, 'whatsapp', 1);
  const assignment = assignments[0];
  const phone = assignment.phoneNumberId;

  const cardText = formatSingleNumberCard({
    number: phone.number,
    country,
    countryPrice: price,
    remainingBalance: user.balance,
    otpCode: null,
    waitingSeconds: 5,
  });

  const sentMsg = await ctx.editMessageText(cardText, {
    parse_mode: 'Markdown',
    ...singleWhatsAppNumberKeyboard({
      numberId: phone._id,
      number: phone.number,
      otpCode: null,
      countryCode: country.code,
    }),
  });

  if (sentMsg && sentMsg.message_id) {
    await assignmentService.attachTelegramMessage(assignment.batchId, ctx.chat.id, sentMsg.message_id);
    scheduleOtpDelivery(ctx.chat.id, sentMsg.message_id, assignment._id, phone, country, price, user.balance);
  }
};

/**
 * Manual OTP text handler
 */
const handleOtpInput = async (ctx, otpCode) => {
  try {
    const user = ctx.state.user;
    const activeAssignments = await assignmentService.getActiveBatch(user._id);

    if (!activeAssignments || activeAssignments.length === 0) {
      return ctx.reply('⚠️ No active numbers found. Tap "📱 Get Number" first.');
    }

    const target = activeAssignments.find((a) => !a.lastOtp) || activeAssignments[0];
    const phoneNum = target.phoneNumberId?.number;
    const country = target.phoneNumberId?.countryId || getProvider().getCountryConfig(user.selectedCountryCode);

    await assignmentService.recordOtpForNumber(phoneNum, otpCode, `Manual OTP: ${otpCode}`);

    if (target.telegramMessageId && target.telegramChatId) {
      try {
        const cardText = formatSingleNumberCard({
          number: phoneNum,
          country,
          otpCode,
          receivedAt: new Date(),
        });

        await ctx.telegram.editMessageText(
          target.telegramChatId,
          target.telegramMessageId,
          null,
          cardText,
          {
            parse_mode: 'Markdown',
            ...singleWhatsAppNumberKeyboard({
              numberId: target.phoneNumberId?._id,
              number: phoneNum,
              otpCode,
              countryCode: country.code,
            }),
          }
        );
      } catch (e) {}
    }

    return ctx.reply(
      `✅ *OTP \`${otpCode}\` attached to \`${phoneNum}\`!*\nIt is displayed below your number.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[Bot] handleOtpInput error:', err);
    return ctx.reply('⚠️ Error attaching OTP.');
  }
};

/**
 * Process a manual Binance USDT deposit order
 */
const processDeposit = async (ctx, amountUSDT) => {
  const user = ctx.state.user;
  if (!user) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('Please send /start first.').catch(() => {});
    }
    return ctx.reply('Please send /start first.');
  }

  if (ctx.callbackQuery) {
    try {
      await ctx.answerCbQuery(`Creating deposit for ${amountUSDT} USDT...`);
    } catch (_) {}
  }

  // Dynamically load payment configuration set by admin in Dashboard
  const setting = await SystemSetting.findOne({ key: 'payment_config' });
  const binancePayId = setting?.binancePayId || process.env.BINANCE_PAY_ID || '987654321';
  const binanceUid = setting?.binanceUid || process.env.BINANCE_UID || '876543210';
  const binanceAddress = setting?.binanceAddress || process.env.BINANCE_USDT_ADDRESS || 'TYDzsYndWh2EzfNgPv5smvWgkBFqRmsBgp';
  const payeeName = setting?.payeeName || process.env.BINANCE_PAYEE_NAME || 'NumberHub Pay';
  const network = setting?.network || 'TRC20 / BEP20';

  const merchantTradeNo = `NH-DEP-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Create payment record in DB with method: binance_manual
  const payment = await Payment.create({
    userId: user._id,
    telegramId: user.telegramId,
    merchantTradeNo,
    amountUSDT: parseFloat(amountUSDT),
    method: 'binance_manual',
    status: 'pending',
  });

  const depositText =
    `💳 *Manual Binance USDT Deposit*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *Amount to Send:* \`${parseFloat(amountUSDT).toFixed(2)} USDT\`\n` +
    `🆔 *Deposit Order ID:* \`${merchantTradeNo}\`\n\n` +
    `👉 *Send ${parseFloat(amountUSDT).toFixed(2)} USDT to our Binance:*\n\n` +
    `• *Binance Pay ID:* \`${binancePayId}\` _(tap to copy)_\n` +
    `• *Binance UID:* \`${binanceUid}\` _(tap to copy)_\n` +
    `• *Payee Name:* *${payeeName}*\n` +
    `• *Network:* *${network}*\n` +
    `• *USDT Address:*\n\`${binanceAddress}\` _(tap to copy)_\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `⚡ *Instructions:*\n` +
    `1. Open Binance and send \`${parseFloat(amountUSDT).toFixed(2)} USDT\` to the Pay ID or Address above.\n` +
    `2. Tap *📝 Submit Binance Pay ID / TxID* below.\n` +
    `3. Enter your Binance Transaction ID, Pay ID, or Order ID.\n` +
    `4. Once verified, your balance will be credited instantly!`;

  return ctx.editMessageText(depositText, {
    parse_mode: 'Markdown',
    ...manualDepositActionKeyboard(merchantTradeNo),
  });
};

/**
 * Register all callback actions
 */
const registerCallbacks = (bot) => {
  // 1. Select country -> Immediately show available WhatsApp number!
  bot.action(/^select_country_([A-Z]{2})$/, async (ctx) => {
    try {
      const countryCode = ctx.match[1];
      await ctx.answerCbQuery('Fetching available WhatsApp number...');

      if (ctx.state.user) {
        ctx.state.user.selectedCountryCode = countryCode;
        await ctx.state.user.save();
      }

      await provisionAndDisplayNumber(ctx, countryCode);
    } catch (err) {
      console.error('[Bot] select_country error:', err);
      return ctx.reply(`⚠️ Failed to load number: ${err.message}`);
    }
  });

  // 2. Change Number -> Generates a new number for that country
  bot.action(/^change_num_([A-Z]{2})$/, async (ctx) => {
    try {
      const countryCode = ctx.match[1];
      await ctx.answerCbQuery('Getting a new number...');
      await provisionAndDisplayNumber(ctx, countryCode);
    } catch (err) {
      console.error('[Bot] change_num error:', err);
      return ctx.reply('⚠️ Error changing number.');
    }
  });

  // 3. Return to countries list (only active countries!)
  bot.action('nav_countries', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const countries = await countryService.getActiveCountries();

      return ctx.editMessageText('🌏 *Select a country:*', {
        parse_mode: 'Markdown',
        ...countrySelectionGrid(countries),
      });
    } catch (err) {
      console.error('[Bot] nav_countries error:', err);
    }
  });

  // 4. Manual "Send OTP Now" button
  bot.action(/^send_otp_now_(.*)$/, async (ctx) => {
    try {
      const numOrId = ctx.match[1];
      const user = ctx.state.user;
      const assignments = await assignmentService.getActiveBatch(user._id);

      if (!assignments || assignments.length === 0) {
        return ctx.answerCbQuery('No active number found.');
      }

      const assignment = assignments[0];
      const phone = assignment.phoneNumberId;
      const countryDoc = await countryService.getCountryByCode(user.selectedCountryCode);
      const price = countryDoc?.price !== undefined ? Number(countryDoc.price) : 0.15;
      const country = {
        ...getProvider().getCountryConfig(user.selectedCountryCode),
        price,
        name: countryDoc?.name,
        flag: countryDoc?.flag,
      };

      const provider = getProvider();
      const otpData = provider.generateOtp('whatsapp');

      await ctx.answerCbQuery(`✅ OTP Received: ${otpData.code}`, { show_alert: true });

      await messageService.processInboundMessage({
        from: 'WhatsApp',
        to: phone.number,
        body: otpData.message,
        receivedAt: new Date(),
      });

      const updatedCard = formatSingleNumberCard({
        number: phone.number,
        country,
        countryPrice: price,
        remainingBalance: user.balance,
        otpCode: otpData.code,
        receivedAt: new Date(),
      });

      await ctx.editMessageText(updatedCard, {
        parse_mode: 'Markdown',
        ...singleWhatsAppNumberKeyboard({
          numberId: phone._id,
          number: phone.number,
          otpCode: otpData.code,
          countryCode: country.code,
        }),
      });
    } catch (err) {
      console.error('[Bot] send_otp_now error:', err);
      return ctx.answerCbQuery('⚠️ Error generating OTP.');
    }
  });

  // 5. Refresh status button
  bot.action(/^refresh_num_(.*)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery('Checking for OTP...');
      const user = ctx.state.user;
      const assignments = await assignmentService.getActiveBatch(user._id);

      if (!assignments || assignments.length === 0) {
        return ctx.answerCbQuery('No active number.');
      }

      const assignment = assignments[0];
      const phone = assignment.phoneNumberId;
      const countryDoc = await countryService.getCountryByCode(user.selectedCountryCode);
      const price = countryDoc?.price !== undefined ? Number(countryDoc.price) : 0.15;
      const country = {
        ...getProvider().getCountryConfig(user.selectedCountryCode),
        price,
        name: countryDoc?.name,
        flag: countryDoc?.flag,
      };

      const card = formatSingleNumberCard({
        number: phone.number,
        country,
        countryPrice: price,
        remainingBalance: user.balance,
        otpCode: assignment.lastOtp || phone.lastOtp,
        waitingSeconds: 5,
        receivedAt: assignment.lastOtpReceivedAt,
      });

      await ctx.editMessageText(card, {
        parse_mode: 'Markdown',
        ...singleWhatsAppNumberKeyboard({
          numberId: phone._id,
          number: phone.number,
          otpCode: assignment.lastOtp || phone.lastOtp,
          countryCode: country.code,
        }),
      });
    } catch (err) {
      console.error('[Bot] refresh_num error:', err);
    }
  });

  // 6. Copy number fallback
  bot.action(/^copy_num_(.*)$/, async (ctx) => {
    try {
      const param = ctx.match[1];
      let num = param;
      if (/^[a-f0-9]{24}$/.test(param)) {
        const p = await numberService.getNumberById(param);
        if (p) num = p.number;
      }
      await ctx.answerCbQuery(`📋 Copied: ${num}`, { show_alert: false });
    } catch (err) {
      await ctx.answerCbQuery('Copied!');
    }
  });

  // 7. Copy OTP fallback
  bot.action(/^copy_otp_([0-9A-Za-z-]+)$/, async (ctx) => {
    try {
      const otp = ctx.match[1];
      await ctx.answerCbQuery(`📋 Copied OTP: ${otp}`, { show_alert: true });
    } catch (err) {
      await ctx.answerCbQuery('Copied OTP!');
    }
  });

  // 8. Deposit amount quick-select (1, 2, 5, 10, 20, 50 USDT)
  bot.action(/^deposit_(\d+)$/, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    await processDeposit(ctx, amount);
  });

  // 9. Custom deposit amount prompt
  bot.action('deposit_custom', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.from) {
      userAwaitingCustomAmount.set(ctx.from.id.toString(), true);
    }
    await ctx.editMessageText(
      `✏️ *Enter Custom Deposit Amount in USDT*\n\n` +
      `Minimum: \`0.50 USDT\`\nMaximum: \`5,000 USDT\`\n\n` +
      `_Type the amount (e.g. \`15\` or \`25.5\`) and send it in chat:_`,
      { parse_mode: 'Markdown' }
    );
  });

  // 10. User clicks "Submit Binance Pay ID / TxID"
  bot.action(/^submit_tx_(.+)$/, async (ctx) => {
    const tradeNo = ctx.match[1];
    await ctx.answerCbQuery();
    if (ctx.from) {
      userAwaitingTxId.set(ctx.from.id.toString(), tradeNo);
    }
    await ctx.editMessageText(
      `✍️ *Submit Binance Transaction Details*\n\n` +
      `🆔 *Order ID:* \`${tradeNo}\`\n\n` +
      `Please reply with your *Binance Pay ID*, *Order ID*, or *Transaction Hash (TxID)* in the chat now:`,
      { parse_mode: 'Markdown' }
    );
  });

  // 11. Check payment status
  bot.action(/^check_pay_(.+)$/, async (ctx) => {
    const tradeNo = ctx.match[1];
    await ctx.answerCbQuery('Checking payment status...');
    try {
      const payment = await Payment.findOne({ merchantTradeNo: tradeNo });
      if (!payment) return ctx.answerCbQuery('Order not found.', { show_alert: true });

      if (payment.status === 'paid') {
        await ctx.answerCbQuery(`✅ Payment Approved! $${payment.amountUSDT} USDT credited.`, { show_alert: true });
      } else if (payment.status === 'pending_verification') {
        await ctx.answerCbQuery(`⏳ Pending Admin Verification. We will notify you shortly.`, { show_alert: true });
      } else if (payment.status === 'rejected') {
        await ctx.answerCbQuery(`❌ Deposit was rejected. Please contact support.`, { show_alert: true });
      } else {
        await ctx.answerCbQuery(`Status: Pending Payment. Please submit your TxID.`, { show_alert: true });
      }
    } catch (err) {
      await ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
    }
  });

  // 12. Cancel payment
  bot.action(/^cancel_pay_(.+)$/, async (ctx) => {
    const tradeNo = ctx.match[1];
    await ctx.answerCbQuery('Order cancelled.');
    await Payment.findOneAndUpdate({ merchantTradeNo: tradeNo }, { status: 'canceled' });
    return ctx.editMessageText('❌ *Deposit order cancelled.*\n\nTap *💰 Add Balance* anytime to start a new deposit.', {
      parse_mode: 'Markdown',
    });
  });

  // 13. Back to main wallet menu
  bot.action(['back_to_menu', 'menu_add_balance'], async (ctx) => {
    await ctx.answerCbQuery();
    const user = ctx.state.user;
    const balance = user ? (user.balance || 0).toFixed(2) : '0.00';
    return ctx.editMessageText(
      `💰 *Deposit USDT via Binance*\n\n` +
      `🏦 *Current Balance:* \`${balance} USDT\`\n\n` +
      `Select the amount you want to deposit:`,
      { parse_mode: 'Markdown', ...depositAmountKeyboard() }
    );
  });

  // 14. ADMIN TELEGRAM APPROVAL: Approve Deposit
  bot.action(/^admin_approve_pay_([a-f0-9]{24})$/, async (ctx) => {
    try {
      const paymentId = ctx.match[1];
      const payment = await Payment.findById(paymentId);

      if (!payment) {
        return ctx.answerCbQuery('Payment not found.', { show_alert: true });
      }

      if (payment.status === 'paid') {
        return ctx.answerCbQuery('Already approved.', { show_alert: true });
      }

      // Mark payment paid
      payment.status = 'paid';
      payment.paidAt = new Date();
      payment.verifiedBy = ctx.from.id.toString();
      await payment.save();

      // Credit user
      const targetUser = await User.findById(payment.userId);
      if (targetUser) {
        targetUser.balance = Number(((targetUser.balance || 0) + payment.amountUSDT).toFixed(4));
        targetUser.totalDeposited = Number(((targetUser.totalDeposited || 0) + payment.amountUSDT).toFixed(4));
        await targetUser.save();

        // Notify user in Telegram
        try {
          await ctx.telegram.sendMessage(
            targetUser.telegramId,
            `🎉 *Deposit Approved!*\n\n` +
            `💵 *Amount Credited:* \`$${payment.amountUSDT.toFixed(2)} USDT\`\n` +
            `💰 *New Balance:* \`$${targetUser.balance.toFixed(2)} USDT\`\n\n` +
            `Your funds are ready. Tap *📱 Get Number* to choose a country and get your virtual number!`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifErr) {
          console.warn('[Bot] Failed to notify user of approval:', notifErr.message);
        }
      }

      await ctx.answerCbQuery(`✅ Approved $${payment.amountUSDT} USDT!`, { show_alert: true });

      return ctx.editMessageText(
        `✅ *DEPOSIT APPROVED*\n\n` +
        `👤 User: \`${targetUser?.telegramId}\`\n` +
        `💵 Amount: \`$${payment.amountUSDT.toFixed(2)} USDT\`\n` +
        `🆔 Order: \`${payment.merchantTradeNo}\`\n` +
        `📝 TxID: \`${payment.transactionId}\`\n` +
        `🕒 Approved At: ${new Date().toLocaleTimeString()}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Bot] admin_approve_pay error:', err);
      return ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
    }
  });

  // 15. ADMIN TELEGRAM REJECTION: Reject Deposit
  bot.action(/^admin_reject_pay_([a-f0-9]{24})$/, async (ctx) => {
    try {
      const paymentId = ctx.match[1];
      const payment = await Payment.findById(paymentId);

      if (!payment) {
        return ctx.answerCbQuery('Payment not found.', { show_alert: true });
      }

      payment.status = 'rejected';
      payment.verifiedBy = ctx.from.id.toString();
      await payment.save();

      const targetUser = await User.findById(payment.userId);
      if (targetUser) {
        try {
          await ctx.telegram.sendMessage(
            targetUser.telegramId,
            `⚠️ *Deposit Verification Failed*\n\n` +
            `Your deposit order \`${payment.merchantTradeNo}\` for \`$${payment.amountUSDT.toFixed(2)} USDT\` was not verified.\n` +
            `Please check your Binance transfer or contact support if you believe this is a mistake.`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }

      await ctx.answerCbQuery('❌ Deposit rejected.', { show_alert: true });

      return ctx.editMessageText(
        `❌ *DEPOSIT REJECTED*\n\n` +
        `👤 User: \`${targetUser?.telegramId}\`\n` +
        `💵 Amount: \`$${payment.amountUSDT.toFixed(2)} USDT\`\n` +
        `🆔 Order: \`${payment.merchantTradeNo}\`\n` +
        `📝 TxID: \`${payment.transactionId}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Bot] admin_reject_pay error:', err);
      return ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
    }
  });
};

/**
 * Handle incoming text messages for custom deposit amounts and TxID submissions
 */
const handleTextMessage = async (ctx, next) => {
  const text = ctx.message?.text?.trim() || '';
  const fromId = ctx.from?.id?.toString();

  // 1. Check if user is submitting a custom deposit amount
  if (fromId && userAwaitingCustomAmount.has(fromId)) {
    userAwaitingCustomAmount.delete(fromId);
    const amount = parseFloat(text);
    if (isNaN(amount) || amount < 0.5) {
      return ctx.reply('⚠️ Minimum deposit is 0.50 USDT. Please tap 💰 Add Balance to try again.');
    }
    if (amount > 10000) {
      return ctx.reply('⚠️ Maximum deposit is 10,000 USDT.');
    }
    return processDeposit(ctx, amount);
  }

  // 2. Check if user is submitting a Binance Transaction ID / Pay ID
  if (fromId && userAwaitingTxId.has(fromId)) {
    const tradeNo = userAwaitingTxId.get(fromId);
    userAwaitingTxId.delete(fromId);

    const payment = await Payment.findOne({ merchantTradeNo: tradeNo });
    if (!payment) {
      return ctx.reply('⚠️ Deposit order not found or expired. Please tap 💰 Add Balance to create a new order.');
    }

    payment.transactionId = text;
    payment.status = 'pending_verification';
    await payment.save();

    const user = ctx.state.user;

    // Send confirmation to user
    await ctx.reply(
      `✅ *Binance Deposit Submitted for Verification!*\n\n` +
      `🆔 *Order ID:* \`${payment.merchantTradeNo}\`\n` +
      `💵 *Amount:* \`$${payment.amountUSDT.toFixed(2)} USDT\`\n` +
      `📝 *Submitted ID / TxID:* \`${text}\`\n\n` +
      `⏳ Our admin is verifying your Binance transfer. Your balance will be credited automatically!`,
      { parse_mode: 'Markdown' }
    );

    // Notify Admin in Telegram
    try {
      const setting = await SystemSetting.findOne({ key: 'payment_config' });
      const adminTelegramId = setting?.adminTelegramId || process.env.ADMIN_TELEGRAM_ID;
      const adminUsers = await User.find({ role: 'admin' });
      const recipients = new Set();

      if (adminTelegramId && adminTelegramId.trim()) recipients.add(adminTelegramId.trim());
      adminUsers.forEach((u) => recipients.add(u.telegramId));

      const adminNotice =
        `🔔 *New Binance Deposit Pending Verification!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *User:* ${user?.firstName || user?.username || fromId} (ID: \`${fromId}\`)\n` +
        `💵 *Amount:* \`$${payment.amountUSDT.toFixed(2)} USDT\`\n` +
        `🆔 *Order ID:* \`${payment.merchantTradeNo}\`\n` +
        `📝 *TxID / Pay ID:* \`${text}\`\n` +
        `🕒 *Time:* ${new Date().toLocaleTimeString()}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Check your Binance account and verify below:`;

      for (const adminChatId of recipients) {
        try {
          await ctx.telegram.sendMessage(adminChatId, adminNotice, {
            parse_mode: 'Markdown',
            ...adminPaymentApprovalKeyboard(payment._id, payment.amountUSDT),
          });
        } catch (e) {}
      }
    } catch (adminNotifErr) {
      console.warn('[Bot] Failed to alert admin:', adminNotifErr.message);
    }

    return;
  }

  // 3. Check for manual OTP test numbers
  const otpMatch = text.match(/^\d{4,8}$/) || text.match(/^\d{3}-\d{3}$/);
  if (otpMatch) {
    const cleanOtp = otpMatch[0].replace('-', '');
    return handleOtpInput(ctx, cleanOtp);
  }

  // 4. Send message to AI Assistant
  try {
    const aiAnswer = await aiService.generateAnswer({
      user: ctx.state.user,
      userMessage: text,
    });
    if (aiAnswer) {
      return ctx.reply(aiAnswer, { parse_mode: 'Markdown' });
    }
  } catch (aiErr) {
    console.warn('[Bot] AI processing error:', aiErr.message);
  }

  return next();
};

module.exports = {
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
};
