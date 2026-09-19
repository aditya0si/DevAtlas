import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AskDevAtlas from '../AskDevAtlas';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const streamAskDevAtlas = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    streamAskDevAtlas: (...args: unknown[]) => streamAskDevAtlas(...args),
  },
}));

const ORIGINAL_DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE;

afterEach(() => {
  if (ORIGINAL_DATA_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
  } else {
    process.env.NEXT_PUBLIC_DATA_MODE = ORIGINAL_DATA_MODE;
  }
});

describe('AskDevAtlas conversational session continuity', () => {
  beforeEach(() => {
    // These tests exercise the streaming contract, which only exists when the
    // build talks to the DevAtlas API.
    process.env.NEXT_PUBLIC_DATA_MODE = 'api';
    streamAskDevAtlas.mockReset();
    // Default: return a cleanup function and invoke onComplete immediately.
    streamAskDevAtlas.mockImplementation(
      (
        _query: string,
        _onChunk: (c: string) => void,
        onComplete?: () => void,
        _onError?: (e: unknown) => void,
        onSessionId?: (id: string) => void,
        _onCitations?: (c: unknown[]) => void,
        _sessionId?: string
      ) => {
        onSessionId?.('sess-1');
        onComplete?.();
        return jest.fn();
      }
    );
  });

  it('passes the current session id to the stream for continuation', async () => {
    const onSessionChange = jest.fn();
    const { rerender } = render(
      <AskDevAtlas query="Why is Karnataka growing?" onClose={jest.fn()} sessionId="sess-1" onSessionChange={onSessionChange} />
    );

    await waitFor(() => {
      expect(streamAskDevAtlas).toHaveBeenCalledTimes(1);
    });
    // First turn uses the provided session id.
    expect(streamAskDevAtlas.mock.calls[0][6]).toBe('sess-1');

    // A follow-up query continues the same session.
    rerender(
      <AskDevAtlas query="What about Bengaluru?" onClose={jest.fn()} sessionId="sess-1" onSessionChange={onSessionChange} />
    );

    await waitFor(() => {
      expect(streamAskDevAtlas).toHaveBeenCalledTimes(2);
    });
    expect(streamAskDevAtlas.mock.calls[1][6]).toBe('sess-1');
  });

  it('uses the latest session id when the parent updates it between turns', async () => {
    const onSessionChange = jest.fn();
    const { rerender } = render(
      <AskDevAtlas query="q1" onClose={jest.fn()} sessionId={undefined} onSessionChange={onSessionChange} />
    );

    await waitFor(() => {
      expect(streamAskDevAtlas).toHaveBeenCalledTimes(1);
    });
    // First turn has no session yet.
    expect(streamAskDevAtlas.mock.calls[0][6]).toBeUndefined();

    // Parent received a new session id and passes it down for the next turn.
    rerender(
      <AskDevAtlas query="q2" onClose={jest.fn()} sessionId="sess-2" onSessionChange={onSessionChange} />
    );

    await waitFor(() => {
      expect(streamAskDevAtlas).toHaveBeenCalledTimes(2);
    });
    expect(streamAskDevAtlas.mock.calls[1][6]).toBe('sess-2');
  });

  it('reports a newly created session id to the parent', async () => {
    const onSessionChange = jest.fn();
    render(<AskDevAtlas query="q1" onClose={jest.fn()} sessionId={undefined} onSessionChange={onSessionChange} />);

    await waitFor(() => {
      expect(onSessionChange).toHaveBeenCalledWith('sess-1');
    });
  });

  it('closes the stream on unmount', async () => {
    const closeStream = jest.fn();
    streamAskDevAtlas.mockImplementation(() => closeStream);

    const { unmount } = render(
      <AskDevAtlas query="q1" onClose={jest.fn()} sessionId={undefined} onSessionChange={jest.fn()} />
    );
    unmount();
    expect(closeStream).toHaveBeenCalled();
  });

  it('renders a close button with an accessible label', () => {
    render(<AskDevAtlas query="q1" onClose={jest.fn()} sessionId={undefined} onSessionChange={jest.fn()} />);
    expect(screen.getByLabelText('Close DevAtlas AI copilot')).toBeInTheDocument();
  });

  it('marks a rejected stream as "needs API" instead of reporting a generic failure', async () => {
    streamAskDevAtlas.mockImplementation(
      (
        _query: string,
        _onChunk: (c: string) => void,
        _onComplete?: () => void,
        onError?: (e: unknown) => void
      ) => {
        onError?.(new Error('Copilot requires server-side streaming'));
        return jest.fn();
      }
    );

    render(<AskDevAtlas query="q1" onClose={jest.fn()} sessionId={undefined} onSessionChange={jest.fn()} />);

    const notice = await screen.findByTestId('api-unavailable-notice');
    expect(notice).toHaveTextContent(
      'The DevAtlas copilot needs the DevAtlas API — this build serves Firestore data only.'
    );
    expect(screen.queryByText('Unable to connect to DevAtlas AI stream.')).not.toBeInTheDocument();
  });
});

describe('AskDevAtlas in the Firestore-only build', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
    streamAskDevAtlas.mockReset();
  });

  it('never opens a stream and states that the copilot needs the DevAtlas API', async () => {
    render(<AskDevAtlas query="q1" onClose={jest.fn()} sessionId={undefined} onSessionChange={jest.fn()} />);

    const notice = await screen.findByTestId('api-unavailable-notice');
    expect(notice).toHaveTextContent(
      'The DevAtlas copilot needs the DevAtlas API — this build serves Firestore data only.'
    );
    expect(streamAskDevAtlas).not.toHaveBeenCalled();
    // No fake streaming spinner and no "LIVE ANALYSIS" claim.
    expect(screen.queryByText('Analyzing developer ecosystem telemetry...')).not.toBeInTheDocument();
    expect(screen.getByText('NEEDS API')).toBeInTheDocument();
  });

  it('keeps the close control usable in the unavailable state', () => {
    const onClose = jest.fn();
    render(<AskDevAtlas query="q1" onClose={onClose} sessionId={undefined} onSessionChange={jest.fn()} />);

    fireEvent.click(screen.getByLabelText('Close DevAtlas AI copilot'));
    expect(onClose).toHaveBeenCalled();
  });
});
