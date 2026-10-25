import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MarkPlaceSheet } from './mark-place-sheet';

const ACME = '11111111-1111-4111-8111-111111111111';
const PLACE = '22222222-2222-4222-8222-222222222222';

const mockMark = jest.fn();
jest.mock('../api/use-places', () => ({
  useMarkPlace: () => ({ mutate: mockMark, isPending: false }),
  useDeletePlace: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../hooks/use-current-location', () => ({
  fetchCurrentLocation: () => Promise.resolve({ ok: true, point: { lat: 54.97, lon: -2.1 } }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => '22222222-2222-4222-8222-222222222222' }));

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
});

async function save() {
  await fireEvent.press(screen.getByTestId('mark-place-save'));
  await waitFor(() => expect(mockMark).toHaveBeenCalledTimes(1));
  return mockMark.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('MarkPlaceSheet: who the place is for', () => {
  it('offers no choice to a driver with no company, and marks for them alone', async () => {
    await render(<MarkPlaceSheet visible onClose={jest.fn()} companyId={undefined} />);
    expect(screen.queryByTestId('mark-place-audience')).toBeNull();
    expect(screen.getByText(/Only you will see it/)).toBeTruthy();
    const sent = await save();
    expect(sent).not.toHaveProperty('companyId');
    expect(sent['id']).toBe(PLACE);
  });

  it('marks for the company by default when the driver has one', async () => {
    await render(<MarkPlaceSheet visible onClose={jest.fn()} companyId={ACME} />);
    expect(screen.getByTestId('mark-place-audience')).toBeTruthy();
    expect(screen.getByText(/Your whole company will see it/)).toBeTruthy();
    expect((await save())['companyId']).toBe(ACME);
  });

  it('marks for the driver alone when they choose Just me, and says how to share it with every driver', async () => {
    await render(<MarkPlaceSheet visible onClose={jest.fn()} companyId={ACME} />);
    await fireEvent.press(screen.getByTestId('mark-place-audience-me'));
    expect(screen.getByText(/Only you will see it/)).toBeTruthy();
    const sent = await save();
    expect(sent).not.toHaveProperty('companyId');

    const options = mockMark.mock.calls[0]?.[1] as { onSuccess: () => void };
    await act(async () => {
      options.onSuccess();
    });
    await waitFor(() => expect(screen.getByText(/share it with all drivers/)).toBeTruthy());
  });

  it('can be switched back to My company before saving', async () => {
    await render(<MarkPlaceSheet visible onClose={jest.fn()} companyId={ACME} />);
    await fireEvent.press(screen.getByTestId('mark-place-audience-me'));
    await fireEvent.press(screen.getByTestId('mark-place-audience-company'));
    expect((await save())['companyId']).toBe(ACME);
  });
});
