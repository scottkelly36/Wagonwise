import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ReportCameraSheet } from './report-camera-sheet';

const mockMutate = jest.fn();
jest.mock('../api/use-hazards', () => ({
  useReportHazard: () => ({ mutate: mockMutate, isPending: false }),
}));

const mockEnqueue = jest.fn().mockResolvedValue(undefined);
const mockRemove = jest.fn().mockResolvedValue(undefined);
jest.mock('../db/hazard-queue', () => ({
  enqueueHazardReport: (...args: unknown[]) => mockEnqueue(...args),
  removeQueuedHazardReport: (...args: unknown[]) => mockRemove(...args),
}));

let mockLocation: { ok: true; point: { lat: number; lon: number } } | { ok: false } = {
  ok: true,
  point: { lat: 54.97, lon: -2.1 },
};
jest.mock('../hooks/use-current-location', () => ({
  fetchCurrentLocation: () => Promise.resolve(mockLocation),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockLocation = { ok: true, point: { lat: 54.97, lon: -2.1 } };
});

describe('ReportCameraSheet', () => {
  it('keeps a mobile camera on the phone, sends it where the driver is, then thanks them', async () => {
    const onClose = jest.fn();
    await render(<ReportCameraSheet visible onClose={onClose} />);

    await fireEvent.press(screen.getByTestId('report-camera-mobile_camera'));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const request = {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'mobile_camera',
      location: { lat: 54.97, lon: -2.1 },
      source: 'tap',
    };
    expect(mockEnqueue).toHaveBeenCalledWith(request);
    const [sent, options] = mockMutate.mock.calls[0] as [
      object,
      { onSuccess: () => Promise<void> },
    ];
    expect(sent).toEqual(request);

    await act(async () => {
      await options.onSuccess();
    });
    expect(mockRemove).toHaveBeenCalledWith(request.id);
    expect(await screen.findByText('Reported')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('report-camera-done'));
    expect(onClose).toHaveBeenCalled();
  });

  it('reports a fixed camera as a speed camera', async () => {
    await render(<ReportCameraSheet visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('report-camera-speed_camera'));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    expect((mockMutate.mock.calls[0] as [{ type: string }])[0].type).toBe('speed_camera');
  });

  it('says it is saved for later when there is no signal, and keeps it queued', async () => {
    await render(<ReportCameraSheet visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('report-camera-speed_camera'));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const [, options] = mockMutate.mock.calls[0] as [object, { onError: () => void }];

    await act(async () => {
      options.onError();
    });
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('sends nothing when the phone cannot say where the driver is', async () => {
    mockLocation = { ok: false };
    await render(<ReportCameraSheet visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('report-camera-speed_camera'));
    expect(await screen.findByText(/can’t find where you are/)).toBeTruthy();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', async () => {
    await render(<ReportCameraSheet visible={false} onClose={jest.fn()} />);
    expect(screen.queryByTestId('report-camera-cancel')).toBeNull();
  });
});
