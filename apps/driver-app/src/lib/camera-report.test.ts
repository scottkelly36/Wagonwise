import { CAMERA_CHOICES, isCameraType, withoutCameras } from './camera-report';

describe('isCameraType', () => {
  it('is true for the two camera types and nothing else', () => {
    expect(isCameraType('speed_camera')).toBe(true);
    expect(isCameraType('mobile_camera')).toBe(true);
    expect(isCameraType('low_bridge')).toBe(false);
    expect(isCameraType('other')).toBe(false);
  });
});

describe('withoutCameras', () => {
  it('leaves hazards and drops cameras', () => {
    const items = [
      { id: 'a', type: 'low_bridge' as const },
      { id: 'b', type: 'speed_camera' as const },
      { id: 'c', type: 'mobile_camera' as const },
      { id: 'd', type: 'roadworks' as const },
    ] as const;
    expect(withoutCameras(items).map((i) => i.id)).toEqual(['a', 'd']);
  });
});

describe('CAMERA_CHOICES', () => {
  it('offers one choice per camera type, with the six hours said for mobile', () => {
    expect(CAMERA_CHOICES.map((c) => c.type)).toEqual(['speed_camera', 'mobile_camera']);
    expect(CAMERA_CHOICES[1]!.detail).toContain('6 hours');
  });
});
