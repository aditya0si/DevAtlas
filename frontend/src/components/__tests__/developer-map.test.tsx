import { render, screen, waitFor, act } from '@testing-library/react';
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

/** A repository whose marker weight is declared as measured push activity. */
const measuredFeature = {
  ...feature,
  properties: {
    ...feature.properties,
    id: 'repo-measured',
    activity_source: 'github_events',
    push_count_30d: 180,
  },
};

/** A repository whose marker weight is an estimate derived from stars. */
const estimatedFeature = {
  ...feature,
  properties: {
    ...feature.properties,
    id: 'repo-estimated',
    activity_source: 'stars_estimate',
  },
};

/** No provenance published at all: treated (and labelled) as an estimate. */
const unlabelledFeature = {
  ...feature,
  properties: { ...feature.properties, id: 'repo-unlabelled' },
};

const findHandler = (map: any, event: string, layer: string) => {
  const call = (map.on.mock.calls as unknown[][]).find(
    (entry) => entry[0] === event && entry[1] === layer
  );
  return call?.[2] as ((e: unknown) => void) | undefined;
};

/** Invoke every handler registered for an event on a layer (there can be more
 * than one: the cursor handler and the tooltip handler share 'mouseleave'). */
const invokeHandlers = (map: any, event: string, layer: string, arg: unknown) => {
  const calls = (map.on.mock.calls as unknown[][]).filter(
    (entry) => entry[0] === event && entry[1] === layer
  );
  expect(calls.length).toBeGreaterThan(0);
  calls.forEach((entry) => (entry[2] as (e: unknown) => void)(arg));
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

  it('shows an explicit "no data yet" state when the source has no repositories', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [], loading: false, error: null });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    await waitFor(() => {
      expect(screen.getByTestId('no-data-state')).toBeInTheDocument();
    });
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  it('labels the marker weight "pushes / 30d" when the source is GitHub events', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [measuredFeature], loading: false, error: null });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    const legend = await screen.findByTestId('map-activity-source');
    expect(legend).toHaveAttribute('data-activity-source', 'github_events');
    expect(legend).toHaveTextContent('pushes / 30d');
    expect(legend).not.toHaveTextContent('stars estimate');
  });

  it('labels the marker weight "stars estimate" when no push data is published', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [unlabelledFeature], loading: false, error: null });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    const legend = await screen.findByTestId('map-activity-source');
    expect(legend).toHaveAttribute('data-activity-source', 'stars_estimate');
    expect(legend).toHaveTextContent('stars estimate');
    expect(legend).toHaveTextContent('not measured push activity');
  });

  it('labels a stars_estimate repository honestly even when a push count is present', async () => {
    mockUseRealtimeRepos.mockReturnValue({
      features: [
        {
          ...feature,
          properties: { ...feature.properties, activity_source: 'stars_estimate', push_count_30d: 3 },
        },
      ],
      loading: false,
      error: null,
    });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    const legend = await screen.findByTestId('map-activity-source');
    expect(legend).toHaveAttribute('data-activity-source', 'stars_estimate');
    expect(legend).toHaveTextContent('stars estimate');
  });

  it('reports mixed provenance instead of pretending every marker is measured', async () => {
    mockUseRealtimeRepos.mockReturnValue({
      features: [measuredFeature, estimatedFeature],
      loading: false,
      error: null,
    });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    const legend = await screen.findByTestId('map-activity-source');
    expect(legend).toHaveAttribute('data-activity-source', 'mixed');
    expect(legend).toHaveTextContent('pushes / 30d where published, stars estimate otherwise');
  });

  it('tooltip shows "pushes / 30d" for a repository with measured activity', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [measuredFeature], loading: false, error: null });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    const map = mockMapInstances[0];
    await waitFor(() => {
      expect(findHandler(map, 'mousemove', 'repositories-circle')).toBeDefined();
    });

    act(() =>
      findHandler(map, 'mousemove', 'repositories-circle')!({
        point: { x: 12, y: 18 },
        features: [{ properties: measuredFeature.properties }],
      })
    );

    const tooltip = screen.getByTestId('map-repo-tooltip');
    expect(tooltip).toHaveAttribute('data-activity-source', 'github_events');
    expect(screen.getByTestId('map-tooltip-activity')).toHaveTextContent('pushes / 30d');
    expect(screen.getByTestId('map-tooltip-activity')).toHaveTextContent('180 push events, measured from GitHub');
  });

  it('tooltip shows "stars estimate" for a repository with no measured activity', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [estimatedFeature], loading: false, error: null });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    const map = mockMapInstances[0];
    await waitFor(() => {
      expect(findHandler(map, 'mousemove', 'repositories-circle')).toBeDefined();
    });

    act(() =>
      findHandler(map, 'mousemove', 'repositories-circle')!({
        point: { x: 30, y: 40 },
        features: [{ properties: estimatedFeature.properties }],
      })
    );

    const tooltip = screen.getByTestId('map-repo-tooltip');
    expect(tooltip).toHaveAttribute('data-activity-source', 'stars_estimate');
    expect(screen.getByTestId('map-tooltip-activity')).toHaveTextContent('stars estimate');
    expect(screen.getByTestId('map-tooltip-activity')).toHaveTextContent('not measured push activity');
  });

  it('clears the tooltip when the pointer leaves the layer', async () => {
    mockUseRealtimeRepos.mockReturnValue({ features: [measuredFeature], loading: false, error: null });

    render(<DeveloperMap activeFilter="All Projects" year={2024} />);

    const map = mockMapInstances[0];
    await waitFor(() => {
      expect(findHandler(map, 'mousemove', 'repositories-circle')).toBeDefined();
    });

    act(() =>
      findHandler(map, 'mousemove', 'repositories-circle')!({
        point: { x: 12, y: 18 },
        features: [{ properties: measuredFeature.properties }],
      })
    );
    expect(screen.getByTestId('map-repo-tooltip')).toBeInTheDocument();

    act(() => invokeHandlers(map, 'mouseleave', 'repositories-circle', {}));
    expect(screen.queryByTestId('map-repo-tooltip')).not.toBeInTheDocument();
  });
});
