const DeciderProvider = require('./DeciderProvider');
const FiveSimProvider = require('./FiveSimProvider');
const FreeTempProvider = require('./FreeTempProvider');
const MockSmsProvider = require('./MockSmsProvider');
const config = require('../config');

let currentProvider = null;

const getProvider = () => {
  if (!currentProvider) {
    const providerName = (config.smsProvider || 'decider').toLowerCase();
    switch (providerName) {
      case 'fivesim':
      case '5sim':
        currentProvider = new FiveSimProvider();
        break;
      case 'freetemp':
      case 'free':
        currentProvider = new FreeTempProvider();
        break;
      case 'mock':
        currentProvider = new MockSmsProvider();
        break;
      case 'decider':
      default:
        currentProvider = new DeciderProvider();
        break;
    }
  }
  return currentProvider;
};

// Reset provider instance (useful in tests or when switching via Admin Dashboard)
const setProvider = (providerInstance) => {
  currentProvider = providerInstance;
};

module.exports = {
  getProvider,
  setProvider,
  DeciderProvider,
  FiveSimProvider,
  FreeTempProvider,
  MockSmsProvider,
};
