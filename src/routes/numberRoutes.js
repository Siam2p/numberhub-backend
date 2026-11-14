const express = require('express');
const router = express.Router();
const numberController = require('../controllers/numberController');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const createNumberSchema = z.object({
  body: z.object({
    number: z.string().min(5),
    countryId: z.string().length(24),
    provider: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
  }),
});

// Available numbers for allocation
router.get('/available', numberController.getAvailable);

// Simulate or trigger OTP for testing/verification
router.post('/simulate-otp', numberController.simulateOtp);
router.post('/otp', numberController.simulateOtp);

// Protected inventory endpoints
router.get('/', requireAuth, numberController.getNumbers);
router.get('/:id', requireAuth, numberController.getNumberById);
router.post('/', requireAuth, validate(createNumberSchema), numberController.createNumber);
router.patch('/:id', requireAuth, numberController.updateNumber);
router.delete('/:id', requireAuth, numberController.deleteNumber);

module.exports = router;
