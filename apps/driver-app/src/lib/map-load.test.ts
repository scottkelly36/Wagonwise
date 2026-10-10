import {
  INITIAL_MAP_LOAD,
  mapLoadMessage,
  mapLoadReducer,
  SLOW_AFTER_MS,
  type MapLoadState,
} from './map-load';

describe('mapLoadReducer', () => {
  it('starts loading, not slow', () => {
    expect(INITIAL_MAP_LOAD).toEqual({ status: 'loading', slow: false });
  });

  it('says slow only while still loading', () => {
    expect(mapLoadReducer(INITIAL_MAP_LOAD, 'slow')).toEqual({ status: 'loading', slow: true });
    expect(mapLoadReducer({ status: 'ready' }, 'slow')).toEqual({ status: 'ready' });
    expect(mapLoadReducer({ status: 'failed' }, 'slow')).toEqual({ status: 'failed' });
  });

  it('is ready once loaded, even after slow or a failure', () => {
    for (const from of [
      INITIAL_MAP_LOAD,
      { status: 'loading', slow: true },
      { status: 'failed' },
    ] as MapLoadState[]) {
      expect(mapLoadReducer(from, 'loaded')).toEqual({ status: 'ready' });
    }
  });

  it('fails while loading, but a map that is already up stays up', () => {
    expect(mapLoadReducer(INITIAL_MAP_LOAD, 'failed')).toEqual({ status: 'failed' });
    expect(mapLoadReducer({ status: 'ready' }, 'failed')).toEqual({ status: 'ready' });
  });

  it('starts again on retry', () => {
    expect(mapLoadReducer({ status: 'failed' }, 'retry')).toEqual(INITIAL_MAP_LOAD);
  });

  it('waits a few seconds before calling the map slow', () => {
    expect(SLOW_AFTER_MS).toBeGreaterThanOrEqual(3_000);
  });
});

describe('mapLoadMessage', () => {
  it('says what is happening, and nothing once the map is up', () => {
    expect(mapLoadMessage(INITIAL_MAP_LOAD)).toBe('Loading map…');
    expect(mapLoadMessage({ status: 'loading', slow: true })).toMatch(/slow/);
    expect(mapLoadMessage({ status: 'failed' })).toMatch(/tap to try again/);
    expect(mapLoadMessage({ status: 'ready' })).toBeUndefined();
  });
});
