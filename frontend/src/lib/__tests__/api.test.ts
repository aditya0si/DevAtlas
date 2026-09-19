import { api } from '../api';

// The frontend data layer queries Firestore directly. Mock the Firebase client
// boundary (the module that owns the Firestore SDK) instead of stubbing fetch.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({ db: {} }));

import { collection, getDocs, doc, getDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { MAX_CLIENT_READ_LIMIT } from '../firestoreApi';

const mockCollection = collection as jest.Mock;
const mockGetDocs = getDocs as jest.Mock;
const mockDoc = doc as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockQuery = query as jest.Mock;
const mockWhere = where as jest.Mock;
const mockOrderBy = orderBy as jest.Mock;
const mockLimit = limit as jest.Mock;

/** Build the shape returned by a Firestore QuerySnapshot. */
const snapshotOf = (docs: Array<{ id: string; data?: Record<string, any> }>) => ({
  forEach: (cb: (d: { id: string; data: () => Record<string, any> }) => void) =>
    docs.forEach((d) => cb({ id: d.id, data: () => d.data || {} })),
});

/** Build the shape returned by an existing DocumentSnapshot. */
const documentOf = (id: string, data: Record<string, any>) => ({
  id,
  exists: () => true,
  data: () => data,
});

const missingDocument = () => ({
  id: 'missing',
  exists: () => false,
  data: () => undefined,
});

/** Resolve getDocs for a named collection, defaulting to an empty snapshot. */
const respondWithCollection = (byName: Record<string, Array<{ id: string; data?: Record<string, any> }>>) => {
  mockGetDocs.mockImplementation(async (q: any) => {
    const name = collectionOf(q) ?? '';
    return snapshotOf(byName[name] || []);
  });
};

/** Resolve getDoc for `<collection>/<id>` paths, defaulting to "missing". */
const respondWithDocuments = (byPath: Record<string, Record<string, any>>) => {
  mockGetDoc.mockImplementation(async (ref: any) => {
    const [coll, id] = ref?.__doc ?? [];
    const data = byPath[`${coll}/${id}`];
    return data ? documentOf(id, data) : missingDocument();
  });
};

const collectionOf = (q: any): string | undefined => q?.__query?.[0]?.__collection;
const constraintsOf = (q: any): Array<Record<string, any>> =>
  (q?.__query ?? []).filter((part: any) => part && part.__constraint);

/** Every collection query recorded so far, with its collection name + constraints. */
const recordedQueries = () =>
  mockGetDocs.mock.calls.map(([q]: any[]) => ({
    name: collectionOf(q),
    constraints: constraintsOf(q),
  }));

/** Contract from BOARD.md — written by the sync worker (agent A5). */
const ECOSYSTEM_AGGREGATE = {
  total_repositories: 4200,
  total_developers: 900,
  total_stars: 12000,
  total_forks: 800,
  top_languages: [
    { language: 'Python', count: 1500 },
    { language: 'TypeScript', count: 900 },
  ],
  top_domains: [
    { domain: 'ai', count: 600 },
    { domain: 'web', count: 500 },
  ],
  ai_repo_percentage: 14.29,
  generated_at: '2026-09-18T00:00:00Z',
  version: 3,
};

const COVERAGE_AGGREGATE = {
  users_total: 900,
  users_enriched: 640,
  users_with_location: 610,
  repos_total: 4200,
  repos_with_location: 3100,
  avg_geocoding_confidence: 0.82,
  generated_at: '2026-09-18T00:00:00Z',
  version: 3,
};

describe('api Firestore data layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCollection.mockImplementation((_db, name) => ({ __collection: name }));
    mockQuery.mockImplementation((...parts) => ({ __query: parts }));
    mockLimit.mockImplementation((n) => ({ __constraint: 'limit', n }));
    mockWhere.mockImplementation((field, op, value) => ({ __constraint: 'where', field, op, value }));
    mockOrderBy.mockImplementation((field, dir) => ({ __constraint: 'orderBy', field, dir }));
    mockDoc.mockImplementation((_db, coll, id) => ({ __doc: [coll, id] }));

    mockGetDocs.mockResolvedValue(snapshotOf([]));
    mockGetDoc.mockResolvedValue(missingDocument());
  });

  // ── Aggregate fast path (S-06) ────────────────────────────────────────────

  describe('aggregate documents', () => {
    it('reads stats/ecosystem as a single document instead of scanning repositories', async () => {
      respondWithDocuments({ 'stats/ecosystem': ECOSYSTEM_AGGREGATE });

      const stats = await api.getEcosystemStats(2024);

      expect(mockDoc).toHaveBeenCalledWith({}, 'stats', 'ecosystem');
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
      expect(mockGetDocs).not.toHaveBeenCalled();
      expect(stats.estimated).toBe(false);
    });

    it('maps the stats/ecosystem contract onto EcosystemStats', async () => {
      respondWithDocuments({ 'stats/ecosystem': ECOSYSTEM_AGGREGATE });

      const stats = await api.getEcosystemStats();

      expect(stats.total_repositories).toBe(4200);
      expect(stats.total_developers).toBe(900);
      expect(stats.active_developers).toBe(900);
      expect(stats.total_stars).toBe(12000);
      expect(stats.total_forks).toBe(800);
      expect(stats.ai_repo_percentage).toBe(14.29);
      expect(stats.top_language).toBe('Python');
      expect(stats.top_languages).toEqual([
        { language: 'Python', count: 1500 },
        { language: 'TypeScript', count: 900 },
      ]);
      expect(stats.top_domains).toEqual([
        { domain: 'ai', count: 600 },
        { domain: 'web', count: 500 },
      ]);
      expect(stats.ai_repos_count).toBe(600);
      expect(stats.web_repos_count).toBe(500);
      expect(stats.cybersecurity_repos_count).toBe(0);
      expect(stats.generated_at).toBe('2026-09-18T00:00:00Z');
    });

    it('reads stats/coverage as a single document for coverage stats', async () => {
      respondWithDocuments({ 'stats/coverage': COVERAGE_AGGREGATE });

      const coverage = await api.getCoverageStats();

      expect(mockDoc).toHaveBeenCalledWith({}, 'stats', 'coverage');
      expect(mockGetDocs).not.toHaveBeenCalled();
      expect(coverage.users_total).toBe(900);
      expect(coverage.users_with_location).toBe(610);
      expect(coverage.repos_total).toBe(4200);
      expect(coverage.avg_geocoding_confidence).toBe(0.82);
      expect(coverage.estimated).toBe(false);
    });

    it('flags the ecosystem fallback as estimated and keeps the query bounded', async () => {
      respondWithCollection({
        repositories: [
          { id: '1', data: { language: 'Python', domain: 'ai', city: 'Bengaluru', stars: 10, forks: 2 } },
          { id: '2', data: { language: 'Python', domain: 'web', city: 'Mumbai', stars: 5, forks: 1 } },
        ],
        developers: [{ id: 'd1' }, { id: 'd2' }],
      });

      const stats = await api.getEcosystemStats(2024);

      // Aggregate doc was attempted first, then the fallback kicked in.
      expect(mockDoc).toHaveBeenCalledWith({}, 'stats', 'ecosystem');
      expect(mockCollection).toHaveBeenCalledWith({}, 'repositories');
      expect(mockCollection).toHaveBeenCalledWith({}, 'developers');
      expect(stats.total_repositories).toBe(2);
      expect(stats.total_developers).toBe(2);
      expect(stats.active_developers).toBe(2);
      expect(stats.total_stars).toBe(15);
      expect(stats.total_forks).toBe(3);
      expect(stats.top_language).toBe('Python');
      expect(stats.top_state).toBe('Bengaluru');
      expect(stats.top_states[0]).toEqual({ state: 'Bengaluru', repositories: 1, rank: 1 });
      expect(stats.ai_repos_count).toBe(1);
      expect(stats.ai_repo_percentage).toBe(50);
      expect(stats.estimated).toBe(true);
    });

    it('flags the coverage fallback as estimated and keeps the query bounded', async () => {
      respondWithCollection({
        repositories: [
          { id: '1', data: { coordinates: { longitude: 1, latitude: 1 } } },
          { id: '2', data: {} },
        ],
        developers: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }],
      });

      const coverage = await api.getCoverageStats();

      expect(mockDoc).toHaveBeenCalledWith({}, 'stats', 'coverage');
      expect(coverage.users_total).toBe(3);
      expect(coverage.repos_total).toBe(2);
      expect(coverage.repos_with_events).toBe(0);
      expect(coverage.avg_geocoding_confidence).toBe(0);
      expect(coverage.estimated).toBe(true);
    });

    it('falls back to the bounded scan when the aggregate read throws', async () => {
      mockGetDoc.mockRejectedValue(new Error('permission denied'));
      respondWithCollection({
        repositories: [{ id: '1', data: { language: 'Go', domain: 'devops', city: 'Pune', stars: 1 } }],
        developers: [{ id: 'd1' }],
      });

      const stats = await api.getEcosystemStats();

      expect(stats.total_repositories).toBe(1);
      expect(stats.estimated).toBe(true);
    });
  });

  // ── Bounded reads (S-06) ──────────────────────────────────────────────────

  describe('bounded collection reads', () => {
    it('never issues an unbounded repositories/developers query from any method', async () => {
      await Promise.all([
        api.getEcosystemStats(),
        api.getIndiaOverview(),
        api.getAnalyticsGraphs('month', 2024),
        api.getDiscovery(),
        api.getIndiaEcosystemScores(),
        api.getSeedStatus(),
        api.getCoverageStats(),
        api.getGeospatialActivity('-180,-90,180,90'),
        api.getGeospatialActivity('-180,-90,180,90', { domain: 'AI', limit: 5000 }),
      ]);

      const scanned = recordedQueries().filter(
        (q) => q.name === 'repositories' || q.name === 'developers'
      );
      expect(scanned.length).toBeGreaterThan(0);
      for (const q of scanned) {
        const limitConstraint = q.constraints.find((c) => c.__constraint === 'limit');
        expect(limitConstraint).toBeDefined();
        expect(limitConstraint!.n).toBeGreaterThan(0);
        expect(limitConstraint!.n).toBeLessThanOrEqual(MAX_CLIENT_READ_LIMIT);
      }
    });

    it('clamps geospatial limits to the client read budget', async () => {
      await api.getGeospatialActivity('-180,-90,180,90', { domain: 'Web3', limit: 5000 });
      expect(mockLimit).toHaveBeenCalledWith(MAX_CLIENT_READ_LIMIT);
      expect(mockWhere).toHaveBeenCalledWith('domain', '==', 'blockchain');

      mockWhere.mockClear();
      await api.getGeospatialActivity('-180,-90,180,90', { domain: 'All Projects' });
      expect(mockWhere).not.toHaveBeenCalled();

      await api.getGeospatialActivity('-180,-90,180,90', { domain: 'AI' });
      expect(mockWhere).toHaveBeenCalledWith('domain', '==', 'ai');
    });

    it('caps the analytics sample and the state score sample', async () => {
      await api.getAnalyticsGraphs('month', 2024);
      expect(mockLimit).toHaveBeenCalledWith(500);

      mockLimit.mockClear();
      await api.getIndiaEcosystemScores();
      expect(mockLimit).toHaveBeenCalledWith(1000);
      for (const call of mockLimit.mock.calls) {
        expect(call[0]).toBeLessThanOrEqual(MAX_CLIENT_READ_LIMIT);
      }
    });
  });

  // ── Document-mapped methods ───────────────────────────────────────────────

  it('builds GeoJSON features only for repositories that have coordinates', async () => {
    respondWithCollection({
      repositories: [
        {
          id: '1',
          data: {
            name: 'atlas',
            full_name: 'org/atlas',
            language: 'TypeScript',
            stars: 100,
            coordinates: { longitude: 77.5946, latitude: 12.9716 },
            classification: { domain: 'ai' },
            domain: 'ai',
            description: 'A repo',
          },
        },
        { id: '2', data: { name: 'no-coords', coordinates: null } },
      ],
    });

    const featureCollection = await api.getGeospatialActivity('-180,-90,180,90');

    expect(featureCollection.type).toBe('FeatureCollection');
    expect(featureCollection.features).toHaveLength(1);
    expect(featureCollection.features[0].geometry.coordinates).toEqual([77.5946, 12.9716]);
    expect(featureCollection.features[0].properties.id).toBe('1');
    expect(featureCollection.features[0].properties.full_name).toBe('org/atlas');
  });

  it('labels map activity as measured when the sync worker wrote activity_score', async () => {
    respondWithCollection({
      repositories: [
        {
          id: '1',
          data: {
            name: 'atlas',
            coordinates: { longitude: 77.59, latitude: 12.97 },
            stars: 100,
            activity_score: 87.5,
          },
        },
      ],
    });

    const featureCollection = await api.getGeospatialActivity('-180,-90,180,90');
    const properties = featureCollection.features[0].properties;

    expect(properties.activity_score).toBe(87.5);
    expect(properties.activity_source).toBe('github_events');
    expect(properties.stars_estimate).toBeUndefined();
  });

  it('labels map activity as a stars estimate when no measured score exists', async () => {
    respondWithCollection({
      repositories: [
        {
          id: '1',
          data: { name: 'atlas', coordinates: { longitude: 77.59, latitude: 12.97 }, stars: 100 },
        },
      ],
    });

    const featureCollection = await api.getGeospatialActivity('-180,-90,180,90');
    const properties = featureCollection.features[0].properties;

    expect(properties.activity_source).toBe('stars_estimate');
    expect(properties.stars_estimate).toBeGreaterThan(0);
    expect(properties.activity_score).toBe(properties.stars_estimate);
  });

  it('builds the India overview from the Firestore ecosystem stats', async () => {
    respondWithCollection({
      repositories: [{ id: '1', data: { language: 'Python', domain: 'ai', city: 'Bengaluru', stars: 1 } }],
      developers: [{ id: 'd1' }],
    });

    const overview = await api.getIndiaOverview(2024);

    expect(overview.title).toBe('DevAtlas India Ecosystem Overview');
    expect(overview.total_repositories).toBe(1);
    expect(overview.summary).toContain('1 repositories tracked');
  });

  describe('getAnalyticsGraphs', () => {
    it('samples repositories for the time series and aggregates languages/domains when available', async () => {
      respondWithDocuments({ 'stats/ecosystem': ECOSYSTEM_AGGREGATE });
      respondWithCollection({
        repositories: [
          { id: '1', data: { language: 'Rust', domain: 'devops', created_at: '2024-01-15T00:00:00Z' } },
          { id: '2', data: { language: 'Rust', domain: 'devops', created_at: '2024-02-15T00:00:00Z' } },
        ],
      });

      const graphs = await api.getAnalyticsGraphs('month', 2024);

      expect(graphs.repositories_over_time).toEqual([
        { date: '2024-01', value: 1 },
        { date: '2024-02', value: 1 },
      ]);
      // Languages/domains come from the aggregate document, not the sample.
      expect(graphs.language_popularity).toEqual([
        { language: 'Python', count: 1500 },
        { language: 'TypeScript', count: 900 },
      ]);
      expect(graphs.top_domains).toEqual([
        { domain: 'ai', count: 600 },
        { domain: 'web', count: 500 },
      ]);
      expect(graphs.estimated).toBe(false);
      expect(graphs.sample_size).toBe(2);
    });

    it('aggregates analytics graphs from the bounded sample and flags them estimated without an aggregate doc', async () => {
      respondWithCollection({
        repositories: [
          { id: '1', data: { language: 'Python', domain: 'ai', created_at: '2024-01-15T00:00:00Z' } },
          { id: '2', data: { language: 'Python', domain: 'web', created_at: '2024-02-15T00:00:00Z' } },
        ],
      });

      const graphs = await api.getAnalyticsGraphs('month', 2024);

      expect(graphs.repositories_over_time).toEqual([
        { date: '2024-01', value: 1 },
        { date: '2024-02', value: 1 },
      ]);
      expect(graphs.language_popularity).toEqual([{ language: 'Python', count: 2 }]);
      expect(graphs.top_domains).toEqual([
        { domain: 'ai', count: 1 },
        { domain: 'web', count: 1 },
      ]);
      expect(graphs.estimated).toBe(true);
    });
  });

  it('returns repository details for an existing Firestore document', async () => {
    respondWithDocuments({
      'repositories/repo-1': {
        name: 'atlas',
        full_name: 'org/atlas',
        description: 'A repo',
        html_url: 'https://github.com/org/atlas',
        language: 'TypeScript',
        stars: 5,
        forks: 2,
        open_issues: 1,
        topics: ['india'],
        default_branch: 'main',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-02-01T00:00:00Z',
        pushed_at: '2024-03-01T00:00:00Z',
        classification: { domain: 'ai' },
        owner_login: 'org',
      },
    });

    const repo = await api.getRepositoryDetails('repo-1');

    expect(mockGetDoc).toHaveBeenCalledWith({ __doc: ['repositories', 'repo-1'] });
    expect(repo.id).toBe('repo-1');
    expect(repo.name).toBe('atlas');
    expect(repo.full_name).toBe('org/atlas');
    expect(repo.stargazers_count).toBe(5);
    expect(repo.forks_count).toBe(2);
    expect(repo.topics).toEqual(['india']);
    expect(repo.owner).toEqual({ login: 'org' });
  });

  it('throws "Repository not found" when the Firestore document does not exist', async () => {
    mockGetDoc.mockResolvedValue(missingDocument());

    await expect(api.getRepositoryDetails('missing')).rejects.toThrow('Repository not found');
  });

  it('reports seed status from the aggregate document when it exists', async () => {
    respondWithDocuments({ 'stats/ecosystem': ECOSYSTEM_AGGREGATE });

    const status = await api.getSeedStatus();

    expect(status.has_data).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.total_repos).toBe(4200);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('reports seed status from a bounded probe and stats/latest without an aggregate', async () => {
    respondWithCollection({ repositories: [{ id: '1' }] });
    respondWithDocuments({ 'stats/latest': { repos_synced: 42, embedded_repos: 7 } });

    const status = await api.getSeedStatus();

    expect(mockDoc).toHaveBeenCalledWith({}, 'stats', 'latest');
    expect(mockLimit).toHaveBeenCalledWith(1);
    expect(status.has_data).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.total_repos).toBe(42);
    expect(status.embedded_repos).toBe(7);
  });

  it('resolves an empty insights list in Firestore mode', async () => {
    await expect(api.getInsights(5)).resolves.toEqual([]);
  });

  // ── Server-side-only features ─────────────────────────────────────────────

  describe('features that need the API backend', () => {
    it('rejects with a typed APIError(501) that names the missing data mode', async () => {
      const cases: Array<[Promise<unknown>, string]> = [
        [api.semanticSearch('python'), 'Semantic search'],
        [
          api.explainTrends({ entity_name: 'India', current_value: 120, previous_value: 100 }),
          'Trend explanation',
        ],
        [api.compareStates('Karnataka', 'Maharashtra'), 'State comparison'],
        [api.getStateDashboard('Karnataka'), 'State dashboard'],
      ];

      for (const [promise, feature] of cases) {
        await expect(promise).rejects.toThrow(new RegExp(`^${feature} requires the DevAtlas API`));
      }

      // The UI's unavailability detection reads status/code, not just text.
      await expect(api.getStateDashboard('Karnataka')).rejects.toMatchObject({
        name: 'APIError',
        status: 501,
        code: 'API_UNAVAILABLE',
      });
    });

    it('reports the copilot stream as unavailable through the error callback', () => {
      const onError = jest.fn();
      const close = api.streamAskDevAtlas('top repos in India', jest.fn(), jest.fn(), onError);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].status).toBe(501);
      expect(onError.mock.calls[0][0].code).toBe('API_UNAVAILABLE');
      expect(typeof close).toBe('function');
    });

    it('rejects auth flows that are not configured in Firestore mode', async () => {
      await expect(api.login({ email: 'a@b.c', password: 'x' })).rejects.toThrow(
        /^Auth requires the DevAtlas API/
      );
      await expect(
        api.register({ email: 'a@b.c', password: 'x', full_name: 'A' })
      ).rejects.toThrow(/^Auth requires the DevAtlas API/);
      await expect(api.getCurrentUser()).resolves.toBeNull();
    });
  });

  it('resolves static activity layers without hitting Firestore', async () => {
    const layers = await api.getActivityLayers();
    expect(layers.base_layers.map((l) => l.id)).toContain('heatmap');
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
