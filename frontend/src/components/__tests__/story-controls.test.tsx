import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImmersiveHome from '../../app/page';

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

// The page must never boot the real data client here: importing it initialises
// the Firebase SDK inside jsdom ("heartbeats undefined") and can leave timers
// behind that make Jest force-exit a worker. A minimal deterministic fake keeps
// this suite isolated and fast.
const mockGetSeedStatus = jest.fn();
const mockGetEcosystemStats = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getSeedStatus: (...args: unknown[]) => mockGetSeedStatus(...args),
    getEcosystemStats: (...args: unknown[]) => mockGetEcosystemStats(...args),
  },
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

// Rendering the full page mounts several async panels; the default 5s per-test
// budget is too tight on a loaded machine (and the page's intro timers can make
// assertions race). Give headroom without weakening any assertion.
jest.setTimeout(30000);

describe('Story Mode controls', () => {
  beforeEach(() => {
    mockGetSeedStatus.mockReset().mockResolvedValue({
      has_data: true,
      total_repos: 100,
      embedded_repos: 60,
      ready: true,
    });
    mockGetEcosystemStats.mockReset().mockResolvedValue(stats);
  });

  it('opens the story overlay with accessible pause, skip and close controls', async () => {
    render(<ImmersiveHome />);

    fireEvent.click(screen.getByRole('button', { name: 'Story Mode' }));

    await waitFor(() => {
      expect(screen.getByText('Story Mode Playing')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Pause story' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip to next story step' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close story mode' })).toBeInTheDocument();
  });

  it('pauses and resumes the story via the toggle control', async () => {
    render(<ImmersiveHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Story Mode' }));

    await waitFor(() => {
      expect(screen.getByText('Story Mode Playing')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pause story' }));
    expect(screen.getByText('Story Mode Paused')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume story' }));
    expect(screen.getByText('Story Mode Playing')).toBeInTheDocument();
  });

  it('closes the story overlay via the close control', async () => {
    render(<ImmersiveHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Story Mode' }));

    await waitFor(() => {
      expect(screen.getByText('Story Mode Playing')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close story mode' }));
    await waitFor(() => {
      expect(screen.queryByText('Story Mode Playing')).not.toBeInTheDocument();
    });
  });

  it('marks the story tour as illustrative so its titles are not read as data', async () => {
    render(<ImmersiveHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Story Mode' }));

    await waitFor(() => {
      expect(
        screen.getByText('Illustrative tour — editorial titles, not measured rankings')
      ).toBeInTheDocument();
    });
  });
});

describe('ImmersiveHome with no data', () => {
  beforeEach(() => {
    mockGetSeedStatus.mockReset().mockResolvedValue({
      has_data: false,
      total_repos: 0,
      embedded_repos: 0,
      ready: false,
    });
    mockGetEcosystemStats.mockReset().mockResolvedValue({
      ...stats,
      total_repositories: 0,
      total_developers: 0,
      total_stars: 0,
      total_events: 0,
      ai_repo_percentage: 0,
      top_states: [],
      top_languages: [],
      top_domains: [],
      growth_metrics: {},
    });
  });

  it('renders the hero and map shell plus an explicit "no data yet" state instead of crashing', async () => {
    render(<ImmersiveHome />);

    // Hero + map shell are present immediately — no blocking interstitial.
    expect(screen.getByRole('heading', { name: 'DevAtlas' })).toBeInTheDocument();
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();

    // The explicit no-data state replaces the old fake-progress overlay.
    const notice = await screen.findByTestId('no-data-notice');
    expect(notice).toHaveTextContent('No data yet');
    expect(screen.queryByText('Preparing Your Experience')).not.toBeInTheDocument();

    // The ticker states that it is waiting for data rather than inventing any.
    expect(screen.getByTestId('live-ticker')).toHaveTextContent(
      'Live ecosystem data will appear once repositories are loaded'
    );
  });
});
