import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import WalkthroughScreen from '../app/walkthrough';
import { WALKTHROUGH_STEPS } from '../lib/walkthrough-steps';
import { useWalkthroughStore } from '../state/walkthrough-store';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const title = () => screen.getByTestId('walkthrough-title').props.children as string;
const first = WALKTHROUGH_STEPS[0];
const last = WALKTHROUGH_STEPS[WALKTHROUGH_STEPS.length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  useWalkthroughStore.setState({ status: 'unseen' });
});

describe('walkthrough screen', () => {
  it('starts on the first step with no Back button, and Next moves on', async () => {
    await render(<WalkthroughScreen />);
    expect(title()).toBe(first?.title);
    expect(screen.queryByTestId('walkthrough-back-button')).toBeNull();

    await fireEvent.press(screen.getByTestId('walkthrough-next-button'));
    expect(title()).toBe(WALKTHROUGH_STEPS[1]?.title);
    await fireEvent.press(screen.getByTestId('walkthrough-back-button'));
    expect(title()).toBe(first?.title);
  });

  it('Skip marks it seen and goes back through the launch gate', async () => {
    await render(<WalkthroughScreen />);
    await fireEvent.press(screen.getByTestId('walkthrough-skip-button'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(useWalkthroughStore.getState().status).toBe('seen');
  });

  it('the last step says Get started, has no Skip, and finishing marks it seen', async () => {
    await render(<WalkthroughScreen />);
    for (let i = 0; i < WALKTHROUGH_STEPS.length - 1; i++) {
      await fireEvent.press(screen.getByTestId('walkthrough-next-button'));
    }
    expect(title()).toBe(last?.title);
    expect(screen.getByText('Get started')).toBeTruthy();
    expect(screen.queryByTestId('walkthrough-skip-button')).toBeNull();
    expect(screen.getByText(/Road signs and the law always come first/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('walkthrough-next-button'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(useWalkthroughStore.getState().status).toBe('seen');
  });
});
