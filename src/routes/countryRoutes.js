const express = require('express');
const router = express.Router();
const countryController = require('../controllers/countryController');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const createCountrySchema = z.object({
  body: z.object({
    name: z.string().min(2),
    code: z.string().length(2),
    dialCode: z.string().min(1),
    flag: z.string().min(1),
    isActive: z.boolean().optional(),
  }),
});

// Public / Client read endpoint
router.get('/', countryController.getCountries);

// Admin-managed mutations
router.post('/', requireAuth, validate(createCountrySchema), countryController.createCountry);
router.patch('/:id', requireAuth, countryController.updateCountry);

module.exports = router;
