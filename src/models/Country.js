const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    dialCode: {
      type: String,
      required: true,
      trim: true,
    },
    flag: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    basePrice: {
      type: Number,
      default: 0.13,
      min: 0,
    },
    price: {
      type: Number,
      default: 0.15,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Country = mongoose.model('Country', countrySchema);

module.exports = Country;
