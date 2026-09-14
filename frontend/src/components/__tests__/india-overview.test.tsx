import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import IndiaOverview from '../IndiaOverview';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const mockGetEcosystemStats = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getEcosystemStats: (...args: unknown[]) => mockGetEcosystemStats(...args),
  },
}));

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

describe('IndiaOverview Firestore-backed stats rendering', () => {
  beforeEach(() => {
    mockGetEcosystemStats.mockReset();
    mockGetEcosystemStats.mockResolvedValue(stats);
  });

  it('renders Firestore-backed metric values', async () => {
    render(<IndiaOverview year={2024} />);

    await waitFor(() => {
      expect(screen.getByText('200.0K')).toBeInTheDocument(); // total_developers
    });
    expect(screen.getByText('85,000')).toBeInTheDocument(); // total_repositories
    expect(screen.getByText('34.2%')).toBeInTheDocument(); // ai_repo_percentage
    expect(screen.getByText('350,000')).toBeInTheDocument(); // total_stars
  });

  it('renders top states from Firestore for the selected year', async () => {
    render(<IndiaOverview year={2024} />);

    // Wait for the data-backed table (repo counts only exist in the real data).
    await waitFor(() => {
      expect(screen.getByText('12,000')).toBeInTheDocument();
    });
    expect(screen.getByText('Karnataka')).toBeInTheDocument();
    expect(screen.getByText('Maharashtra')).toBeInTheDocument();
    expect(screen.getByText('9,500')).toBeInTheDocument();
  });

  it('requests ecosystem stats for the selected year with an AbortSignal', async () => {
    render(<IndiaOverview year={2024} />);

    await waitFor(() => {
      expect(mockGetEcosystemStats).toHaveBeenCalledWith(2024, expect.any(AbortSignal));
    });
  });
});
