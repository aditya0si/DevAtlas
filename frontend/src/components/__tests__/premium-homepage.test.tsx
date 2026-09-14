import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PremiumHomepage from '../PremiumHomepage';

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
  top_states: [{ state: 'Karnataka', repositories: 12000, rank: 1 }],
  top_languages: [{ language: 'Python', count: 10 }],
  top_domains: [{ domain: 'ai', count: 5 }],
  growth_metrics: { weekly_growth: 1, monthly_growth: 2, quarterly_growth: 3, repos_this_week: 1, repos_this_month: 2 },
  ai_repos_count: 100,
  cybersecurity_repos_count: 50,
  healthcare_repos_count: 10,
  robotics_repos_count: 5,
  web_repos_count: 20,
  mobile_repos_count: 15,
  devops_repos_count: 12,
  blockchain_repos_count: 8,
  opensource_repos_count: 30,
};

describe('PremiumHomepage Firestore-backed stats', () => {
  beforeEach(() => {
    mockGetEcosystemStats.mockReset();
  });

  it('requests ecosystem stats for the selected year through the API client', async () => {
    mockGetEcosystemStats.mockResolvedValue(stats);
    render(<PremiumHomepage year={2024} />);

    await waitFor(() => {
      expect(mockGetEcosystemStats).toHaveBeenCalledWith(2024, expect.any(AbortSignal));
    });
  });

  it('renders data-backed stat labels and the real growth change after loading', async () => {
    mockGetEcosystemStats.mockResolvedValue(stats);
    render(<PremiumHomepage year={2024} />);

    await waitFor(() => {
      expect(screen.getByText('Total Developers')).toBeInTheDocument();
    });
    expect(screen.getByText('Active Repositories')).toBeInTheDocument();
    expect(screen.getByText('AI Repository %')).toBeInTheDocument();
    expect(screen.getByText('Total Stars')).toBeInTheDocument();
    // Change badge is derived from the real monthly growth metric, not invented.
    expect(screen.getByText('+2.0%')).toBeInTheDocument();
  });

  it('shows a truthful error state when the stats request fails', async () => {
    mockGetEcosystemStats.mockRejectedValue(new Error('boom'));
    render(<PremiumHomepage year={2024} />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load ecosystem stats/)).toBeInTheDocument();
    });
  });
});
