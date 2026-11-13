const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
