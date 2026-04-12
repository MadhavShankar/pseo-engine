/**
 * ContentProvider interface — all providers must implement these methods.
 *
 * Context object shape:
 * {
 *   primaryKeyword: string,
 *   urlSlug: string,
 *   siteType: string,
 *   siteDescription: string,
 *   primaryModifier: string,
 *   secondaryModifier: string,
 *   clusterIntent: string,
 *   brandVoice: string,
 *   targetPersona: string,
 *   siteName: string,
 *   baseUrl: string,
 *   existingContent: object   // already-generated slots for this page
 * }
 *
 * Rules object shape: comes from the template manifest's contentRules for each slot.
 */

export class ContentProvider {
  /**
   * Returns provider metadata.
   * @returns {{ name: string, requiresApiKey: boolean, description: string }}
   */
  getMetadata() {
    throw new Error('getMetadata() must be implemented by provider');
  }

  /**
   * Checks if the provider is configured and reachable.
   * @returns {Promise<{ ok: boolean, message: string }>}
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by provider');
  }

  /**
   * Generates content for a single slot.
   * @param {string} slotName
   * @param {object} context
   * @param {object} rules - from manifest contentRules[slotName]
   * @returns {Promise<string>} Generated content string
   */
  async generateSlot(slotName, context, rules) {
    throw new Error('generateSlot() must be implemented by provider');
  }

  /**
   * Generates all slots for a page in a single call.
   * More efficient than calling generateSlot for each slot.
   * @param {string[]} slots - Array of slot names to generate
   * @param {object} context
   * @param {object} rules - from manifest contentRules
   * @returns {Promise<object>} Map of slotName -> content string
   */
  async generatePage(slots, context, rules) {
    throw new Error('generatePage() must be implemented by provider');
  }
}
