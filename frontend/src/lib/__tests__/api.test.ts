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
    const name = q?.__query?.[0]?.__collection;
    return snapshotOf(byName[name] || []);
  });
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

  it('derives ecosystem stats from the Firestore repositories and developers collections', async () => {
    respondWithCollection({
      repositories: [
        { id: '1', data: { language: 'Python', domain: 'ai', city: 'Bengaluru', stars: 10, forks: 2 } },
        { id: '2', data: { language: 'Python', domain: 'web', city: 'Mumbai', stars: 5, forks: 1 } },
      ],
      developers: [{ id: 'd1' }, { id: 'd2' }],
    });

    const stats = await api.getEcosystemStats(2024);

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
  });

  it('maps UI domain filters to Firestore where-clauses and omits them for All Projects', async () => {
    await api.getGeospatialActivity('-180,-90,180,90', { domain: 'Web3', limit: 5000 });
    expect(mockLimit).toHaveBeenCalledWith(5000);
    expect(mockWhere).toHaveBeenCalledWith('domain', '==', 'blockchain');

    mockWhere.mockClear();
    await api.getGeospatialActivity('-180,-90,180,90', { domain: 'All Projects' });
    expect(mockWhere).not.toHaveBeenCalled();

    await api.getGeospatialActivity('-180,-90,180,90', { domain: 'AI' });
    expect(mockWhere).toHaveBeenCalledWith('domain', '==', 'ai');
  });

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

  it('aggregates analytics graphs from the Firestore repositories collection', async () => {
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
  });

  it('returns repository details for an existing Firestore document', async () => {
    mockGetDoc.mockResolvedValue(
      documentOf('repo-1', {
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
      })
    );

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

  it('reports seed status from the Firestore repositories and stats collections', async () => {
    mockGetDocs.mockImplementation(async (q: any) => {
      const name = q?.__query?.[0]?.__collection;
      if (name === 'repositories') return snapshotOf([{ id: '1' }]);
      if (name === 'stats') return snapshotOf([{ id: 'latest', data: { repos_synced: 42 } }]);
      return snapshotOf([]);
    });

    const status = await api.getSeedStatus();

    expect(status.has_data).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.total_repos).toBe(42);
  });

  it('resolves coverage stats from Firestore repositories and developers', async () => {
    respondWithCollection({
      repositories: [
        { id: '1', data: { coordinates: { longitude: 1, latitude: 1 } } },
        { id: '2', data: {} },
      ],
      developers: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }],
    });

    const coverage = await api.getCoverageStats();

    expect(coverage.users_total).toBe(3);
    expect(coverage.repos_total).toBe(2);
    expect(coverage.repos_with_events).toBe(0);
    expect(coverage.avg_geocoding_confidence).toBe(0);
  });

  it('resolves an empty insights list in Firestore mode', async () => {
    await expect(api.getInsights(5)).resolves.toEqual([]);
  });

  it('rejects features that require server-side processing', async () => {
    await expect(api.semanticSearch('python')).rejects.toThrow(
      'Semantic search requires server-side embeddings'
    );
    await expect(
      api.explainTrends({ entity_name: 'India', current_value: 120, previous_value: 100 })
    ).rejects.toThrow('Trend explanation requires server-side AI');
    await expect(api.compareStates('Karnataka', 'Maharashtra')).rejects.toThrow(
      'State comparison requires server-side processing'
    );
    await expect(api.getStateDashboard('Karnataka')).rejects.toThrow(
      'State dashboard not available in Firestore mode'
    );
  });

  it('rejects auth flows that are not configured in Firestore mode', async () => {
    await expect(api.login({ email: 'a@b.c', password: 'x' })).rejects.toThrow(
      'Auth not configured in Firestore mode'
    );
    await expect(
      api.register({ email: 'a@b.c', password: 'x', full_name: 'A' })
    ).rejects.toThrow('Auth not configured in Firestore mode');
    await expect(api.getCurrentUser()).resolves.toBeNull();
  });

  it('resolves static activity layers without hitting Firestore', async () => {
    const layers = await api.getActivityLayers();
    expect(layers.base_layers.map((l) => l.id)).toContain('heatmap');
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
