/**
 * Data-mode routing: `api.ts` picks its data layer once, at module load, from
 * NEXT_PUBLIC_DATA_MODE. Both layers are mocked here so the wiring itself is
 * what gets asserted. (The Firestore behaviour of the default mode is covered
 * by api.test.ts.)
 */

const mockHttpApi = {
  getEcosystemStats: jest.fn(),
  getInsights: jest.fn(),
  getIndiaOverview: jest.fn(),
  getStateDashboard: jest.fn(),
  getGeospatialActivity: jest.fn(),
  getAnalyticsGraphs: jest.fn(),
  getRepositoryDetails: jest.fn(),
  semanticSearch: jest.fn(),
  explainTrends: jest.fn(),
  compareStates: jest.fn(),
  getDiscovery: jest.fn(),
  getIndiaEcosystemScores: jest.fn(),
  getSeedStatus: jest.fn(),
  streamAskDevAtlas: jest.fn(),
  getActivityHeatmap: jest.fn(),
  getActivityLayers: jest.fn(),
  getStateActivityScores: jest.fn(),
  getCityActivityScores: jest.fn(),
  getEcosystemScores: jest.fn(),
  getDomainStatistics: jest.fn(),
  getLanguageStatistics: jest.fn(),
  getDailyActivity: jest.fn(),
  getMonthlyActivity: jest.fn(),
  getGrowthMetrics: jest.fn(),
  getCoverageStats: jest.fn(),
};

const mockFirestoreApi = {
  getEcosystemStats: jest.fn(),
  getIndiaOverview: jest.fn(),
  getGeospatialActivity: jest.fn(),
  getAnalyticsGraphs: jest.fn(),
  getRepositoryDetails: jest.fn(),
  getDiscovery: jest.fn(),
  getIndiaEcosystemScores: jest.fn(),
  getSeedStatus: jest.fn(),
  getCoverageStats: jest.fn(),
  getActivityLayers: jest.fn(),
};

jest.mock('@/lib/httpApi', () => ({ httpApi: mockHttpApi }));
jest.mock('@/lib/firestoreApi', () => ({ firestoreApi: mockFirestoreApi }));

// The api module also pulls these in transitively; mocking the Firebase client
// boundary keeps the suite hermetic if routing ever regresses to Firestore.
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

type ApiModule = typeof import('../api');

const loadApi = (mode?: string): ApiModule => {
  if (mode === undefined) {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
  } else {
    process.env.NEXT_PUBLIC_DATA_MODE = mode;
  }
  jest.resetModules();
  return require('../api') as ApiModule;
};

