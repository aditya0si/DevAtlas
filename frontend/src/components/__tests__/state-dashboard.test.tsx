import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StateDashboard from '../StateDashboard';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const mockGetEcosystemStats = jest.fn();
const mockGetStateDashboard = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getEcosystemStats: (...args: unknown[]) => mockGetEcosystemStats(...args),
    getStateDashboard: (...args: unknown[]) => mockGetStateDashboard(...args),
  },
}));

const ORIGINAL_DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE;

const useApiMode = () => {
  process.env.NEXT_PUBLIC_DATA_MODE = 'api';
};

const useFirestoreMode = () => {
  delete process.env.NEXT_PUBLIC_DATA_MODE;
};

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

afterEach(() => {
  if (ORIGINAL_DATA_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
  } else {
    process.env.NEXT_PUBLIC_DATA_MODE = ORIGINAL_DATA_MODE;
  }
});

describe('StateDashboard request lifecycle', () => {
  beforeEach(() => {
    useApiMode();
    mockGetEcosystemStats.mockReset();
    mockGetStateDashboard.mockReset();
    mockGetEcosystemStats.mockResolvedValue(stats);
    mockGetStateDashboard.mockResolvedValue(dashboard);
  });

  it('passes an AbortSignal to the top-states request and aborts it on unmount', async () => {
    const { unmount } = render(<StateDashboard year={2024} />);

    await waitFor(() => {
      expect(screen.getByText('Karnataka')).toBeInTheDocument();
    });

    expect(mockGetEcosystemStats).toHaveBeenCalledWith(2024, expect.any(AbortSignal));
    const statsSignal = mockGetEcosystemStats.mock.calls[0][1] as AbortSignal;
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

    expect(mockGetStateDashboard).toHaveBeenCalledWith('Karnataka', 2024, expect.any(AbortSignal));
    const dashboardSignal = mockGetStateDashboard.mock.calls[0][2] as AbortSignal;
    expect(dashboardSignal.aborted).toBe(false);

    unmount();
    expect(dashboardSignal.aborted).toBe(true);
  });
});

describe('StateDashboard in the Firestore-only build', () => {
  beforeEach(() => {
    useFirestoreMode();
    mockGetEcosystemStats.mockReset().mockResolvedValue(stats);
    mockGetStateDashboard.mockReset();
  });

  it('never calls the dashboard endpoint and shows an explicit "needs the DevAtlas API" notice', async () => {
    render(<StateDashboard year={2024} />);

    await waitFor(() => {
      expect(screen.getByText('Karnataka')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Karnataka'));

    const notice = await screen.findByTestId('api-unavailable-notice');
    expect(notice).toHaveTextContent(
      'The state dashboard needs the DevAtlas API — this build serves Firestore data only.'
    );
    expect(mockGetStateDashboard).not.toHaveBeenCalled();
    // The real state list (Firestore-backed) stays usable; no generic error banner.
    expect(screen.getAllByText('Karnataka').length).toBeGreaterThan(0);
    expect(screen.queryByText('Unable to load state data')).not.toBeInTheDocument();
  });

  it('escalates a rejected dashboard request to the explicit unavailable state', async () => {
    useApiMode();
    mockGetStateDashboard.mockRejectedValue(new Error('State dashboard not available in Firestore mode'));

    render(<StateDashboard year={2024} />);

    await waitFor(() => {
      expect(screen.getByText('Karnataka')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Karnataka'));

    await waitFor(() => {
      expect(screen.getByTestId('api-unavailable-notice')).toBeInTheDocument();
    });
    expect(screen.queryByText('Unable to load state data')).not.toBeInTheDocument();
  });
});
