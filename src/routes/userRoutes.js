const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const blockSchema = z.object({
  body: z.object({
    isBlocked: z.boolean(),
    reason: z.string().optional(),
  }),
});

router.use(requireAuth);

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.patch('/:id/block', validate(blockSchema), userController.blockUser);

module.exports = router;
