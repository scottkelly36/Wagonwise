import {
  obtainVoiceCapturePermission,
  type VoiceCapturePermissionDeps,
} from './voice-report-permission';

function deps(overrides: Partial<VoiceCapturePermissionDeps> = {}): VoiceCapturePermissionDeps {
  return {
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    ...overrides,
  };
}

describe('obtainVoiceCapturePermission', () => {
  it('returns ok when already granted, without prompting again', async () => {
    const requestPermissionsAsync = jest.fn();
    const result = await obtainVoiceCapturePermission(deps({ requestPermissionsAsync }));

    expect(result).toEqual({ ok: true });
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts for permission when not already granted, and returns ok once granted', async () => {
    const result = await obtainVoiceCapturePermission(
      deps({
        getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
        requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      }),
    );

    expect(result).toEqual({ ok: true });
  });

  it('returns denied when the driver declines the prompt', async () => {
    const result = await obtainVoiceCapturePermission(
      deps({
        getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
        requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
      }),
    );

    expect(result).toEqual({ ok: false, reason: 'denied' });
  });

  it('returns error rather than throwing when the native call itself fails', async () => {
    const result = await obtainVoiceCapturePermission(
      deps({ getPermissionsAsync: jest.fn().mockRejectedValue(new Error('native error')) }),
    );

    expect(result).toEqual({ ok: false, reason: 'error' });
  });
});
