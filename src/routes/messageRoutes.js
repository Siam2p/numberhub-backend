const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', messageController.getMessages);
router.get('/:id', messageController.getMessageById);

module.exports = router;
