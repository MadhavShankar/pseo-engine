import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_SITE_TYPES = [
  'saas-landing', 'blog', 'ecom', 'local-business',
  'app-download', 'directory', 'news', 'portfolio'
];

/**
 * Load a site type definition by ID.
 * @param {string} id - Site type ID
 * @returns {object} Site type definition object
 */
export function getSiteType(id) {
  if (!VALID_SITE_TYPES.includes(id)) {
    throw new Error(
      `Unknown site type: "${id}"\n` +
      `Valid site types are: ${VALID_SITE_TYPES.join(', ')}\n` +
      `Run "npx pseo-engine init" to see site type descriptions.`
    );
  }
  const filePath = join(__dirname, `${id}.json`);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to load site type "${id}" from ${filePath}: ${err.message}`);
  }
}

/**
 * List all available site types with basic metadata.
 * @returns {Array<{id, displayName, description}>}
 */
export function listSiteTypes() {
  return VALID_SITE_TYPES.map(id => {
    const def = getSiteType(id);
    return { id: def.id, displayName: def.displayName, description: def.description };
  });
}

/**
 * Validate a template manifest against a site type.
 * Warns on unknown slots (allows custom slots), does not error.
 * @param {object} manifest - Template manifest object
 * @param {string} siteTypeId - Site type ID
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateTemplateAgainstSiteType(manifest, siteTypeId) {
  const siteType = getSiteType(siteTypeId);
  const warnings = [];

  const allDeclaredSlots = [
    ...(manifest.requiredSlots || []),
    ...(manifest.optionalSlots || []),
    ...(manifest.customSlots || [])
  ];

  for (const slot of allDeclaredSlots) {
    if (!siteType.suggestedSlots.includes(slot) && !(manifest.customSlots || []).includes(slot)) {
      warnings.push(
        `Slot "${slot}" is not in the suggested slots for site type "${siteTypeId}". ` +
        `This is allowed if it's a custom slot — add it to customSlots in your manifest to silence this warning.`
      );
    }
  }

  return { valid: true, warnings };
}
