import * as hoursApi from '../api/hours';
import { sharingWith, useHoursSharingStore } from './hours-sharing-store';
import { useAuthStore } from './auth-store';

jest.mock('../api/hours', () => ({
  getHoursSharing: jest.fn(),
  setHoursSharing: jest.fn(),
}));

const getHoursSharing = jest.mocked(hoursApi.getHoursSharing);
const setHoursSharing = jest.mocked(hoursApi.setHoursSharing);

const row = (
  over: Partial<{ companyId: string; firmEnabled: boolean; sharing: boolean }> = {},
) => ({
  companyId: 'c1',
  companyName: 'Acme Haulage',
  firmEnabled: true,
  sharing: true,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useHoursSharingStore.setState({ companies: [] });
  useAuthStore.setState({
    state: {
      status: 'signedIn',
      accessToken: 'token',
      refreshToken: 'refresh',
      driver: { id: 'd', identifier: 'd@x', createdAt: '2026-10-09T00:00:00.000Z' },
    },
  });
});

describe('sharingWith', () => {
  it('counts a company only when the driver chose to share and the firm still allows it', () => {
    expect(sharingWith([row(), row({ sharing: false }), row({ firmEnabled: false })])).toHaveLength(
      1,
    );
  });
});

describe('the store', () => {
  it('loads what the server says, and keeps what it had if loading fails', async () => {
    getHoursSharing.mockResolvedValueOnce([row()]);
    await useHoursSharingStore.getState().refresh();
    expect(useHoursSharingStore.getState().companies).toHaveLength(1);
    getHoursSharing.mockRejectedValueOnce(new Error('offline'));
    await useHoursSharingStore.getState().refresh();
    expect(useHoursSharingStore.getState().companies).toHaveLength(1);
  });

  it('sends the choice with the wording version, then reloads', async () => {
    getHoursSharing.mockResolvedValue([row()]);
    await useHoursSharingStore.getState().setSharing('c1', true);
    expect(setHoursSharing).toHaveBeenCalledWith('token', 'c1', true, 1);
    expect(getHoursSharing).toHaveBeenCalled();
  });

  it('does not change anything locally when the server refuses', async () => {
    setHoursSharing.mockRejectedValueOnce(new Error('409'));
    await expect(useHoursSharingStore.getState().setSharing('c1', true)).rejects.toThrow();
    expect(useHoursSharingStore.getState().companies).toEqual([]);
  });

  it('forgets everything on reset', async () => {
    useHoursSharingStore.setState({ companies: [row()] });
    useHoursSharingStore.getState().reset();
    expect(useHoursSharingStore.getState().companies).toEqual([]);
  });
});
