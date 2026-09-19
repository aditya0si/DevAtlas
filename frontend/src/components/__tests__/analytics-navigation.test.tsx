import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImmersiveHome from '../../app/page';
import { getCurrentYear } from '../../lib/dates';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

jest.mock('next/dynamic', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => {
      const MockComponent = () => React.createElement('div', { 'data-testid': 'mock-map' });
      MockComponent.displayName = 'MockDynamicMap';
      return MockComponent;
    },
  };
});

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    logout: jest.fn(),
    setShowAuthModal: jest.fn(),
  }),
}));

const mockGetSeedStatus = jest.fn();
const mockGetEcosystemStats = jest.fn();
const mockGetAnalyticsGraphs = jest.fn();
const mockCompareStates = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getSeedStatus: (...args: unknown[]) => mockGetSeedStatus(...args),
    getEcosystemStats: (...args: unknown[]) => mockGetEcosystemStats(...args),
    getAnalyticsGraphs: (...args: unknown[]) => mockGetAnalyticsGraphs(...args),
    compareStates: (...args: unknown[]) => mockCompareStates(...args),
  },
}));

const ORIGINAL_DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE;

// This suite covers analytics in the API-backed build: the panels are expected
// to call their (mocked) endpoints and render the returned data. The
// Firestore-only "needs the DevAtlas API" behaviour is covered by
// api-unavailable.test.tsx.
beforeEach(() => {
  process.env.NEXT_PUBLIC_DATA_MODE = 'api';
});

afterEach(() => {
  if (ORIGINAL_DATA_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
  } else {
    process.env.NEXT_PUBLIC_DATA_MODE = ORIGINAL_DATA_MODE;
  }
});

// Rendering the whole page mounts several async panels at once; the default 5s
// per-test budget is too tight on a loaded machine, which made this suite flaky.
jest.setTimeout(30000);

const stats = {
  total_repositories: 100,
  total_events: 500,
  active_developers: 50,
  total_developers: 50,
  total_stars: 1000,
  total_forks: 100,
  ai_repo_percentage: 10,
  top_language: 'Python',
  top_state: 'Karnataka',
  top_states: [{ state: 'Karnataka', repositories: 100, rank: 1 }],
  top_languages: [{ language: 'Python', count: 10 }],
  top_domains: [{ domain: 'ai', count: 5 }],
  growth_metrics: { weekly_growth: 1, monthly_growth: 2, quarterly_growth: 3, repos_this_week: 1, repos_this_month: 2 },
};

const graphs = {
  repositories_over_time: [{ date: '2026-01-01', value: 1 }],
  technology_growth: [],
  language_popularity: [],
  top_domains: [],
  growth_trend: [],
  state_comparison: [],
};

const comparison = {
  state_a: 'Bengaluru',
  state_b: 'Mumbai',
  repository_count_a: 100,
  repository_count_b: 90,
  developer_activity_a: 50,
  developer_activity_b: 45,
  growth_rate_a: 10,
  growth_rate_b: 8,
  top_languages_a: [{ language: 'Python', count: 10 }],
  top_languages_b: [{ language: 'Python', count: 8 }],
  ai_repos_a: 1,
  ai_repos_b: 1,
  cybersecurity_repos_a: 0,
  cybersecurity_repos_b: 0,
  healthcare_repos_a: 0,
  healthcare_repos_b: 0,
  robotics_repos_a: 0,
  robotics_repos_b: 0,
  opensource_repos_a: 0,
  opensource_repos_b: 0,
  avg_stars_a: 5,
  avg_stars_b: 4,
  innovation_score_a: 10,
  innovation_score_b: 9,
  growth_score_a: 10,
  growth_score_b: 9,
  top_organizations_a: [],
  top_organizations_b: [],
};

const summary = {
  entity_a: 'a',
  entity_b: 'b',
  summary: 'Summary text',
  winner: null,
  score_difference: 0,
  strengths_a: [],
  strengths_b: [],
  weaknesses_a: [],
  weaknesses_b: [],
  opportunities: [],
  recommendations: [],
  confidence_score: 0.5,
};

/** Render the page, navigate to Analytics and wait for every panel to settle. */
const openAnalytics = async () => {
  render(<ImmersiveHome />);

  fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

  // Both panels resolve independently; await their real content before
  // asserting, so no test depends on wall-clock ordering.
  await screen.findByText('Summary text');
  await screen.findByText('Repositories Over Time');
};

describe('Analytics navigation', () => {
  beforeEach(() => {
    mockGetSeedStatus.mockReset().mockResolvedValue({
      has_data: true,
      total_repos: 100,
      embedded_repos: 60,
      ready: true,
    });
    mockGetEcosystemStats.mockReset().mockResolvedValue(stats);
    mockGetAnalyticsGraphs.mockReset().mockResolvedValue(graphs);
    mockCompareStates.mockReset().mockResolvedValue({ comparison, summary, insights: [] });
  });

  it('navigates from the sidebar to the Analytics screen', async () => {
    render(<ImmersiveHome />);

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    // Await the async panels first — assertions on the settled screen follow.
    await screen.findByText('Summary text');

    expect(screen.getByText('Ecosystem Analytics')).toBeInTheDocument();
    expect(screen.getByText('State Comparison')).toBeInTheDocument();
    expect(screen.getByText(String(getCurrentYear()))).toBeInTheDocument();
  });

  it('renders data-backed analytics graphs on the Analytics screen', async () => {
    await openAnalytics();

    expect(screen.getByText('Repositories Over Time')).toBeInTheDocument();
    expect(screen.getByText('State A')).toBeInTheDocument();
    expect(screen.getByText('State B')).toBeInTheDocument();
  });

  it('renders the state comparison component on the Analytics screen', async () => {
    await openAnalytics();

    expect(screen.getByText('State A')).toBeInTheDocument();
    expect(screen.getByText('State B')).toBeInTheDocument();
    expect(screen.getByText('Metrics Comparison')).toBeInTheDocument();
    expect(screen.getByText('Summary text')).toBeInTheDocument();
  });

  it('requests analytics graphs with the selected Time Machine year', async () => {
    await openAnalytics();

    expect(mockGetAnalyticsGraphs).toHaveBeenCalledWith(
      'month',
      getCurrentYear(),
      expect.any(AbortSignal)
    );
    expect(mockCompareStates).toHaveBeenCalledWith(
      'Bengaluru',
      'Mumbai',
      getCurrentYear(),
      expect.any(AbortSignal)
    );
  });

  it('derives the live ticker and Developer Pulse from API stats, never hardcoded text', async () => {
    render(<ImmersiveHome />);

    // The ticker is derived from the real ecosystem stats response (top state + repos).
    const tickerItems = await screen.findAllByText('Karnataka leads with 100 repositories');
    expect(tickerItems.length).toBeGreaterThan(0);

    // No hardcoded synthetic ticker text is rendered.
    expect(screen.queryByText('Hyderabad AI Repos +12% this week')).toBeNull();

    // Developer Pulse shows the real AI repo share (10%) — a share, not a
    // growth rate, so it is labelled and rendered without a "+" prefix.
    expect(await screen.findByText('AI repos (share of tracked)')).toBeInTheDocument();
    expect(screen.getByText('10.0%')).toBeInTheDocument();
  });
});
