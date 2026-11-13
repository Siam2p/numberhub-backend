/**
 * Base SMS Provider Adapter Interface
 * All SMS provider integrations (Mock, Twilio, Bandwidth, etc.) must implement these methods.
 */
class BaseProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Fetch supported countries from provider
   * @returns {Promise<Array<{ code: string, name: string, dialCode: string }>>}
   */
  async getCountries() {
    throw new Error(`getCountries() not implemented by ${this.name}`);
  }

  /**
   * Fetch available phone numbers for a country from provider
   * @param {string} countryCode
   * @returns {Promise<Array<{ providerNumberId: string, number: string, capabilities: string[] }>>}
   */
  async getAvailableNumbers(countryCode) {
    throw new Error(`getAvailableNumbers() not implemented by ${this.name}`);
  }

  /**
   * Rent or allocate a number with the provider
   * @param {string} providerNumberId
   * @returns {Promise<{ success: boolean, providerNumberId: string }>}
   */
  async assignNumber(providerNumberId) {
    throw new Error(`assignNumber() not implemented by ${this.name}`);
  }

  /**
   * Release or cancel a number allocation with the provider
   * @param {string} providerNumberId
   * @returns {Promise<{ success: boolean }>}
   */
  async releaseNumber(providerNumberId) {
    throw new Error(`releaseNumber() not implemented by ${this.name}`);
  }

  /**
   * Verify cryptographic signature or webhook secret of incoming request
   * @param {object} req - Express request object
   * @returns {boolean}
   */
  verifyWebhook(req) {
    throw new Error(`verifyWebhook() not implemented by ${this.name}`);
  }

  /**
   * Normalize incoming provider webhook payload into standard message structure
   * @param {object} req - Express request object
   * @returns {{ providerMessageId: string, from: string, to: string, body: string, timestamp: Date }}
   */
  parseIncomingMessage(req) {
    throw new Error(`parseIncomingMessage() not implemented by ${this.name}`);
  }
}

module.exports = BaseProvider;
