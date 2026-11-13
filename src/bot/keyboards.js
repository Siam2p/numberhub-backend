const { Markup } = require('telegraf');

/**
 * Main persistent reply keyboard:
 * [ 📱 Get Number ]  [ 💬 Connect WS ]
 * [ 🗓 Today Calls ] [ 📊 Total Calls ]
 * [ 💰 Add Balance ]
 */
const mainKeyboard = Markup.keyboard([
  ['📱 Get Number', '💬 Connect WS'],
  ['🗓 Today Calls', '📊 Total Calls'],
  ['💰 Add Balance'],
]).resize();

/**
 * 2-column country selection inline keyboard matching the screenshot
 * Exactly the 8 designated countries:
 * Ecuador, Colombia, Egypt, Italy, Jordan, Panama, Georgia, Nicaragua
 */
const countrySelectionGrid = (countries = []) => {
  const defaultList = [
    { code: 'EC', name: 'Ecuador', flag: '🇪🇨', price: 0.13 },
    { code: 'CO', name: 'Colombia', flag: '🇨🇴', price: 0.14 },
    { code: 'EG', name: 'Egypt', flag: '🇪🇬', price: 0.14 },
    { code: 'IT', name: 'Italy', flag: '🇮🇹', price: 0.22 },
    { code: 'JO', name: 'Jordan', flag: '🇯🇴', price: 0.16 },
    { code: 'PA', name: 'Panama', flag: '🇵🇦', price: 0.10 },
    { code: 'GE', name: 'Georgia', flag: '🇬🇪', price: 0.16 },
    { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', price: 0.10 },
  ];

  const source = countries.length > 0 ? countries : defaultList;
  const buttons = [];

  for (let i = 0; i < source.length; i += 2) {
    const row = [];
    const c1 = source[i];
    const priceStr1 = c1.price !== undefined ? ` · $${Number(c1.price).toFixed(2)}` : '';
    row.push(
      Markup.button.callback(
        `${c1.flag || '🏳️'} ${c1.name}${priceStr1}`,
        `select_country_${c1.code}`
      )
    );
    if (i + 1 < source.length) {
      const c2 = source[i + 1];
      const priceStr2 = c2.price !== undefined ? ` · $${Number(c2.price).toFixed(2)}` : '';
      row.push(
        Markup.button.callback(
          `${c2.flag || '🏳️'} ${c2.name}${priceStr2}`,
          `select_country_${c2.code}`
        )
      );
    }
    buttons.push(row);
  }

  return Markup.inlineKeyboard(buttons);
};

/**
 * "Tap below to get numbers now." keyboard matching screenshot's "Get Ecuador Number" button
 */
const countryReadyKeyboard = (countryCode = 'EC', countryName = 'Ecuador', flag = '🇪🇨') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `${flag} Get ${countryName} Number`,
        `get_num_${countryCode}`
      ),
    ],
    [Markup.button.callback('🌏 Change Country', 'nav_countries')],
  ]);
};

/**
 * Service Selection Keyboard (WhatsApp / Telegram)
 */
const serviceSelectionKeyboard = (countryCode = 'EC', countryName = 'Ecuador', flag = '🇪🇨') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🟢 WhatsApp', `choose_service_whatsapp_${countryCode}`),
      Markup.button.callback('🔵 Telegram', `choose_service_telegram_${countryCode}`),
    ],
    [Markup.button.callback(`🌏 Change Country (${flag} ${countryName})`, 'nav_countries')],
  ]);
};

/**
 * Dedicated WhatsApp Single Number Keyboard
 * Includes "Change number", "Change country", and click-to-copy OTP / number buttons
 */
const singleWhatsAppNumberKeyboard = ({ numberId, number, otpCode = null, countryCode = 'EC' }) => {
  const keyboard = [];

  // 1. If OTP received, put Copy OTP as top button!
  if (otpCode) {
    keyboard.push([
      {
        text: `📋 Copy OTP: ${otpCode}`,
        copy_text: { text: String(otpCode) },
        callback_data: `copy_otp_${otpCode}`,
      },
    ]);
  }

  // 2. Copy Number button
  keyboard.push([
    {
      text: `📋 Copy Number: ${number}`,
      copy_text: { text: String(number) },
      callback_data: `copy_num_${numberId || number}`,
    },
  ]);

  // 3. Requested Buttons: "Change number" and "Change country"
  keyboard.push([
    Markup.button.callback('🔄 Change number', `change_num_${countryCode}`),
    Markup.button.callback('🌏 Change country', 'nav_countries'),
  ]);

  // 4. If OTP not yet received, provide fast-trigger & refresh
  if (!otpCode) {
    keyboard.push([
      Markup.button.callback('📲 Send OTP Now', `send_otp_now_${numberId || number}`),
      Markup.button.callback('🔄 Refresh Status', `refresh_num_${numberId || number}`),
    ]);
  }

  return Markup.inlineKeyboard(keyboard);
};

