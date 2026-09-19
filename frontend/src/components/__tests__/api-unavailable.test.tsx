import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SemanticSearch from '../SemanticSearch';
import AnalyticsGraphs from '../AnalyticsGraphs';
import CompareStates from '../CompareStates';
import StateDashboard from '../StateDashboard';
import AskDevAtlas from '../AskDevAtlas';
import { isApiUnavailableError } from '../ui/ApiUnavailable';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const semanticSearch = jest.fn();
const explainTrends = jest.fn();
const compareStates = jest.fn();
const getAnalyticsGraphs = jest.fn();
const getEcosystemStats = jest.fn();
const getStateDashboard = jest.fn();
const streamAskDevAtlas = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    semanticSearch: (...args: unknown[]) => semanticSearch(...args),
    explainTrends: (...args: unknown[]) => explainTrends(...args),
    compareStates: (...args: unknown[]) => compareStates(...args),
    getAnalyticsGraphs: (...args: unknown[]) => getAnalyticsGraphs(...args),
    getEcosystemStats: (...args: unknown[]) => getEcosystemStats(...args),
    getStateDashboard: (...args: unknown[]) => getStateDashboard(...args),
    streamAskDevAtlas: (...args: unknown[]) => streamAskDevAtlas(...args),
  },
}));

// Rendering several async panels in one file; give the suite headroom on a
// loaded machine without ever asserting on wall-clock timing.
jest.setTimeout(30000);

const ORIGINAL_DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE;

/** The shipped default: Firestore data only, no server API. */
const useFirestoreMode = () => {
  delete process.env.NEXT_PUBLIC_DATA_MODE;
};

const useApiMode = () => {
  process.env.NEXT_PUBLIC_DATA_MODE = 'api';
};

afterEach(() => {
  if (ORIGINAL_DATA_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
  } else {
    process.env.NEXT_PUBLIC_DATA_MODE = ORIGINAL_DATA_MODE;
  }
});

const graphs = {
  repositories_over_time: [{ date: '2026-01-01', value: 3 }],
  technology_growth: [],
  language_popularity: [],
  top_domains: [],
  growth_trend: [],
  state_comparison: [],
};

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
  growth_metrics: {},
};

beforeEach(() => {
  [semanticSearch, explainTrends, compareStates, getAnalyticsGraphs, getEcosystemStats, getStateDashboard, streamAskDevAtlas].forEach(
    (mock) => mock.mockReset()
  );
});

