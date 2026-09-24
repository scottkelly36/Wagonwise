import { obtainPushToken, type PushRegistrationDeps } from './push-registration';

function deps(overrides: Partial<PushRegistrationDeps> = {}): PushRegistrationDeps {
  return {
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
    projectId: 'project-1',
    ...overrides,
  };
}

describe('obtainPushToken', () => {
  it('returns no-project-id without ever checking permissions when there is no EAS project', async () => {
    const getPermissionsAsync = jest.fn();
    const result = await obtainPushToken(deps({ projectId: undefined, getPermissionsAsync }));

    expect(result).toEqual({ ok: false, reason: 'no-project-id' });
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns the token when already granted, without prompting again', async () => {
    const requestPermissionsAsync = jest.fn();
    const result = await obtainPushToken(deps({ requestPermissionsAsync }));

    expect(result).toEqual({ ok: true, token: 'ExponentPushToken[xxx]' });
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts for permission when not already granted, and returns the token once granted', async () => {
    const result = await obtainPushToken(
      deps({
        getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
        requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      }),
    );

    expect(result).toEqual({ ok: true, token: 'ExponentPushToken[xxx]' });
  });

  it('returns denied when the driver declines the prompt', async () => {
    const result = await obtainPushToken(
      deps({
        getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
        requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
      }),
    );

    expect(result).toEqual({ ok: false, reason: 'denied' });
  });

  it('returns error rather than throwing when getExpoPushTokenAsync itself fails', async () => {
    const result = await obtainPushToken(
      deps({ getExpoPushTokenAsync: jest.fn().mockRejectedValue(new Error('network error')) }),
    );

    expect(result).toEqual({ ok: false, reason: 'error' });
  });
});
