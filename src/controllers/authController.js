const { Admin } = require('../models');
const { generateToken } = require('../middleware/auth');
const { logAuditEvent } = require('../utils/auditLogger');

class AuthController {
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required.',
        });
      }

      const admin = await Admin.findOne({ email: email.toLowerCase() });
      if (!admin || !admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials or inactive account.',
        });
      }

      const isMatch = await admin.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials.',
        });
      }

      admin.lastLogin = new Date();
      await admin.save();

      const token = generateToken(admin);

      await logAuditEvent({
        req,
        admin,
        action: 'ADMIN_LOGIN',
        targetType: 'Admin',
        targetId: admin._id,
      });

      res.status(200).json({
        success: true,
        message: 'Logged in successfully.',
        token,
        admin: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          lastLogin: admin.lastLogin,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res) {
    // JWT is stateless on server, frontend clears token
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  }

  async me(req, res) {
    res.status(200).json({
      success: true,
      admin: {
        id: req.admin._id,
        email: req.admin.email,
        name: req.admin.name,
        role: req.admin.role,
        lastLogin: req.admin.lastLogin,
      },
    });
  }
}

module.exports = new AuthController();
