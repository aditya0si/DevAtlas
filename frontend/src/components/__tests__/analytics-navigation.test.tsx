import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('Analytics navigation', () => {
  beforeEach(() => {
    const fetchMock = jest.fn((url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/india/seed-status')) {
        return Promise.resolve(
          jsonResponse({ has_data: true, total_repos: 100, embedded_repos: 60, ready: true })
        );
      }
      if (href.includes('/india/stats')) {
        return Promise.resolve(jsonResponse(stats));
      }
      if (href.includes('/india/analytics/graphs')) {
        return Promise.resolve(jsonResponse(graphs));
      }
      if (href.includes('/india/compare')) {
        return Promise.resolve(jsonResponse({ comparison, summary, insights: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('navigates from the sidebar to the Analytics screen', async () => {
    render(<ImmersiveHome />);

    const analyticsBtn = screen.getByRole('button', { name: 'Analytics' });
    fireEvent.click(analyticsBtn);

    expect(screen.getByText('Ecosystem Analytics')).toBeInTheDocument();
    expect(screen.getByText('State Comparison')).toBeInTheDocument();
    expect(screen.getByText(String(getCurrentYear()))).toBeInTheDocument();

    // Flush CompareStates async fetch inside act.
    await waitFor(() => {
      expect(screen.getByText('Summary text')).toBeInTheDocument();
    });
  });

  it('renders API-backed analytics graphs on the Analytics screen', async () => {
    render(<ImmersiveHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    await waitFor(() => {
      expect(screen.getByText('Repositories Over Time')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Summary text')).toBeInTheDocument();
    });
  });

  it('renders the state comparison component on the Analytics screen', async () => {
    render(<ImmersiveHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    await waitFor(() => {
      expect(screen.getByText('State A')).toBeInTheDocument();
    });
    expect(screen.getByText('State B')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Summary text')).toBeInTheDocument();
    });
  });

  it('requests analytics graphs with the selected Time Machine year', async () => {
    render(<ImmersiveHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    await waitFor(() => {
      expect(screen.getByText('Repositories Over Time')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Summary text')).toBeInTheDocument();
    });

    const calls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    const graphsCall = calls.find((url) => url.includes('/india/analytics/graphs'));
    expect(graphsCall).toBeDefined();
    expect(graphsCall).toContain(`year=${getCurrentYear()}`);
  });

  it('derives the live ticker and Developer Pulse from API stats, never hardcoded text', async () => {
    render(<ImmersiveHome />);

    // The ticker is derived from the real /india/stats response (top state + repos).
    await waitFor(() => {
      expect(screen.getAllByText('Karnataka leads with 100 repositories').length).toBeGreaterThan(0);
    });

    // No hardcoded synthetic ticker text is rendered.
    expect(screen.queryByText('Hyderabad AI Repos +12% this week')).toBeNull();

    // Developer Pulse percentages derive from the real AI repo percentage (10%).
    await waitFor(() => {
      expect(screen.getByText('+10.0%')).toBeInTheDocument();
    });
  });
});
