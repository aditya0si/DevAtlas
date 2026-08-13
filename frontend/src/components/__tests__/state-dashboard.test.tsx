import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StateDashboard from '../StateDashboard';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const stats = {
  total_repositories: 85000,
  total_events: 1200000,
  active_developers: 50000,
  total_developers: 200000,
  total_stars: 350000,
  total_forks: 70000,
  ai_repo_percentage: 34.2,
  top_language: 'Python',
  top_state: 'Karnataka',
  top_states: [
    { state: 'Karnataka', repositories: 12000, rank: 1 },
    { state: 'Maharashtra', repositories: 9500, rank: 2 },
  ],
  top_languages: [{ language: 'Python', count: 10 }],
  top_domains: [{ domain: 'ai', count: 5 }],
  growth_metrics: { weekly_growth: 1, monthly_growth: 2, quarterly_growth: 3, repos_this_week: 1, repos_this_month: 2 },
};

const dashboard = {
  state: 'Karnataka',
  repository_count: 12000,
  active_developers: 5000,
  top_languages: [{ language: 'Python', count: 10 }],
  fastest_growing_technologies: [],
  ai_summary: 'Karnataka leads the ecosystem.',
  monthly_growth_percent: 3,
  weekly_growth_percent: 1,
  trending_projects: [],
  top_organizations: [],
  activity_graph: [],
};

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('StateDashboard request lifecycle', () => {
  beforeEach(() => {
    const fetchMock = jest.fn((url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/india/stats')) return Promise.resolve(jsonResponse(stats));
      if (href.includes('/india/states/')) return Promise.resolve(jsonResponse(dashboard));
      return Promise.resolve(jsonResponse({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('passes an AbortSignal to the top-states request and aborts it on unmount', async () => {
    const { unmount } = render(<StateDashboard year={2024} />);

    await waitFor(() => {
      expect(screen.getByText('Karnataka')).toBeInTheDocument();
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    const statsCall = calls.find(([url]) => String(url).includes('/india/stats'));
    expect(statsCall).toBeDefined();
    const statsSignal = statsCall[1].signal;
    expect(statsSignal).toBeInstanceOf(AbortSignal);
    expect(statsSignal.aborted).toBe(false);

    unmount();
    expect(statsSignal.aborted).toBe(true);
  });

  it('passes an AbortSignal to the state dashboard request and aborts it on unmount', async () => {
    const { unmount } = render(<StateDashboard year={2024} />);

    await waitFor(() => {
      expect(screen.getByText('Karnataka')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Karnataka'));

    await waitFor(() => {
      expect(screen.getByText('Karnataka leads the ecosystem.')).toBeInTheDocument();
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    const dashboardCall = calls.find(([url]) => String(url).includes('/india/states/'));
    expect(dashboardCall).toBeDefined();
    const dashboardSignal = dashboardCall[1].signal;
    expect(dashboardSignal).toBeInstanceOf(AbortSignal);
    expect(dashboardSignal.aborted).toBe(false);

    unmount();
    expect(dashboardSignal.aborted).toBe(true);
  });
});