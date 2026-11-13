const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const createAssignmentSchema = z.object({
  body: z.object({
    userId: z.string().length(24),
    phoneNumberId: z.string().length(24),
    durationHours: z.number().int().min(1).max(168).optional(),
  }),
});

router.use(requireAuth);

router.post('/', validate(createAssignmentSchema), assignmentController.createAssignment);
router.get('/', assignmentController.getAssignments);
router.get('/:id', assignmentController.getAssignmentById);
router.post('/:id/release', assignmentController.release);

module.exports = router;
