import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeveloperMap from '../DeveloperMap';
import { api, GeoJSONFeatureCollection } from '@/lib/api';

// maplibre-gl needs WebGL/canvas APIs that jsdom doesn't provide, so stub it
// out. Only Map-level method calls are exercised by the tests below.
jest.mock('maplibre-gl', () => {
  class MockMap {
    on = jest.fn();
    off = jest.fn();
    flyTo = jest.fn();
    stop = jest.fn();
    remove = jest.fn();
    getCanvas = jest.fn(() => ({ style: {} }));
    loaded = jest.fn(() => false);
    getSource = jest.fn(() => undefined);
    addSource = jest.fn();
    addLayer = jest.fn();
  }
  return {
    __esModule: true,
    default: { Map: MockMap },
    Map: MockMap,
  };
});

const EMPTY_COLLECTION: GeoJSONFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

describe('DeveloperMap geospatial data loading', () => {
  let getGeospatialActivityMock: jest.SpyInstance;

  beforeEach(() => {
    getGeospatialActivityMock = jest
      .spyOn(api, 'getGeospatialActivity')
      .mockResolvedValue(EMPTY_COLLECTION);
  });

  afterEach(() => {
    getGeospatialActivityMock.mockRestore();
  });

  it('passes an AbortSignal and aborts on filter/year change and unmount', async () => {
    const { rerender, unmount } = render(
      <DeveloperMap activeFilter="All Projects" year={2024} />
    );

    await waitFor(() => {
      expect(getGeospatialActivityMock).toHaveBeenCalledTimes(1);
    });

    const firstCall = getGeospatialActivityMock.mock.calls[0];
    expect(firstCall[0]).toBe('68.1866,6.5546,97.4026,35.6745');
    expect(firstCall[1]).toMatchObject({
      domain: 'All Projects',
      year: 2024,
      limit: 5000,
    });
    const firstSignal = firstCall[1].signal as AbortSignal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal.aborted).toBe(false);

    // Filter + year change → previous request aborted, new request issued.
    rerender(<DeveloperMap activeFilter="AI" year={2025} />);

    await waitFor(() => {
      expect(getGeospatialActivityMock).toHaveBeenCalledTimes(2);
    });

    const secondSignal = getGeospatialActivityMock.mock.calls[1][1]
      .signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal).not.toBe(firstSignal);
    expect(secondSignal.aborted).toBe(false);

    // Unmount → in-flight request aborted.
    unmount();
    expect(secondSignal.aborted).toBe(true);
  });

  it('ignores stale responses and aborted rejections after a filter change', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let rejectFirst!: (reason?: unknown) => void;
    getGeospatialActivityMock.mockImplementationOnce(
      () =>
        new Promise<GeoJSONFeatureCollection>((_resolve, reject) => {
          rejectFirst = reject;
        })
    );

    const { rerender, unmount } = render(
      <DeveloperMap activeFilter="All Projects" year={2024} />
    );

    await waitFor(() => {
      expect(getGeospatialActivityMock).toHaveBeenCalledTimes(1);
    });

    // Changing the filter aborts the first request before it settles.
    rerender(<DeveloperMap activeFilter="AI" year={2025} />);

    await waitFor(() => {
      expect(getGeospatialActivityMock).toHaveBeenCalledTimes(2);
    });

    // The aborted request rejects after cleanup; it must be swallowed and
    // must not log or clobber the state of the newer request.
    await act(async () => {
      rejectFirst(new DOMException('The operation was aborted.', 'AbortError'));
    });

    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    unmount();
  });
});
