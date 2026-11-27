import { fireEvent, render, screen } from '@testing-library/react-native';

import ReadCardScreen from '../app/read-card';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('expo-device', () => ({ manufacturer: 'Test', modelName: 'Phone' }));
jest.mock('../lib/share-card-file', () => ({
  canShareFiles: () => true,
  shareBytes: jest.fn(),
  deleteSavedFile: jest.fn(),
}));
jest.mock('../lib/tachograph-card/usb-reader', () => ({ usbReaderSupported: () => true }));

const mockSummary = {
  fileName: 'C_20261127_1005.DDD',
  totalBytes: 3,
  files: [],
  signedCount: 0,
  skippedCount: 0,
};
const mockDdd = new Uint8Array([1, 2, 3]);
jest.mock('../hooks/use-card-read', () => ({
  useCardRead: () => ({
    state: { status: 'done', summary: mockSummary },
    start: jest.fn(),
    startReal: jest.fn(),
    cancel: jest.fn(),
    reset: jest.fn(),
    log: ['a line'],
    download: { ddd: mockDdd, fileName: 'C_20261127_1005.DDD' },
  }),
}));

const mockMine = { current: { data: [] as unknown[], isSuccess: true } };
const mockMutate = jest.fn();
jest.mock('../api/use-tachograph', () => ({
  useMyTachograph: () => mockMine.current,
  useSendTachographFile: () => ({ mutate: mockMutate, isPending: false }),
}));

jest.setTimeout(30_000);

const COMPANY = { companyId: 'c1', companyName: 'Wear Freight', firmEnabled: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockMine.current = { data: [COMPANY], isSuccess: true };
});

describe('uploading a card file to the portal', () => {
  it('shows who gets it and what that means, and sends only after the driver confirms', async () => {
    await render(<ReadCardScreen />);
    await fireEvent.press(screen.getByTestId('read-card-upload-c1'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Upload to Wear Freight?')).toBeTruthy();
    expect(screen.getByText(/This file goes to Wear Freight/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('read-card-upload-confirm'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [input] = mockMutate.mock.calls[0] as [
      { companyId: string; file: { fileName: string; dataBase64: string; wordingVersion: number } },
    ];
    expect(input.companyId).toBe('c1');
    expect(input.file.fileName).toBe('C_20261127_1005.DDD');
    expect(input.file.dataBase64).toBe('AQID');
    expect(input.file.wordingVersion).toBeGreaterThanOrEqual(1);
  });

  it('says so when the upload goes through', async () => {
    mockMutate.mockImplementation((_input: unknown, options: { onSuccess: (r: object) => void }) =>
      options.onSuccess({ duplicate: false }),
    );
    await render(<ReadCardScreen />);
    await fireEvent.press(screen.getByTestId('read-card-upload-c1'));
    await fireEvent.press(screen.getByTestId('read-card-upload-confirm'));
    expect(screen.getByTestId('read-card-uploaded')).toBeTruthy();
    expect(screen.getByText(/Uploaded to Wear Freight/)).toBeTruthy();
  });

  it('keeps the confirmation and says what went wrong when it fails', async () => {
    mockMutate.mockImplementation((_input: unknown, options: { onError: () => void }) =>
      options.onError(),
    );
    await render(<ReadCardScreen />);
    await fireEvent.press(screen.getByTestId('read-card-upload-c1'));
    await fireEvent.press(screen.getByTestId('read-card-upload-confirm'));
    expect(screen.getByText(/did not go through/)).toBeTruthy();
    expect(screen.getByTestId('read-card-upload-confirm')).toBeTruthy();
  });

  it('keeps the file on the phone when the company has not switched it on, or there is none', async () => {
    mockMine.current = { data: [{ ...COMPANY, firmEnabled: false }], isSuccess: true };
    const { unmount } = await render(<ReadCardScreen />);
    expect(screen.queryByTestId('read-card-upload-c1')).toBeNull();
    expect(screen.getByText(/has not switched this on yet/)).toBeTruthy();
    await unmount();

    mockMine.current = { data: [], isSuccess: true };
    await render(<ReadCardScreen />);
    expect(screen.getByText(/You are not linked to a company, so the file stays/)).toBeTruthy();
    expect(screen.getByTestId('read-card-share-file')).toBeTruthy();
  });
});
