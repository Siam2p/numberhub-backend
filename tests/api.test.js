const request = require('supertest');
const app = require('../src/app');
const { connectDB, mongoose } = require('../src/config/db');
const { User, Country, PhoneNumber, Assignment, Message, Admin } = require('../src/models');

describe('Full NumberHub REST API Integration Test Suite', () => {
  let authToken = '';
  let testUser = null;
  let testNumber = null;
  let testAssignment = null;

  beforeAll(async () => {
    await connectDB();

    // 1. Authenticate as admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@numberhub.local', password: 'Admin123456!' });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.success).toBe(true);
    authToken = loginRes.body.token;

    // 2. Setup a test Telegram user
    testUser = await User.findOneAndUpdate(
      { telegramId: '999888777' },
      { username: 'apitestuser', firstName: 'API', lastName: 'Tester', isBlocked: false },
      { upsert: true, new: true }
    );

    // 3. Find an available phone number
    testNumber = await PhoneNumber.findOne({ status: 'available' });
    expect(testNumber).toBeDefined();
  });

  afterAll(async () => {
    // Cleanup any created test assignment and messages
    if (testAssignment) {
      await Message.deleteMany({ assignmentId: testAssignment._id });
      await Assignment.deleteOne({ _id: testAssignment._id });
      await PhoneNumber.findByIdAndUpdate(testNumber._id, {
        status: 'available',
        currentAssignmentId: null,
      });
    }
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.connection.close();
  });

  describe('Authentication API', () => {
    it('GET /api/auth/me should return admin profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.admin.email).toBe('admin@numberhub.local');
    });

    it('GET /api/auth/me should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Countries & Inventory API', () => {
    it('GET /api/countries should return countries list with inventory counts', async () => {
      const res = await request(app).get('/api/countries');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.countries)).toBe(true);
      expect(res.body.countries.length).toBeGreaterThan(0);
      expect(res.body.countries[0]).toHaveProperty('totalNumbers');
      expect(res.body.countries[0]).toHaveProperty('availableNumbers');
    });

    it('GET /api/numbers/available should return available inventory', async () => {
      const res = await request(app).get('/api/numbers/available');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.numbers.length).toBeGreaterThan(0);
    });
  });

  describe('Number Assignment & Release Lifecycle', () => {
    it('POST /api/assignments should assign an available number to the user', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUser._id.toString(),
          phoneNumberId: testNumber._id.toString(),
          durationHours: 12,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      testAssignment = res.body.assignment;
      expect(testAssignment.status).toBe('active');

      // Verify number status was atomically updated to assigned
      const updatedPhone = await PhoneNumber.findById(testNumber._id);
      expect(updatedPhone.status).toBe('assigned');
    });

    it('POST /api/assignments should prevent duplicate assignment of the same number', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUser._id.toString(),
          phoneNumberId: testNumber._id.toString(),
        });

      expect(res.statusCode).toBe(500); // Or 400 from service error
      expect(res.body.message).toMatch(/no longer available/i);
    });

    it('POST /api/assignments/:id/release should release assigned number back to pool', async () => {
      const res = await request(app)
        .post(`/api/assignments/${testAssignment._id}/release`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'admin_revoked' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.assignment.status).toBe('released');

      // Verify number status reverted to available
      const updatedPhone = await PhoneNumber.findById(testNumber._id);
      expect(updatedPhone.status).toBe('available');
    });
  });

  describe('SMS Provider Webhook & Inbound Message Processing', () => {
    let activeTestAssignment = null;

    beforeAll(async () => {
      // Re-assign number to test incoming SMS
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUser._id.toString(),
          phoneNumberId: testNumber._id.toString(),
          durationHours: 24,
        });
      activeTestAssignment = res.body.assignment;
    });

    afterAll(async () => {
      if (activeTestAssignment) {
        await Assignment.findByIdAndUpdate(activeTestAssignment._id, { status: 'released' });
        await PhoneNumber.findByIdAndUpdate(testNumber._id, { status: 'available' });
      }
    });

    it('POST /api/webhooks/sms should process incoming authorized SMS', async () => {
      const payload = {
        messageId: `msg_${Date.now()}`,
        from: '+19876543210',
        to: testNumber.number,
        body: 'Your NumberHub verification code is 482910.',
        timestamp: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/webhooks/sms')
        .set('x-webhook-secret', 'mock-webhook-secret-xyz')
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('processed');

      // Verify message is saved in MongoDB
      const savedMsg = await Message.findOne({ providerMessageId: payload.messageId });
      expect(savedMsg).toBeDefined();
      expect(savedMsg.body).toBe(payload.body);
    });

    it('POST /api/webhooks/sms should safely ignore duplicate webhooks', async () => {
      const payload = {
        messageId: `duplicate_test_${Date.now()}`,
        from: '+19876543210',
        to: testNumber.number,
        body: 'First delivery attempt',
      };

      // First call
      await request(app)
        .post('/api/webhooks/sms')
        .set('x-webhook-secret', 'mock-webhook-secret-xyz')
        .send(payload);

      // Second call with same messageId
      const res2 = await request(app)
        .post('/api/webhooks/sms')
        .set('x-webhook-secret', 'mock-webhook-secret-xyz')
        .send(payload);

      expect(res2.statusCode).toBe(200);
      expect(res2.body.status).toBe('duplicate_ignored');
    });
  });

  describe('Admin Dashboard Metrics API', () => {
    it('GET /api/admin/dashboard should return comprehensive metrics and chart data', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats).toHaveProperty('totalUsers');
      expect(res.body.stats).toHaveProperty('totalNumbers');
      expect(res.body.stats).toHaveProperty('availableNumbers');
      expect(res.body.stats).toHaveProperty('assignedNumbers');
      expect(Array.isArray(res.body.chartData)).toBe(true);
      expect(res.body.chartData.length).toBe(7);
    });

    it('POST /api/admin/numbers/sync should synchronize inventory from provider', async () => {
      const res = await request(app)
        .post('/api/admin/numbers/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ countryCode: 'US' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('syncedCountries');
    });
  });
});