/**
 * 3 Available Numbers Keyboard (for batch mode)
 */
const threeNumbersKeyboard = (assignments = [], service = 'whatsapp', countryCode = 'EC', batchId = '') => {
  const keyboard = [];

  const copyRow = assignments.map((a, idx) => {
    const num = a.phoneNumberId?.number || `Num ${idx + 1}`;
    return {
      text: `📋 Copy #${idx + 1}`,
      copy_text: { text: num },
      callback_data: `copy_num_${a.phoneNumberId?._id || idx}`,
    };
  });
  if (copyRow.length > 0) {
    keyboard.push(copyRow);
  }

  const sendOtpRow = assignments.map((a, idx) => {
    return Markup.button.callback(
      `📲 Send OTP #${idx + 1}`,
      `send_otp_${idx + 1}_${a.phoneNumberId?._id}`
    );
  });
  if (sendOtpRow.length > 0) {
    keyboard.push(sendOtpRow);
  }

  const otpCopyButtons = [];
  assignments.forEach((a, idx) => {
    const otp = a.lastOtp || a.phoneNumberId?.lastOtp;
    if (otp) {
      otpCopyButtons.push({
        text: `📋 Copy OTP #${idx + 1} (${otp})`,
        copy_text: { text: String(otp) },
        callback_data: `copy_otp_${otp}`,
      });
    }
  });

  if (otpCopyButtons.length > 0) {
    for (let i = 0; i < otpCopyButtons.length; i += 2) {
      keyboard.push(otpCopyButtons.slice(i, i + 2));
    }
  }

  keyboard.push([
    Markup.button.callback('🔄 Change number', `change_num_${countryCode}`),
    Markup.button.callback('🌏 Change country', 'nav_countries'),
  ]);

  return Markup.inlineKeyboard(keyboard);
};

/**
 * Confirmation dialog for releasing an assigned number
 */
const confirmReleaseKeyboard = (assignmentId) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Yes, Release', `do_release_${assignmentId}`),
      Markup.button.callback('❌ Cancel', `cancel_release_${assignmentId}`),
    ],
  ]);
};

/**
 * Deposit amount quick-select keyboard
 */
const depositAmountKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💵 1 USDT', 'deposit_1'),
      Markup.button.callback('💵 2 USDT', 'deposit_2'),
      Markup.button.callback('💵 5 USDT', 'deposit_5'),
    ],
    [
      Markup.button.callback('💵 10 USDT', 'deposit_10'),
      Markup.button.callback('💵 20 USDT', 'deposit_20'),
      Markup.button.callback('💵 50 USDT', 'deposit_50'),
    ],
    [
      Markup.button.callback('✏️ Custom Amount', 'deposit_custom'),
      Markup.button.callback('🔙 Back', 'back_to_menu'),
    ],
  ]);
};

/**
 * Manual Deposit Action Keyboard
 */
const manualDepositActionKeyboard = (merchantTradeNo) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 Submit Binance Pay ID / TxID', `submit_tx_${merchantTradeNo}`)],
    [Markup.button.callback('🔄 Check Status', `check_pay_${merchantTradeNo}`)],
    [Markup.button.callback('❌ Cancel Order', `cancel_pay_${merchantTradeNo}`)],
  ]);
};

/**
 * Admin Telegram Approval Keyboard
 */
const adminPaymentApprovalKeyboard = (paymentId, amountUSDT) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`✅ Approve ($${Number(amountUSDT).toFixed(2)})`, `admin_approve_pay_${paymentId}`),
      Markup.button.callback('❌ Reject', `admin_reject_pay_${paymentId}`),
    ],
  ]);
};

module.exports = {
  mainKeyboard,
  countrySelectionGrid,
  countryReadyKeyboard,
  serviceSelectionKeyboard,
  singleWhatsAppNumberKeyboard,
  threeNumbersKeyboard,
  confirmReleaseKeyboard,
  countryInlineKeyboard: countrySelectionGrid,
  depositAmountKeyboard,
  manualDepositActionKeyboard,
  adminPaymentApprovalKeyboard,
};
