/**
 * Domain helpers shared between the map, filter pills and API client.
 *
 * The backend classifies repositories into domains stored on
 * ``classification.domain`` (e.g. "ai", "cybersecurity", "blockchain"). We
 * deliberately do NOT invent hash-based categories for repositories that lack
 * a classification — uncategorized repositories render with the neutral color.
 */

/** Domain values accepted by the backend `/geospatial/activity` endpoint. */
export const API_DOMAINS = [
  'ai',
  'cybersecurity',
  'healthcare',
  'robotics',
  'web',
  'mobile',
  'devops',
  'blockchain',
  'opensource',
] as const;

/** Map the UI filter pill label to the backend `domain` query param. */
export const FILTER_TO_API_DOMAIN: Record<string, string> = {
  'All Projects': '',
  'AI': 'ai',
  'Cybersecurity': 'cybersecurity',
  'Healthcare': 'healthcare',
  'Robotics': 'robotics',
  'DevOps': 'devops',
  'Web3': 'blockchain',
};

/**
 * Convert a UI filter label to the API `domain` param (or undefined for
 * "All Projects" / unknown labels).
 */
export function filterToApiDomain(filter: string): string | undefined {
  const mapped = FILTER_TO_API_DOMAIN[filter];
  if (!mapped) return undefined;
  return mapped || undefined;
}

/** Domain (as stored in `classification.domain`) -> map node color. */
export const DOMAIN_COLORS: Record<string, string> = {
  ai: '#8B5CF6', // violet
  'ai/ml': '#8B5CF6',
  cybersecurity: '#4F8BFF', // blue
  healthcare: '#10B981', // emerald
  robotics: '#FFB547', // amber
  web: '#38bdf8', // sky
  mobile: '#38bdf8',
  devops: '#06B6D4', // cyan
  blockchain: '#EC4899', // pink
  opensource: '#38bdf8',
};

/** Neutral color for repositories without a classification. */
export const DEFAULT_DOMAIN_COLOR = '#38bdf8';

/** Extract the real classified domain from a feature, or null if uncategorized. */
export function getFeatureDomain(
  classification: Record<string, any> | null | undefined
): string | null {
  if (!classification) return null;
  const domain = classification.domain;
  if (typeof domain === 'string' && domain.trim() !== '') {
    return domain.trim();
  }
  return null;
}

/**
 * Resolve the visual category for a feature. Returns the real classified
 * domain (never a fake/hash-based assignment) or 'General'.
 */
export function getFeatureCategory(
  classification: Record<string, any> | null | undefined
): string {
  return getFeatureDomain(classification) || 'General';
}

/** Resolve a map node color from the real classification. */
export function getDomainColor(
  classification: Record<string, any> | null | undefined
): string {
  const domain = getFeatureDomain(classification);
  if (!domain) return DEFAULT_DOMAIN_COLOR;
  const key = domain.toLowerCase();
  return DOMAIN_COLORS[key] || DEFAULT_DOMAIN_COLOR;
}
