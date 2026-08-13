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

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('Story Mode controls', () => {
  beforeEach(() => {
    const fetchMock = jest.fn((url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/india/seed-status')) {
        return Promise.resolve(jsonResponse({ has_data: true, total_repos: 100, embedded_repos: 60, ready: true }));
      }
      if (href.includes('/india/stats')) {
        return Promise.resolve(jsonResponse(stats));
      }
      return Promise.resolve(jsonResponse({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
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
});