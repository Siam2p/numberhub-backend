const { connectDB, mongoose } = require('../src/config/db');
const { User, Country, PhoneNumber, Assignment, Message, Admin } = require('../src/models');

describe('Database Models Verification', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('should find seeded countries', async () => {
    const countries = await Country.find({ isActive: true });
    expect(countries.length).toBeGreaterThanOrEqual(6);
    const us = countries.find((c) => c.code === 'US');
    expect(us).toBeDefined();
    expect(us.flag).toBe('🇺🇸');
  });

  it('should find seeded phone numbers with available status', async () => {
    const available = await PhoneNumber.find({ status: 'available' });
    expect(available.length).toBeGreaterThanOrEqual(20);
    expect(available[0]).toHaveProperty('number');
    expect(available[0]).toHaveProperty('capabilities');
  });

  it('should verify admin password comparison works', async () => {
    const admin = await Admin.findOne({ email: 'admin@numberhub.local' });
    expect(admin).toBeDefined();
    const isMatch = await admin.comparePassword('Admin123456!');
    expect(isMatch).toBe(true);
    const isFalse = await admin.comparePassword('WrongPassword!');
    expect(isFalse).toBe(false);
  });

  it('should create and retrieve a test user', async () => {
    const testTelegramId = `test_${Date.now()}`;
    const user = await User.create({
      telegramId: testTelegramId,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
    });

    expect(user._id).toBeDefined();
    expect(user.displayName()).toBe('Test User');

    // Cleanup
    await User.deleteOne({ _id: user._id });
  });
});
