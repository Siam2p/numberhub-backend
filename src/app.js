const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { mongoose } = require('./config/db');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust proxy for rate limiters behind reverse proxies
app.set('trust proxy', 1);

// Security Headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];
      if (
        allowed.includes(origin) ||
        config.nodeEnv === 'development' ||
        origin.endsWith('.vercel.app') ||
        (config.frontendUrl && origin.includes(config.frontendUrl))
      ) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
  })
);

// HTTP Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use('/api', globalLimiter);

// Body parser
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: {
      status: dbStatusMap[dbState] || 'unknown',
      connected: dbState === 1,
    },
    version: '1.0.0',
    environment: config.nodeEnv,
  });
});

// Mount Main API Routes
app.use('/api', routes);

// Root API welcome
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'NumberHub API',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      countries: '/api/countries',
      numbers: '/api/numbers',
      assignments: '/api/assignments',
      messages: '/api/messages',
      webhooks: '/api/webhooks',
      admin: '/api/admin',
    },
  });
});

// 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
