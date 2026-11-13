const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const countryRoutes = require('./countryRoutes');
const numberRoutes = require('./numberRoutes');
const assignmentRoutes = require('./assignmentRoutes');
const messageRoutes = require('./messageRoutes');
const webhookRoutes = require('./webhookRoutes');
const adminRoutes = require('./adminRoutes');
const paymentRoutes = require('./paymentRoutes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/countries', countryRoutes);
router.use('/numbers', numberRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/messages', messageRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);

module.exports = router;
