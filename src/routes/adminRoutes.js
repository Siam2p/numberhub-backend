const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');
const numberController = require('../controllers/numberController');
const assignmentController = require('../controllers/assignmentController');
const messageController = require('../controllers/messageController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/dashboard', adminController.getDashboard);
router.get('/users', userController.getUsers);
router.get('/users/:id/history', userController.getUserHistory);
router.patch('/users/:id', userController.updateUser);
router.get('/numbers', numberController.getNumbers);
router.get('/assignments', assignmentController.getAssignments);
router.get('/messages', messageController.getMessages);
router.post('/numbers/sync', adminController.syncNumbers);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/settings', adminController.getSettings);
router.get('/settings/payment', adminController.getPaymentSettings);
router.post('/settings/payment', adminController.updatePaymentSettings);

module.exports = router;
