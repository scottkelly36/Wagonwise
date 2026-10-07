import * as Location from 'expo-location';

import { startWatchingPosition } from './use-live-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

const requestForegroundPermissionsAsync = jest.mocked(Location.requestForegroundPermissionsAsync);
const watchPositionAsync = jest.mocked(Location.watchPositionAsync);

afterEach(() => {
  jest.clearAllMocks();
});

describe('startWatchingPosition', () => {
  it('starts a watch and forwards each update as a plain lat/lon point', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
    } as Location.LocationPermissionResponse);
    const remove = jest.fn();
    let callback: ((position: Location.LocationObject) => void) | undefined;
    watchPositionAsync.mockImplementation((_options, cb) => {
      callback = cb;
      return Promise.resolve({ remove } as Location.LocationSubscription);
    });

    const onUpdate = jest.fn();
    const result = await startWatchingPosition(onUpdate);

    expect(result.ok).toBe(true);
    callback?.({
      coords: { latitude: 54.971, longitude: -2.1, heading: 90, speed: 12 },
    } as Location.LocationObject);
    expect(onUpdate).toHaveBeenCalledWith(
      { lat: 54.971, lon: -2.1 },
      { gpsHeadingDeg: 90, speedMps: 12 },
    );
  });

  it('reports denied without starting a watch', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
    } as Location.LocationPermissionResponse);

    await expect(startWatchingPosition(jest.fn())).resolves.toEqual({
      ok: false,
      reason: 'denied',
    });
    expect(watchPositionAsync).not.toHaveBeenCalled();
  });

  it('reports error rather than throwing when starting the watch fails', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
    } as Location.LocationPermissionResponse);
    watchPositionAsync.mockRejectedValue(new Error('no GPS fix'));

    await expect(startWatchingPosition(jest.fn())).resolves.toEqual({
      ok: false,
      reason: 'error',
    });
  });
});
