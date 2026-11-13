const countryService = require('../services/countryService');
const { logAuditEvent } = require('../utils/auditLogger');

class CountryController {
  async getCountries(req, res, next) {
    try {
      const countries = await countryService.getCountriesWithInventory();
      res.status(200).json({
        success: true,
        countries,
      });
    } catch (error) {
      next(error);
    }
  }

  async createCountry(req, res, next) {
    try {
      const country = await countryService.createCountry(req.body);

      await logAuditEvent({
        req,
        action: 'CREATE_COUNTRY',
        targetType: 'Country',
        targetId: country._id,
        details: { code: country.code, name: country.name },
      });

      res.status(201).json({
        success: true,
        country,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCountry(req, res, next) {
    try {
      const country = await countryService.updateCountry(req.params.id, req.body);
      if (!country) {
        return res.status(404).json({ success: false, message: 'Country not found.' });
      }

      await logAuditEvent({
        req,
        action: 'UPDATE_COUNTRY',
        targetType: 'Country',
        targetId: country._id,
        details: req.body,
      });

      res.status(200).json({
        success: true,
        country,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CountryController();
