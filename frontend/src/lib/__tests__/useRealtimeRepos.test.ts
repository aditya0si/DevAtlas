import { renderHook, waitFor, act } from '@testing-library/react';
import { useRealtimeRepos, DEFAULT_REALTIME_DOC_LIMIT, MAX_REALTIME_DOC_LIMIT } from '../useRealtimeRepos';

// The realtime hook owns the Firestore onSnapshot listener. Mock the Firestore
// SDK boundary (via @/lib/firebase + firebase/firestore) so the subscription
// lifecycle and document mapping can be tested without a live client.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({ db: {} }));

import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { starsEstimate } from '../firestoreApi';

const mockCollection = collection as jest.Mock;
const mockQuery = query as jest.Mock;
const mockLimit = limit as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;

type SnapshotDoc = { id: string; data: Record<string, any> };
type SnapshotHandler = (snapshot: {
  forEach: (cb: (d: { id: string; data: () => Record<string, any> }) => void) => void;
}) => void;

const snapshotOf = (docs: SnapshotDoc[]) => ({
  forEach: (cb: (d: { id: string; data: () => Record<string, any> }) => void) =>
    docs.forEach((d) => cb({ id: d.id, data: () => d.data })),
});

describe('useRealtimeRepos', () => {
  let next: SnapshotHandler;
  let error: (err: Error) => void;
  let unsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockImplementation((_db, name) => ({ __collection: name }));
    mockQuery.mockImplementation((...parts) => ({ __query: parts }));
    mockLimit.mockImplementation((n) => ({ __constraint: 'limit', n }));

    unsubscribe = jest.fn();
    mockOnSnapshot.mockImplementation((_q, onNext, onError) => {
      next = onNext;
      error = onError;
      return unsubscribe;
    });
  });

  it('subscribes to the repositories collection and maps docs with coordinates into features', async () => {
    const { result } = renderHook(() => useRealtimeRepos({ limitCount: 100 }));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    expect(mockCollection).toHaveBeenCalledWith({}, 'repositories');
    expect(mockLimit).toHaveBeenCalledWith(100);

    act(() => {
      next(
        snapshotOf([
          {
            id: '1',
            data: {
              name: 'atlas',
              full_name: 'org/atlas',
              language: 'TypeScript',
              stars: 100,
              coordinates: { longitude: 77.5946, latitude: 12.9716 },
              classification: { domain: 'ai' },
              domain: 'ai',
              description: 'A repo',
            },
          },
          { id: '2', data: { name: 'no-coords', coordinates: null } },
        ])
      );
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.features).toHaveLength(1);
    expect(result.current.features[0].geometry.coordinates).toEqual([77.5946, 12.9716]);
    expect(result.current.features[0].properties.id).toBe('1');
    expect(result.current.features[0].properties.full_name).toBe('org/atlas');
  });

  // ── Activity source (S-07) ────────────────────────────────────────────────

  it('uses the measured activity_score written by the sync worker', async () => {
    const { result } = renderHook(() => useRealtimeRepos());

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));

    act(() => {
      next(
        snapshotOf([
          {
            id: '1',
            data: {
              name: 'atlas',
              stars: 100,
              activity_score: 87.5,
              coordinates: { longitude: 77.59, latitude: 12.97 },
            },
          },
        ])
      );
    });

    const properties = result.current.features[0].properties;
    expect(properties.activity_score).toBe(87.5);
    expect(properties.activity_source).toBe('github_events');
    expect(properties.stars_estimate).toBeUndefined();
  });

  it('exposes a stars_estimate (not a fake activity score) when the document has no activity_score', async () => {
    const { result } = renderHook(() => useRealtimeRepos());

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));

    act(() => {
      next(
        snapshotOf([
          {
            id: '1',
            data: { name: 'atlas', stars: 100, coordinates: { longitude: 77.59, latitude: 12.97 } },
          },
        ])
      );
    });

    const properties = result.current.features[0].properties;
    const expected = starsEstimate(100);
    expect(properties.activity_source).toBe('stars_estimate');
    expect(properties.stars_estimate).toBe(expected);
    expect(properties.activity_score).toBe(expected);
  });

  it('ignores a non-numeric activity_score field', async () => {
    const { result } = renderHook(() => useRealtimeRepos());

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));

    act(() => {
      next(
        snapshotOf([
          {
            id: '1',
            data: {
              name: 'atlas',
              stars: 4,
              activity_score: 'n/a',
              coordinates: { longitude: 0, latitude: 0 },
            },
          },
        ])
      );
    });

    expect(result.current.features[0].properties.activity_source).toBe('stars_estimate');
    expect(result.current.features[0].properties.activity_score).toBe(starsEstimate(4));
  });

  // ── Listener budget (S-06) ────────────────────────────────────────────────

  it('defaults the listener window to the document budget', async () => {
    renderHook(() => useRealtimeRepos());

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    expect(DEFAULT_REALTIME_DOC_LIMIT).toBe(1200);
    expect(MAX_REALTIME_DOC_LIMIT).toBe(1200);
    expect(mockLimit).toHaveBeenCalledWith(1200);
  });

  it('clamps oversized listener windows instead of subscribing to the corpus', async () => {
    renderHook(() => useRealtimeRepos({ limitCount: 5000 }));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    expect(mockLimit).toHaveBeenCalledWith(MAX_REALTIME_DOC_LIMIT);
  });

  // ── Subscription lifecycle ────────────────────────────────────────────────

  it('filters features by the mapped domain client-side', async () => {
    const { result } = renderHook(() => useRealtimeRepos({ domain: 'Web3' }));

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));

    act(() => {
      next(
        snapshotOf([
          {
            id: '1',
            data: {
              coordinates: { longitude: 0, latitude: 0 },
              domain: 'blockchain',
              classification: { domain: 'blockchain' },
            },
          },
          {
            id: '2',
            data: {
              coordinates: { longitude: 1, latitude: 1 },
              domain: 'ai',
              classification: { domain: 'ai' },
            },
          },
        ])
      );
    });

    expect(result.current.features.map((f) => f.properties.id)).toEqual(['1']);
  });

  it('tears the subscription down on unmount and re-subscribes on domain change', async () => {
    const { rerender, unmount } = renderHook(
      ({ domain }: { domain: string }) => useRealtimeRepos({ domain }),
      { initialProps: { domain: 'AI' } }
    );

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    rerender({ domain: 'Web3' });

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(2));
    // The previous listener is released before a new one is established.
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('surfaces subscription errors and stops loading', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useRealtimeRepos());

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    act(() => error(new Error('permission denied')));

    expect(result.current.error).toBe('permission denied');
    expect(result.current.loading).toBe(false);

    consoleError.mockRestore();
  });
});
