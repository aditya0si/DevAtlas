import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeveloperMap from '../DeveloperMap';

// DeveloperMap no longer fetches over REST. It hands the active filter to the
// Firestore realtime hook, so the hook (and the unused API import) are mocked at
// the data-layer boundary instead of stubbing fetch/maplibre network calls.
jest.mock('@/lib/api', () => ({ api: {} }));

const mockUseRealtimeRepos = jest.fn();
jest.mock('@/lib/useRealtimeRepos', () => ({
  useRealtimeRepos: (...args: unknown[]) => mockUseRealtimeRepos(...args),
}));

// maplibre-gl needs WebGL/canvas APIs that jsdom doesn't provide, so stub it
// out. `mapInstances` records every constructed map so the tests can assert on
// the calls the component makes. maplibre-gl v6 is ESM-only, so the mock is
// declared virtual to avoid Jest's CommonJS resolver trying to load it.
const mockMapInstances: any[] = [];
jest.mock(
  'maplibre-gl',
  () => {
    class MockMap {
      on = jest.fn();
      off = jest.fn();
      flyTo = jest.fn();
      stop = jest.fn();
      remove = jest.fn();
      getCanvas = jest.fn(() => ({ style: {} }));
      loaded = jest.fn(() => true);
      getSource = jest.fn(() => undefined);
      addSource = jest.fn();
      addLayer = jest.fn();

      constructor() {
        mockMapInstances.push(this);
      }
    }
    return {
      __esModule: true,
      default: { Map: MockMap },
      Map: MockMap,
    };
  },
  { virtual: true }
);

const feature = {
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [77.5946, 12.9716] as [number, number] },
  properties: {
    id: 'repo-123',
    name: 'atlas',
    full_name: 'org/atlas',
    language: 'TypeScript',
    stars: 100,
    activity_score: 42,
    classification: { domain: 'ai' },
    domain: 'ai',
    description: 'A repo',
  },
};

describe('DeveloperMap realtime data wiring', () => {
  beforeEach(() => {
    mockUseRealtimeRepos.mockReset();
    mockMapInstances.length = 0;
  });

  it('subscribes with the active filter and pushes hook features into the map source', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [feature], loading: false, error: null });
    const onMapLoad = jest.fn();

    render(<DeveloperMap activeFilter="AI" year={2024} onMapLoad={onMapLoad} />);

    expect(mockUseRealtimeRepos).toHaveBeenCalledWith({ domain: 'AI', limitCount: 5000 });

    const map = mockMapInstances[0];
    await waitFor(() => {
      expect(map.addSource).toHaveBeenCalledWith(
        'repositories',
        expect.objectContaining({ type: 'geojson' })
      );
    });

    const sourceData = map.addSource.mock.calls[0][1].data;
    expect(sourceData.type).toBe('FeatureCollection');
    expect(sourceData.features).toHaveLength(1);
    expect(sourceData.features[0].properties.id).toBe('repo-123');
    expect(map.addLayer).toHaveBeenCalledTimes(3);
    expect(onMapLoad).toHaveBeenCalledTimes(1);
  });

  it('passes the updated filter to the realtime hook on filter change', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [], loading: false, error: null });

    const { rerender } = render(<DeveloperMap activeFilter="All Projects" year={2024} />);
    expect(mockUseRealtimeRepos).toHaveBeenCalledWith({ domain: 'All Projects', limitCount: 5000 });

    rerender(<DeveloperMap activeFilter="Web3" year={2025} />);

    await waitFor(() => {
      expect(mockUseRealtimeRepos).toHaveBeenLastCalledWith({ domain: 'Web3', limitCount: 5000 });
    });
  });

  it('drills into a repository when a map point is clicked', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [feature], loading: false, error: null });
    const onRepositoryClick = jest.fn();

    render(
      <DeveloperMap activeFilter="All Projects" year={2024} onRepositoryClick={onRepositoryClick} />
    );

    const map = mockMapInstances[0];
    await waitFor(() => {
      expect(map.on).toHaveBeenCalledWith('click', 'repositories-circle', expect.any(Function));
    });

    const clickCall = (map.on.mock.calls as unknown[][]).find(
      (call) => call[0] === 'click' && call[1] === 'repositories-circle'
    );
    const handler = clickCall![2] as (e: { features: Array<{ properties: { id: string } }> }) => void;

    act(() => handler({ features: [{ properties: { id: 'repo-123' } }] }));

    expect(onRepositoryClick).toHaveBeenCalledWith('repo-123');
  });
});
