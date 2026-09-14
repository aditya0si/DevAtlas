import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightPanel from '../InsightPanel';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const mockGetInsights = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getInsights: (...args: unknown[]) => mockGetInsights(...args),
  },
}));

const insights = [
  {
    id: '1',
    text: 'AI growth is surging in Bengaluru',
    category: 'ai',
    region: 'Karnataka',
    metric_type: 'growth',
    metric_value: 24.2,
    time_range: 'month',
    generated_at: '2026-08-01T00:00:00Z',
  },
];

/**
 * Wraps the global AbortController so tests can grab the instance created
 * inside the component and abort it (simulating unmount/refresh cancellation)
 * while the component stays mounted — making any stale state update observable.
 */
const trackAbortControllers = () => {
  const RealAbortController = global.AbortController;
  const controllers: AbortController[] = [];
  class TrackingAbortController extends RealAbortController {
    constructor() {
      super();
      controllers.push(this);
    }
  }
  (global as unknown as { AbortController: typeof AbortController }).AbortController =
    TrackingAbortController;
  return {
    controllers,
    restore: () => {
      (global as unknown as { AbortController: typeof AbortController }).AbortController =
        RealAbortController;
    },
  };
};

describe('InsightPanel', () => {
  beforeEach(() => {
    mockGetInsights.mockReset();
  });

  it('loads insights through the centralized API client with an AbortSignal', async () => {
    mockGetInsights.mockResolvedValue(insights);
    render(<InsightPanel limit={5} autoRefresh={false} />);

    await waitFor(() => {
      expect(screen.getByText('AI growth is surging in Bengaluru')).toBeInTheDocument();
    });

    expect(mockGetInsights).toHaveBeenCalledWith(5, expect.any(AbortSignal));
  });

  it('renders a truthful empty state when the API returns no insights', async () => {
    mockGetInsights.mockResolvedValue([]);
    render(<InsightPanel limit={5} autoRefresh={false} />);

    await waitFor(() => {
      expect(screen.getByText('No insights available')).toBeInTheDocument();
    });
  });

  it('shows the truthful empty state when the insights request fails', async () => {
    mockGetInsights.mockRejectedValue(new Error('Insights unavailable'));
    render(<InsightPanel limit={5} autoRefresh={false} />);

    // The panel falls back to the truthful "no insights available" state.
    await waitFor(() => {
      expect(screen.getByText('No insights available')).toBeInTheDocument();
    });
  });

  it('ignores a stale success result when the request is aborted mid-flight', async () => {
    const { controllers, restore } = trackAbortControllers();

    let resolveInsights!: (value: unknown) => void;
    mockGetInsights.mockImplementation(
      () => new Promise((resolve) => { resolveInsights = resolve; })
    );

    render(<InsightPanel limit={5} autoRefresh={false} />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();

    // Cancel the request (same as the effect cleanup aborting on unmount/refresh)
    // *before* the response resolves.
    controllers[0].abort();

    await act(async () => {
      resolveInsights(insights);
    });

    // The guarded success path must not update insights/error/lastUpdated, and
    // the guarded finally must not reset loading: the panel stays on the
    // loading skeleton instead of rendering the (stale) insight data.
    expect(screen.queryByText('AI growth is surging in Bengaluru')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();

    restore();
  });

  it('does not reset loading when the request aborts with an AbortError', async () => {
    const { controllers, restore } = trackAbortControllers();

    let rejectInsights!: (reason: unknown) => void;
    mockGetInsights.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectInsights = reject; })
    );

    render(<InsightPanel limit={5} autoRefresh={false} />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();

    controllers[0].abort();

    await act(async () => {
      rejectInsights(new DOMException('The operation was aborted.', 'AbortError'));
    });

    // The finally block must not clear loading for a cancelled request.
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('No insights available')).not.toBeInTheDocument();

    restore();
  });
});
