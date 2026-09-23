import * as Location from 'expo-location';

import { fetchCurrentLocation } from './use-current-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const requestForegroundPermissionsAsync = jest.mocked(Location.requestForegroundPermissionsAsync);
const getCurrentPositionAsync = jest.mocked(Location.getCurrentPositionAsync);

afterEach(() => {
  jest.clearAllMocks();
});

describe('fetchCurrentLocation', () => {
  it('returns the position as a plain lat/lon point when permission is granted', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
    } as Location.LocationPermissionResponse);
    getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 54.971, longitude: -2.1 },
    } as Location.LocationObject);

    await expect(fetchCurrentLocation()).resolves.toEqual({
      ok: true,
      point: { lat: 54.971, lon: -2.1 },
    });
  });

  it('reports denied without calling getCurrentPositionAsync', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
    } as Location.LocationPermissionResponse);

    await expect(fetchCurrentLocation()).resolves.toEqual({ ok: false, reason: 'denied' });
    expect(getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('reports error rather than throwing when positioning fails', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
    } as Location.LocationPermissionResponse);
    getCurrentPositionAsync.mockRejectedValue(new Error('no GPS fix'));

    await expect(fetchCurrentLocation()).resolves.toEqual({ ok: false, reason: 'error' });
  });
});
