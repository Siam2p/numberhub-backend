const { Country, PhoneNumber } = require('../models');

class CountryService {
  async getActiveCountries() {
    return Country.find({ isActive: true }).sort({ name: 1 }).lean();
  }

  async getAllCountries() {
    return Country.find().sort({ name: 1 }).lean();
  }

  async getCountryByCode(code) {
    return Country.findOne({ code: code.toUpperCase() }).lean();
  }

  /**
   * Retrieves countries with inventory statistics (total numbers, available numbers)
   */
  async getCountriesWithInventory() {
    const countries = await Country.find().sort({ name: 1 }).lean();

    const stats = await PhoneNumber.aggregate([
      {
        $group: {
          _id: '$countryId',
          totalNumbers: { $sum: 1 },
          availableNumbers: {
            $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] },
          },
          assignedNumbers: {
            $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] },
          },
        },
      },
    ]);

    const statsMap = stats.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr;
      return acc;
    }, {});

    return countries.map((country) => {
      const countryStat = statsMap[country._id.toString()] || {
        totalNumbers: 0,
        availableNumbers: 0,
        assignedNumbers: 0,
      };
      return {
        ...country,
        totalNumbers: countryStat.totalNumbers,
        availableNumbers: countryStat.availableNumbers,
        assignedNumbers: countryStat.assignedNumbers,
      };
    });
  }

  async createCountry(data) {
    const basePrice = data.basePrice !== undefined ? Number(data.basePrice) : 0.13;
    const price = data.price !== undefined ? Number(data.price) : Number((basePrice + 0.02).toFixed(2));

    return Country.create({
      name: data.name.trim(),
      code: data.code.toUpperCase().trim(),
      dialCode: data.dialCode.trim(),
      flag: data.flag.trim(),
      isActive: data.isActive !== undefined ? data.isActive : true,
      basePrice,
      price,
    });
  }

  async updateCountry(id, updateData) {
    if (updateData.basePrice !== undefined && updateData.price === undefined) {
      updateData.price = Number((Number(updateData.basePrice) + 0.02).toFixed(2));
    }
    return Country.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });
  }
}

module.exports = new CountryService();
