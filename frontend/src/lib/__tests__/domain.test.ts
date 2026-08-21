import {
  filterToApiDomain,
  getFeatureDomain,
  getFeatureCategory,
  getDomainColor,
  DOMAIN_COLORS,
  DEFAULT_DOMAIN_COLOR,
} from '../domain';

describe('domain helpers (filter/year changes + real classification)', () => {
  it('maps UI filter labels to backend API domain params', () => {
    expect(filterToApiDomain('AI')).toBe('ai');
    expect(filterToApiDomain('Cybersecurity')).toBe('cybersecurity');
    expect(filterToApiDomain('Healthcare')).toBe('healthcare');
    expect(filterToApiDomain('Robotics')).toBe('robotics');
    expect(filterToApiDomain('DevOps')).toBe('devops');
    expect(filterToApiDomain('Web3')).toBe('blockchain');
  });

  it('returns undefined for "All Projects" and unknown labels', () => {
    expect(filterToApiDomain('All Projects')).toBeUndefined();
    expect(filterToApiDomain('Unknown Label')).toBeUndefined();
  });

  it('extracts the real classified domain from a feature', () => {
    expect(getFeatureDomain({ domain: 'ai', industry: 'ML' })).toBe('ai');
    expect(getFeatureDomain({ domain: '  cybersecurity  ' })).toBe('cybersecurity');
  });

  it('returns null for uncategorized repositories', () => {
    expect(getFeatureDomain(null)).toBeNull();
    expect(getFeatureDomain(undefined)).toBeNull();
    expect(getFeatureDomain({})).toBeNull();
    expect(getFeatureDomain({ industry: 'ML' })).toBeNull();
    expect(getFeatureDomain({ domain: '   ' })).toBeNull();
  });

  it('does NOT assign fake hash-based categories to uncategorized repositories', () => {
    // Regression: the map used to derive a hash-based domain for repos without
    // a classification. Now every uncategorized repo falls back to "General".
    expect(getFeatureCategory(null)).toBe('General');
    expect(getFeatureCategory({})).toBe('General');
    expect(getFeatureCategory({ domain: undefined })).toBe('General');
  });

  it('colors uncategorized repositories with the neutral color', () => {
    expect(getDomainColor(null)).toBe(DEFAULT_DOMAIN_COLOR);
    expect(getDomainColor({})).toBe(DEFAULT_DOMAIN_COLOR);
    expect(getDomainColor({ domain: ' ' })).toBe(DEFAULT_DOMAIN_COLOR);
  });

  it('colors known domains with their real domain color', () => {
    expect(getDomainColor({ domain: 'ai' })).toBe(DOMAIN_COLORS.ai);
    expect(getDomainColor({ domain: 'blockchain' })).toBe(DOMAIN_COLORS.blockchain);
    expect(getDomainColor({ domain: 'cybersecurity' })).toBe(DOMAIN_COLORS.cybersecurity);
  });
});
