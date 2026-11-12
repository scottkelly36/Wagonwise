import { fireEvent, render, screen } from '@testing-library/react-native';

import { WhatsNewCard } from './whats-new-card';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockDismiss = jest.fn();
let mockShown: { title: string; body: string } | undefined;
jest.mock('../hooks/use-whats-new', () => ({
  useWhatsNew: () => ({ announcement: mockShown, dismiss: mockDismiss }),
}));

jest.setTimeout(30_000);

beforeEach(() => {
  mockDismiss.mockReset();
  mockShown = undefined;
});

describe('the What’s new card', () => {
  it('shows nothing when there is no note to show', async () => {
    await render(<WhatsNewCard />);
    expect(screen.queryByTestId('whats-new')).toBeNull();
  });

  it('shows the heading and each point of the note, and closes only with Got it', async () => {
    mockShown = {
      title: 'Choose your route on a job',
      body: 'Start on a job opens the route cards.\n\nTolls are shown on each one.',
    };
    await render(<WhatsNewCard />);
    expect(screen.getByTestId('whats-new-title').props.children).toBe('Choose your route on a job');
    expect(screen.getAllByTestId('whats-new-point').map((p) => p.props.children)).toEqual([
      'Start on a job opens the route cards.',
      'Tolls are shown on each one.',
    ]);

    expect(mockDismiss).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('whats-new-dismiss'));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });
});