describe('unavailable-state notices in the Firestore-only build', () => {
  beforeEach(() => {
    useFirestoreMode();
  });

  it('SemanticSearch disables its input, says why, and never calls semanticSearch', async () => {
    render(<SemanticSearch />);

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('api-unavailable-notice')).toHaveTextContent(
      'Semantic search needs the DevAtlas API — this build serves Firestore data only'
    );

    fireEvent.change(input, { target: { value: 'react developers' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(semanticSearch).not.toHaveBeenCalled();
  });

  it('AnalyticsGraphs disables Explain, shows the notice, and never calls explainTrends', async () => {
    getAnalyticsGraphs.mockResolvedValue(graphs);
    render(<AnalyticsGraphs year={2024} />);

    const explainButton = await screen.findByRole('button', { name: /Explain/ });
    expect(explainButton).toBeDisabled();
    expect(explainButton).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('api-unavailable-notice')).toHaveTextContent(
      'AI trend explanation needs the DevAtlas API — this build serves Firestore data only'
    );

    fireEvent.click(explainButton);
    expect(explainTrends).not.toHaveBeenCalled();
  });

  it('CompareStates disables both selectors and never calls compareStates', async () => {
    render(<CompareStates year={2024} />);

    const notice = await screen.findByTestId('api-unavailable-notice');
    expect(notice).toHaveTextContent(
      'State comparison needs the DevAtlas API — this build serves Firestore data only'
    );

    const selectorA = screen.getByRole('button', { name: /Bengaluru/ });
    const selectorB = screen.getByRole('button', { name: /Mumbai/ });
    expect(selectorA).toBeDisabled();
    expect(selectorA).toHaveAttribute('aria-disabled', 'true');
    expect(selectorB).toBeDisabled();
    expect(selectorB).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(selectorA);
    // A disabled selector must not open its option list.
    expect(screen.queryByText('Chandigarh')).toBeNull();
    expect(compareStates).not.toHaveBeenCalled();
  });

  it('StateDashboard keeps the real state list and explains the missing detail view', async () => {
    getEcosystemStats.mockResolvedValue(stats);
    render(<StateDashboard year={2024} />);

    fireEvent.click(await screen.findByText('Karnataka'));

    const notice = await screen.findByTestId('api-unavailable-notice');
    expect(notice).toHaveTextContent(
      'The state dashboard needs the DevAtlas API — this build serves Firestore data only'
    );
    expect(getStateDashboard).not.toHaveBeenCalled();
    // The state list stays visible (the detail heading repeats the name).
    expect(screen.getAllByText('Karnataka').length).toBeGreaterThan(0);
  });

  it('AskDevAtlas shows the notice, marks the panel "NEEDS API" and never opens a stream', async () => {
    render(<AskDevAtlas query="Who leads?" onClose={jest.fn()} sessionId={undefined} onSessionChange={jest.fn()} />);

    expect(screen.getByTestId('api-unavailable-notice')).toHaveTextContent(
      'The DevAtlas copilot needs the DevAtlas API — this build serves Firestore data only'
    );
    expect(screen.getByText('NEEDS API')).toBeInTheDocument();
    expect(streamAskDevAtlas).not.toHaveBeenCalled();
  });
});

describe('API-mode failures escalate to the same explicit notice', () => {
  beforeEach(() => {
    useApiMode();
  });

  it('AnalyticsGraphs turns a rejected explainTrends call into the notice', async () => {
    getAnalyticsGraphs.mockResolvedValue(graphs);
    explainTrends.mockRejectedValue(new Error('Trend explanation requires server-side AI'));

    render(<AnalyticsGraphs year={2024} />);

    const explainButton = await screen.findByRole('button', { name: /Explain/ });
    expect(explainButton).not.toBeDisabled();

    fireEvent.click(explainButton);

    const notices = await screen.findAllByTestId('api-unavailable-notice');
    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0]).toHaveTextContent('needs the DevAtlas API');
    expect(explainTrends).toHaveBeenCalledTimes(1);
  });

  it('CompareStates turns a rejected compareStates call into the notice', async () => {
    compareStates.mockRejectedValue(new Error('State comparison requires server-side processing'));

    render(<CompareStates year={2024} />);

    // The request is attempted in API mode...
    const notice = await screen.findByTestId('api-unavailable-notice');
    // ...and its rejection produces the same explicit state, not a spinner.
    expect(notice).toHaveTextContent('State comparison needs the DevAtlas API');
    expect(compareStates).toHaveBeenCalledTimes(1);
  });
});

describe('isApiUnavailableError', () => {
  it('recognises the Firestore-mode stub rejections from @/lib/api', () => {
    expect(isApiUnavailableError(new Error('Semantic search requires server-side embeddings'))).toBe(true);
    expect(isApiUnavailableError(new Error('State dashboard not available in Firestore mode'))).toBe(true);
    expect(isApiUnavailableError(new Error('Copilot requires server-side streaming'))).toBe(true);
    expect(isApiUnavailableError(new Error('Auth not configured in Firestore mode'))).toBe(true);
  });

  it('recognises the typed APIError(501, API_UNAVAILABLE) raised by the client', () => {
    const apiError = Object.assign(
      new Error(
        'Semantic search requires the DevAtlas API — this build serves Firestore data only (set NEXT_PUBLIC_DATA_MODE=api)'
      ),
      { name: 'APIError', status: 501, code: 'API_UNAVAILABLE' }
    );
    expect(isApiUnavailableError(apiError)).toBe(true);
  });

  it('does not swallow aborts or genuine errors', () => {
    const abort = new Error('The operation was aborted.');
    abort.name = 'AbortError';
    expect(isApiUnavailableError(abort)).toBe(false);
    expect(isApiUnavailableError(new Error('Failed to fetch'))).toBe(false);
    expect(isApiUnavailableError(undefined)).toBe(false);
  });
});
