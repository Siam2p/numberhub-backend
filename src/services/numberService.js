const { PhoneNumber, Country } = require('../models');
const { getProvider } = require('../providers');

class NumberService {
  async getAvailableNumbers({ countryCode, limit = 50 } = {}) {
    const query = { status: 'available' };

    if (countryCode) {
      const country = await Country.findOne({ code: countryCode.toUpperCase() });
      if (!country) {
        throw new Error(`Country code "${countryCode}" not found`);
      }
      query.countryId = country._id;
    }

    return PhoneNumber.find(query)
      .populate('countryId', 'name code flag dialCode')
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();
  }

  async getNumberById(id) {
    return PhoneNumber.findById(id).populate('countryId', 'name code flag dialCode');
  }

  async getNumberByE164(e164Number) {
    // Clean spaces and dashes
    const cleanNumber = e164Number.replace(/\s+/g, '').trim();
    return PhoneNumber.findOne({ number: cleanNumber }).populate('countryId');
  }

  async listNumbers({ page = 1, limit = 20, status, countryId, search } = {}) {
    const query = {};
    if (status) query.status = status;
    if (countryId) query.countryId = countryId;
    if (search) {
      query.number = { $regex: search, $options: 'i' };
    }

    const skip = (page - 1) * limit;
    const [numbers, total] = await Promise.all([
      PhoneNumber.find(query)
        .populate('countryId', 'name code flag dialCode')
        .populate('currentAssignmentId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PhoneNumber.countDocuments(query),
    ]);

    return {
      numbers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async addAuthorizedNumber({ number, countryId, provider = 'mock', capabilities = ['sms'] }) {
    const existing = await PhoneNumber.findOne({ number });
    if (existing) {
      throw new Error(`Phone number ${number} is already in the inventory.`);
    }

    const country = await Country.findById(countryId);
    if (!country) {
      throw new Error('Country not found.');
    }

    return PhoneNumber.create({
      number,
      countryId: country._id,
      provider,
      capabilities,
      status: 'available',
    });
  }

  /**
   * Sync inventory from SMS provider for a given country or all countries
   */
  async syncInventory(countryCode) {
    const provider = getProvider();
    const countriesToSync = countryCode
      ? [await Country.findOne({ code: countryCode.toUpperCase() })]
      : await Country.find({ isActive: true });

    let addedCount = 0;
    const results = [];

    for (const country of countriesToSync) {
      if (!country) continue;
      const providerNumbers = await provider.getAvailableNumbers(country.code);

      for (const item of providerNumbers) {
        const existing = await PhoneNumber.findOne({ number: item.number });
        if (!existing) {
          await PhoneNumber.create({
            number: item.number,
            countryId: country._id,
            provider: provider.name,
            providerNumberId: item.providerNumberId,
            capabilities: item.capabilities || ['sms'],
            status: 'available',
          });
          addedCount++;
        }
      }

      results.push({
        country: country.code,
        foundInProvider: providerNumbers.length,
      });
    }

    return {
      syncedCountries: results.length,
      newNumbersAdded: addedCount,
      details: results,
    };
  }
}

module.exports = new NumberService();
