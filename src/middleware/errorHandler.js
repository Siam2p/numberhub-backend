const config = require('../config');

const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
};

const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err);

  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || undefined,
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
  });
};

module.exports = { notFoundHandler, errorHandler };
