const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/numberhub',
  botToken: process.env.BOT_TOKEN || '',
  jwtSecret: process.env.JWT_SECRET || 'numberhub_fallback_secret_change_me',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@numberhub.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin123456!',
  smsProvider: process.env.SMS_PROVIDER || 'decider',
  smsProviderApiKey: process.env.FIVESIM_API_KEY || process.env.SMS_PROVIDER_API_KEY || '',
  fiveSimApiKey: process.env.FIVESIM_API_KEY || '',
  smsProviderWebhookSecret: process.env.SMS_PROVIDER_WEBHOOK_SECRET || 'mock-webhook-secret',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  retentionDays: parseInt(process.env.MESSAGE_RETENTION_DAYS || '7', 10),
};

module.exports = config;
