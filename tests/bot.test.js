const {
  mainKeyboard,
  countrySelectionGrid,
  countryReadyKeyboard,
  singleWhatsAppNumberKeyboard,
  threeNumbersKeyboard,
} = require('../src/bot/keyboards');
const { formatSingleNumberCard } = require('../src/bot/handlers');
const { getBotStatus } = require('../src/bot');
const DeciderProvider = require('../src/providers/DeciderProvider');

describe('Telegram Bot UI & Decider Provider Suite', () => {
  let decider;

  beforeAll(() => {
    decider = new DeciderProvider();
  });

  describe('Main Persistent Reply Keyboard', () => {
    it('should generate reply keyboard with Get Number and Add Balance buttons', () => {
      expect(mainKeyboard).toBeDefined();
      expect(mainKeyboard.reply_markup).toBeDefined();
      const rows = mainKeyboard.reply_markup.keyboard;
      expect(rows.length).toBe(3);

      // Row 1: [ 📱 Get Number ] [ 💬 Connect WS ]
      const row1 = rows[0].map((b) => (typeof b === 'string' ? b : b.text));
      expect(row1).toEqual(['📱 Get Number', '💬 Connect WS']);

      // Row 2: [ 🗓 Today Calls ] [ 📊 Total Calls ]
      const row2 = rows[1].map((b) => (typeof b === 'string' ? b : b.text));
      expect(row2).toEqual(['🗓 Today Calls', '📊 Total Calls']);

      // Row 3: [ 💰 Add Balance ]
      const row3 = rows[2].map((b) => (typeof b === 'string' ? b : b.text));
      expect(row3).toEqual(['💰 Add Balance']);
    });
  });

  describe('Country Selection Grid (8 Designated Countries)', () => {
    it('should generate a 2-column grid for Ecuador, Colombia, Egypt, Italy, Jordan, Panama, Georgia, Nicaragua', async () => {
      const countries = await decider.getCountries();
      expect(countries.length).toBe(8);

      const countryCodes = countries.map((c) => c.code);
      expect(countryCodes).toEqual(['EC', 'CO', 'EG', 'IT', 'JO', 'PA', 'GE', 'NI']);

      const kb = countrySelectionGrid(countries);
      expect(kb.reply_markup.inline_keyboard.length).toBe(4); // 8 countries in 2 columns = 4 rows

      // Verify each row has 2 buttons
      for (const row of kb.reply_markup.inline_keyboard) {
        expect(row.length).toBe(2);
      }

      // Check first row has Ecuador and Colombia
      expect(kb.reply_markup.inline_keyboard[0][0].text).toContain('Ecuador');
      expect(kb.reply_markup.inline_keyboard[0][0].callback_data).toBe('select_country_EC');
      expect(kb.reply_markup.inline_keyboard[0][1].text).toContain('Colombia');
      expect(kb.reply_markup.inline_keyboard[0][1].callback_data).toBe('select_country_CO');
    });
  });

  describe('Single WhatsApp Number Keyboard & Buttons', () => {
    it('should generate buttons with "Change number" and "Change country"', () => {
      const kb = singleWhatsAppNumberKeyboard({
        numberId: '507f1f77bcf86cd799439011',
        number: '+593981023401',
        countryCode: 'EC',
      });
      const rows = kb.reply_markup.inline_keyboard;

      // Flatten button texts
      const allTexts = rows.flat().map((b) => b.text);
      expect(allTexts).toContain('🔄 Change number');
      expect(allTexts).toContain('🌏 Change country');
      expect(allTexts.some((t) => t.includes('Copy Number'))).toBe(true);
    });

    it('should show "Copy OTP" button as top button when OTP is received', () => {
      const kb = singleWhatsAppNumberKeyboard({
        numberId: '507f1f77bcf86cd799439011',
        number: '+593981023401',
        otpCode: '482195',
        countryCode: 'EC',
      });
      const rows = kb.reply_markup.inline_keyboard;

      // Top row should have Copy OTP button with copy_text
      expect(rows[0][0].text).toBe('📋 Copy OTP: 482195');
      expect(rows[0][0].copy_text.text).toBe('482195');

      // Next row has Copy Number button
      expect(rows[1][0].text).toBe('📋 Copy Number: +593981023401');
      expect(rows[1][0].copy_text.text).toBe('+593981023401');

      // Row 3 has Change number and Change country
      expect(rows[2][0].text).toBe('🔄 Change number');
      expect(rows[2][1].text).toBe('🌏 Change country');
    });
  });

  describe('Single Number Card Formatting & OTP Countdown Display', () => {
    const country = { name: 'Ecuador', code: 'EC', dialCode: '+593', flag: '🇪🇨' };

    it('should format waiting card showing countdown timer before OTP arrives', () => {
      const card = formatSingleNumberCard({
        number: '+593981023401',
        country,
        otpCode: null,
        waitingSeconds: 5,
      });

      expect(card).toContain('`+593981023401`');
      expect(card).toContain('tap to copy');
      expect(card).toContain('Your OTP is being sent in ~5 seconds');
      expect(card).toContain('WhatsApp Account Registration');
    });

    it('should format received OTP card with tap-to-copy code below the number', () => {
      const card = formatSingleNumberCard({
        number: '+593981023401',
        country,
        otpCode: '482195',
        receivedAt: new Date(),
      });

      expect(card).toContain('`+593981023401`');
      expect(card).toContain('`482195`');
      expect(card).toContain('WhatsApp OTP Received');
      expect(card).toContain('tap to copy');
    });
  });

  describe('DeciderProvider Core Features', () => {
    it('should return template numbers for any requested country and service', async () => {
      const numbers = await decider.getAvailableNumbers('CO', 'whatsapp', 1);
      expect(numbers.length).toBe(1);
      expect(numbers[0].number).toMatch(/^\+57310\d{6}$/); // Colombia dial code +57
      expect(numbers[0].service).toBe('whatsapp');
    });

    it('should generate authentic OTPs for WhatsApp', () => {
      const waOtp = decider.generateOtp('whatsapp');
      expect(waOtp.code).toMatch(/^\d{6}$/);
      expect(waOtp.message).toContain('WhatsApp');
    });

    it('should extract OTPs from realistic SMS bodies', () => {
      expect(decider.extractOtp('Your WhatsApp code: 482-195. Do not share.')).toBe('482195');
      expect(decider.extractOtp('Telegram code: 82914')).toBe('82914');
      expect(decider.extractOtp('Your verification PIN is 918234.')).toBe('918234');
    });
  });

  describe('Bot Status', () => {
    it('should report bot status correctly', () => {
      const status = getBotStatus();
      expect(status).toHaveProperty('configured');
      expect(status).toHaveProperty('running');
    });
  });
});
