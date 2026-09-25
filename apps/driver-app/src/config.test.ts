describe('loadConfig', () => {
  const originalEnv = process.env.EXPO_PUBLIC_BFF_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_BFF_URL = originalEnv;
    jest.resetModules();
  });

  function loadWithPlatform(os: 'ios' | 'android') {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./config').loadConfig();
  }

  it('defaults the Android emulator to 10.0.2.2, the host-loopback alias', () => {
    delete process.env.EXPO_PUBLIC_BFF_URL;
    expect(loadWithPlatform('android').bffUrl).toBe('http://10.0.2.2:3002');
  });

  it('defaults iOS to localhost, since the simulator shares the host network', () => {
    delete process.env.EXPO_PUBLIC_BFF_URL;
    expect(loadWithPlatform('ios').bffUrl).toBe('http://localhost:3002');
  });

  it('an explicit EXPO_PUBLIC_BFF_URL overrides the platform default on either platform', () => {
    process.env.EXPO_PUBLIC_BFF_URL = 'http://192.168.1.50:3002';
    expect(loadWithPlatform('android').bffUrl).toBe('http://192.168.1.50:3002');
    expect(loadWithPlatform('ios').bffUrl).toBe('http://192.168.1.50:3002');
  });

  it('wires EXPO_PUBLIC_MAPTILER_API_KEY through to mapStyleUrl (lib/map-style.ts owns the logic)', () => {
    const originalKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
    delete process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
    expect(loadWithPlatform('ios').mapStyleUrl).toBe('https://demotiles.maplibre.org/style.json');

    process.env.EXPO_PUBLIC_MAPTILER_API_KEY = 'test-key';
    expect(loadWithPlatform('ios').mapStyleUrl).toBe(
      'https://api.maptiler.com/maps/streets-v2/style.json?key=test-key',
    );
    process.env.EXPO_PUBLIC_MAPTILER_API_KEY = originalKey;
  });

  it('exposes the raw EXPO_PUBLIC_MAPTILER_API_KEY too, for address search (lib/geocoding.ts)', () => {
    const originalKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
    delete process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
    expect(loadWithPlatform('ios').maptilerApiKey).toBeUndefined();

    process.env.EXPO_PUBLIC_MAPTILER_API_KEY = 'test-key';
    expect(loadWithPlatform('ios').maptilerApiKey).toBe('test-key');
    process.env.EXPO_PUBLIC_MAPTILER_API_KEY = originalKey;
  });
});
