const { connectDB, mongoose } = require('../config/db');
const config = require('../config');
const { Country, PhoneNumber, Admin, User, Assignment, Message, AuditLog, SystemSetting } = require('../models');

// The 8 official designated countries specified by user:
// Ecuador, Colombia, Egypt, Italy, Jordan, Panama, Georgia, Nicaragua
const sampleCountries = [
  { name: 'Ecuador', code: 'EC', dialCode: '+593', flag: '🇪🇨', isActive: true, basePrice: 0.11, price: 0.13 },
  { name: 'Colombia', code: 'CO', dialCode: '+57', flag: '🇨🇴', isActive: true, basePrice: 0.12, price: 0.14 },
  { name: 'Egypt', code: 'EG', dialCode: '+20', flag: '🇪🇬', isActive: true, basePrice: 0.12, price: 0.14 },
  { name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹', isActive: true, basePrice: 0.20, price: 0.22 },
  { name: 'Jordan', code: 'JO', dialCode: '+962', flag: '🇯🇴', isActive: true, basePrice: 0.14, price: 0.16 },
  { name: 'Panama', code: 'PA', dialCode: '+507', flag: '🇵🇦', isActive: true, basePrice: 0.08, price: 0.10 },
  { name: 'Georgia', code: 'GE', dialCode: '+995', flag: '🇬🇪', isActive: true, basePrice: 0.14, price: 0.16 },
  { name: 'Nicaragua', code: 'NI', dialCode: '+505', flag: '🇳🇮', isActive: true, basePrice: 0.08, price: 0.10 },
];

const sampleNumbersByCode = {
  EC: [
    '+593981023401',
    '+593981023402',
    '+593981023403',
    '+593981023404',
    '+593981023405',
    '+593981023406',
  ],
  CO: [
    '+573105550101',
    '+573105550102',
    '+573105550103',
    '+573105550104',
    '+573105550105',
    '+573105550106',
  ],
  EG: [
    '+201012345001',
    '+201012345002',
    '+201012345003',
    '+201012345004',
    '+201012345005',
    '+201012345006',
  ],
  IT: [
    '+393401234001',
    '+393401234002',
    '+393401234003',
    '+393401234004',
    '+393401234005',
    '+393401234006',
  ],
  JO: [
    '+962791234001',
    '+962791234002',
    '+962791234003',
    '+962791234004',
    '+962791234005',
    '+962791234006',
  ],
  PA: [
    '+50761234001',
    '+50761234002',
    '+50761234003',
    '+50761234004',
    '+50761234005',
    '+50761234006',
  ],
  GE: [
    '+995591234001',
    '+995591234002',
    '+995591234003',
    '+995591234004',
    '+995591234005',
    '+995591234006',
  ],
  NI: [
    '+50581234001',
    '+50581234002',
    '+50581234003',
    '+50581234004',
    '+50581234005',
    '+50581234006',
  ],
};

const seedDatabase = async () => {
  try {
    await connectDB();
    console.log('[Seed] Seeding database with Decider-based WhatsApp & Telegram numbers...');

    // 1. Seed or update Admin
    let admin = await Admin.findOne({ email: config.adminEmail.toLowerCase() });
    if (!admin) {
      const passwordHash = await Admin.hashPassword(config.adminPassword);
      admin = await Admin.create({
        email: config.adminEmail.toLowerCase(),
        passwordHash,
        name: 'System Superadmin',
        role: 'superadmin',
      });
      console.log(`[Seed] Created default admin: ${admin.email}`);
    } else {
      console.log(`[Seed] Default admin already exists: ${admin.email}`);
    }

    // 1.5 Seed System Settings (5SIM & Binance)
    let setting = await SystemSetting.findOne({ key: 'payment_config' });
    if (!setting) {
      setting = await SystemSetting.create({
        key: 'payment_config',
        smsProvider: 'fivesim',
        fiveSimApiKey: process.env.FIVESIM_API_KEY || config.fiveSimApiKey,
        binancePayId: process.env.BINANCE_PAY_ID || '987654321',
        binanceUid: process.env.BINANCE_UID || '876543210',
        binanceAddress: process.env.BINANCE_USDT_ADDRESS || 'TYDzsYndWh2EzfNgPv5smvWgkBFqRmsBgp',
        payeeName: process.env.BINANCE_PAYEE_NAME || 'NumberHub Pay',
        network: 'TRC20 / BEP20',
      });
      console.log('[Seed] Created default SystemSetting with 5SIM & Binance configuration.');
    }

    // 2. Seed Countries
    const countryMap = {};
    for (const cData of sampleCountries) {
      let country = await Country.findOne({ code: cData.code });
      if (!country) {
        country = await Country.create(cData);
        console.log(`[Seed] Created country: ${country.flag} ${country.name} (${country.code}) - $${country.price}`);
      } else {
        // Keep active and updated with price
        country.name = cData.name;
        country.flag = cData.flag;
        country.dialCode = cData.dialCode;
        country.basePrice = cData.basePrice;
        country.price = cData.price;
        await country.save();
      }
      countryMap[cData.code] = country;
    }

    // 3. Seed Authorized Phone Numbers with Decider provider
    let totalCreated = 0;
    for (const [code, numbers] of Object.entries(sampleNumbersByCode)) {
      const country = countryMap[code];
      if (!country) continue;

      for (let i = 0; i < numbers.length; i++) {
        const num = numbers[i];
        const existing = await PhoneNumber.findOne({ number: num });
        if (!existing) {
          await PhoneNumber.create({
            number: num,
            countryId: country._id,
            provider: 'decider',
            providerNumberId: `decider-num-${code.toLowerCase()}-${i + 1}`,
            capabilities: ['sms', 'whatsapp', 'telegram'],
            supportedServices: ['whatsapp', 'telegram'],
            status: 'available',
          });
          totalCreated++;
        } else {
          existing.capabilities = ['sms', 'whatsapp', 'telegram'];
          existing.supportedServices = ['whatsapp', 'telegram'];
          existing.provider = 'decider';
          existing.status = 'available';
          await existing.save();
        }
      }
    }

    console.log(`[Seed] Successfully seeded ${totalCreated} new phone numbers across ${sampleCountries.length} countries.`);
    console.log('[Seed] Database initialization complete.');
  } catch (err) {
    console.error('[Seed] Database seed error:', err);
  } finally {
    await mongoose.connection.close();
  }
};

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, sampleCountries, sampleNumbersByCode };