describe('data-mode routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_DATA_MODE;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  describe('default mode (firestore)', () => {
    it('keeps using the Firestore data layer when NEXT_PUBLIC_DATA_MODE is unset', async () => {
      const { api, DATA_MODE } = loadApi();
      mockFirestoreApi.getEcosystemStats.mockResolvedValue({ total_repositories: 1 });

      expect(DATA_MODE).toBe('firestore');
      const stats = await api.getEcosystemStats(2024, new AbortController().signal);

      expect(stats).toEqual({ total_repositories: 1 });
      expect(mockFirestoreApi.getEcosystemStats).toHaveBeenCalledTimes(1);
      expect(mockHttpApi.getEcosystemStats).not.toHaveBeenCalled();
    });

    it('treats any other value as firestore mode', () => {
      expect(loadApi('API').DATA_MODE).toBe('firestore');
      expect(loadApi('rest').DATA_MODE).toBe('firestore');
      expect(loadApi('').DATA_MODE).toBe('firestore');
    });

    it('keeps server-side-only features unavailable in the static deploy', async () => {
      const { api } = loadApi();
      const onError = jest.fn();

      await expect(api.semanticSearch('python')).rejects.toMatchObject({ status: 501 });
      await expect(api.compareStates('Karnataka', 'Kerala')).rejects.toMatchObject({ status: 501 });
      expect(api.streamAskDevAtlas('hi', jest.fn(), jest.fn(), onError)).toEqual(expect.any(Function));
      expect(onError).toHaveBeenCalledTimes(1);
      expect(mockHttpApi.semanticSearch).not.toHaveBeenCalled();
    });

    it('resolves insights as an empty list without the API', async () => {
      const { api } = loadApi();
      await expect(api.getInsights(5)).resolves.toEqual([]);
      expect(mockHttpApi.getInsights).not.toHaveBeenCalled();
    });
  });

  describe('api mode', () => {
    it('routes every Firestore-backed method to the HTTP client', async () => {
      const { api, DATA_MODE } = loadApi('api');
      mockHttpApi.getEcosystemStats.mockResolvedValue({ total_repositories: 7 });
      mockHttpApi.getIndiaOverview.mockResolvedValue({ title: 'overview' });
      mockHttpApi.getGeospatialActivity.mockResolvedValue({ type: 'FeatureCollection', features: [] });
      mockHttpApi.getAnalyticsGraphs.mockResolvedValue({ repositories_over_time: [] });
      mockHttpApi.getRepositoryDetails.mockResolvedValue({ id: 'repo-1' });
      mockHttpApi.getDiscovery.mockResolvedValue({ trending_repositories: [] });
      mockHttpApi.getIndiaEcosystemScores.mockResolvedValue([{ state: 'Karnataka' }]);
      mockHttpApi.getSeedStatus.mockResolvedValue({ has_data: true });
      mockHttpApi.getCoverageStats.mockResolvedValue({ users_total: 1 });
      mockHttpApi.getActivityLayers.mockResolvedValue({ base_layers: [] });

      const signal = new AbortController().signal;
      const options = { domain: 'AI', limit: 400, signal };

      expect(DATA_MODE).toBe('api');
      expect(await api.getEcosystemStats(2023, signal)).toEqual({ total_repositories: 7 });
      expect(await api.getIndiaOverview(2023, signal)).toEqual({ title: 'overview' });
      expect(await api.getGeospatialActivity('-180,-90,180,90', options)).toEqual({
        type: 'FeatureCollection',
        features: [],
      });
      expect(await api.getAnalyticsGraphs('year', 2023, signal)).toEqual({ repositories_over_time: [] });
      expect(await api.getRepositoryDetails('repo-1', signal)).toEqual({ id: 'repo-1' });
      expect(await api.getDiscovery(signal)).toEqual({ trending_repositories: [] });
      expect(await api.getIndiaEcosystemScores(2023, signal)).toEqual([{ state: 'Karnataka' }]);
      expect(await api.getSeedStatus(signal)).toEqual({ has_data: true });
      expect(await api.getCoverageStats()).toEqual({ users_total: 1 });
      expect(await api.getActivityLayers()).toEqual({ base_layers: [] });

      expect(mockHttpApi.getEcosystemStats).toHaveBeenCalledWith(2023, signal);
      expect(mockHttpApi.getIndiaOverview).toHaveBeenCalledWith(2023, signal);
      expect(mockHttpApi.getGeospatialActivity).toHaveBeenCalledWith('-180,-90,180,90', options);
      expect(mockHttpApi.getAnalyticsGraphs).toHaveBeenCalledWith('year', 2023, signal);
      expect(mockHttpApi.getRepositoryDetails).toHaveBeenCalledWith('repo-1', signal);
      expect(mockHttpApi.getDiscovery).toHaveBeenCalledWith(signal);
      expect(mockHttpApi.getIndiaEcosystemScores).toHaveBeenCalledWith(2023, signal);
      expect(mockHttpApi.getSeedStatus).toHaveBeenCalledWith(signal);

      // Nothing falls through to the Firestore layer in api mode.
      for (const spy of Object.values(mockFirestoreApi)) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    it('calls the real backend for the methods that used to reject', async () => {
      const { api } = loadApi('api');
      mockHttpApi.getStateDashboard.mockResolvedValue({ state: 'Karnataka' });
      mockHttpApi.semanticSearch.mockResolvedValue({ query: 'python', results: [], total: 0 });
      mockHttpApi.explainTrends.mockResolvedValue({ summary: 'growing' });
      mockHttpApi.compareStates.mockResolvedValue({ comparison: {}, summary: {}, insights: [] });

      const signal = new AbortController().signal;
      const trendParams = {
        entity_name: 'India',
        current_value: 120,
        previous_value: 100,
        entity_type: 'national',
      };

      expect(await api.getStateDashboard('Karnataka', 2023, signal)).toEqual({ state: 'Karnataka' });
      expect(await api.semanticSearch('python', 5, signal)).toEqual({
        query: 'python',
        results: [],
        total: 0,
      });
      expect(await api.explainTrends(trendParams, signal)).toEqual({ summary: 'growing' });
      expect(await api.compareStates('Karnataka', 'Kerala', 2023, signal)).toEqual({
        comparison: {},
        summary: {},
        insights: [],
      });

      expect(mockHttpApi.getStateDashboard).toHaveBeenCalledWith('Karnataka', 2023, signal);
      expect(mockHttpApi.semanticSearch).toHaveBeenCalledWith('python', 5, signal);
      expect(mockHttpApi.explainTrends).toHaveBeenCalledWith(trendParams, signal);
      expect(mockHttpApi.compareStates).toHaveBeenCalledWith('Karnataka', 'Kerala', 2023, signal);
    });

    it('streams the copilot over the backend and returns its close handle', () => {
      const { api } = loadApi('api');
      const close = jest.fn();
      mockHttpApi.streamAskDevAtlas.mockReturnValue(close);

      const handlers = {
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onSession: jest.fn(),
        onCitations: jest.fn(),
      };

      const returned = api.streamAskDevAtlas(
        'top repos',
        handlers.onChunk,
        handlers.onComplete,
        handlers.onError,
        handlers.onSession,
        handlers.onCitations,
        'session-1'
      );

      expect(returned).toBe(close);
      expect(mockHttpApi.streamAskDevAtlas).toHaveBeenCalledWith(
        'top repos',
        handlers.onChunk,
        handlers.onComplete,
        handlers.onError,
        handlers.onSession,
        handlers.onCitations,
        'session-1'
      );
    });

    it('routes insights, statistics and score panels to the backend', async () => {
      const { api } = loadApi('api');
      mockHttpApi.getInsights.mockResolvedValue([{ id: 'i1' }]);
      mockHttpApi.getStateActivityScores.mockResolvedValue([{ entity_key: 'KA' }]);
      mockHttpApi.getCityActivityScores.mockResolvedValue([]);
      mockHttpApi.getEcosystemScores.mockResolvedValue([]);
      mockHttpApi.getDomainStatistics.mockResolvedValue([]);
      mockHttpApi.getLanguageStatistics.mockResolvedValue([]);
      mockHttpApi.getDailyActivity.mockResolvedValue([]);
      mockHttpApi.getMonthlyActivity.mockResolvedValue([]);
      mockHttpApi.getGrowthMetrics.mockResolvedValue({ weekly_growth_percent: 1 });
      mockHttpApi.getActivityHeatmap.mockResolvedValue({ type: 'FeatureCollection', features: [] });

      expect(await api.getInsights(3)).toEqual([{ id: 'i1' }]);
      expect(await api.getStateActivityScores('30d', 5)).toEqual([{ entity_key: 'KA' }]);
      await api.getCityActivityScores('7d', 5);
      await api.getEcosystemScores('city', '30d', 5);
      await api.getDomainStatistics('30d', 5);
      await api.getLanguageStatistics('30d', 5);
      await api.getDailyActivity(14);
      await api.getMonthlyActivity(6);
      await api.getGrowthMetrics();
      await api.getActivityHeatmap({ bbox: '-1,-1,1,1', layer: 'ai' });

      expect(mockHttpApi.getInsights).toHaveBeenCalledWith(3, undefined);
      expect(mockHttpApi.getStateActivityScores).toHaveBeenCalledWith('30d', 5);
      expect(mockHttpApi.getCityActivityScores).toHaveBeenCalledWith('7d', 5);
      expect(mockHttpApi.getEcosystemScores).toHaveBeenCalledWith('city', '30d', 5);
      expect(mockHttpApi.getDailyActivity).toHaveBeenCalledWith(14);
      expect(mockHttpApi.getMonthlyActivity).toHaveBeenCalledWith(6);
      expect(mockHttpApi.getActivityHeatmap).toHaveBeenCalledWith({ bbox: '-1,-1,1,1', layer: 'ai' });

      for (const spy of Object.values(mockFirestoreApi)) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });
});
