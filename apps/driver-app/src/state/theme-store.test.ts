import * as SecureStore from 'expo-secure-store';
import { useThemeStore } from './theme-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useThemeStore.setState({ mode: 'dark' });
});

describe('restore', () => {
  it('stays on the dark default when nothing is stored', async () => {
    getItemAsync.mockResolvedValue(null);

    await useThemeStore.getState().restore();

    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('adopts a stored light preference', async () => {
    getItemAsync.mockResolvedValue('light');

    await useThemeStore.getState().restore();

    expect(useThemeStore.getState().mode).toBe('light');
  });

  it('ignores a corrupt stored value rather than crashing', async () => {
    getItemAsync.mockResolvedValue('sepia');

    await useThemeStore.getState().restore();

    expect(useThemeStore.getState().mode).toBe('dark');
  });
});

describe('setMode', () => {
  it('persists the choice and updates state', async () => {
    await useThemeStore.getState().setMode('light');

    expect(setItemAsync).toHaveBeenCalledWith('wagonwise.themeMode', 'light');
    expect(useThemeStore.getState().mode).toBe('light');
  });
});
