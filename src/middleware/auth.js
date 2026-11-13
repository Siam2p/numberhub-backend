const jwt = require('jsonwebtoken');
const config = require('../config');
const { Admin } = require('../models');

const generateToken = (admin) => {
  return jwt.sign(
    {
      id: admin._id,
      email: admin.email,
      role: admin.role,
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
};

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No Bearer token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token.',
      });
    }

    const admin = await Admin.findById(decoded.id).select('-passwordHash');
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive or no longer exists.',
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Requires one of [${roles.join(', ')}] role`,
      });
    }
    next();
  };
};

module.exports = {
  generateToken,
  requireAuth,
  requireRole,
};
