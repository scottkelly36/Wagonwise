import { fireEvent, render, screen } from '@testing-library/react-native';

import SetupLorryScreen from '../app/setup-lorry';
import { useLoadStore } from '../state/load-store';
import { useUsualVehicleStore } from '../state/usual-vehicle-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: mockReplace,
    canGoBack: () => true,
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../hooks/use-current-location', () => ({
  useCurrentLocation: () => ({
    status: 'granted',
    point: { lat: 54.9, lon: -2.1 },
    retry: jest.fn(),
  }),
}));
const mockTrack = jest.fn();
jest.mock('../lib/flow-events', () => ({ trackFlow: (...args: unknown[]) => mockTrack(...args) }));

const mockProfiles: { current: { id: string; name: string }[] } = { current: [] };
const mockCreate = jest.fn();
jest.mock('../api/use-vehicle-profiles', () => ({
  useVehicleProfiles: () => ({ data: mockProfiles.current, isLoading: false }),
  useCreateVehicleProfile: () => ({ mutate: mockCreate, isPending: false, isError: false }),
}));

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockProfiles.current = [];
  useLoadStore.setState({ loaded: false });
  useUsualVehicleStore.setState({ profileId: undefined });
});

it('takes a new driver from a typical size to Plan route, saving the lorry as their usual', async () => {
  mockCreate.mockImplementation((_input, { onSuccess }) =>
    onSuccess({ id: 'new-1', name: 'Artic, 44 tonnes' }),
  );
  await render(<SetupLorryScreen />);
  expect(mockTrack).toHaveBeenCalledWith('plan_opened', 'where_to');

  expect(screen.getByTestId('setup-next').props.accessibilityState).toEqual({ disabled: true });
  await fireEvent.press(screen.getByTestId('setup-preset-artic-44'));
  expect(screen.getByTestId('setup-preset-note')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('setup-next'));
  expect(mockCreate).toHaveBeenCalledWith(
    {
      name: 'Artic, 44 tonnes',
      dimensions: { heightM: 4.2, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
    },
    expect.anything(),
  );
  expect(useUsualVehicleStore.getState().profileId).toBe('new-1');

  // Step 2: the load.
  expect(screen.getByText('What are you carrying?')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('setup-load-hills'));
  expect(useLoadStore.getState().loaded).toBe(true);
  await fireEvent.press(screen.getByTestId('setup-next'));

  // Step 3: where from, already on the phone's position.
  expect(screen.getByText('Artic, 44 tonnes · Hill-sensitive load')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('setup-start-map'));
  await fireEvent.press(screen.getByTestId('setup-next'));
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/plan-route',
    params: { profile: 'new-1', from: 'map', chosen: 'artic-44', via: 'setup' },
  });
});

it('starts on the usual lorry, saves nothing new, and leaves the usual alone when the switch is off', async () => {
  mockProfiles.current = [
    { id: 'a', name: 'Artic' },
    { id: 'b', name: 'Rigid' },
  ];
  useUsualVehicleStore.setState({ profileId: 'b' });
  await render(<SetupLorryScreen />);
  expect(screen.getByTestId('setup-profile-b').props.accessibilityState).toEqual({
    selected: true,
  });

  await fireEvent.press(screen.getByTestId('setup-profile-a'));
  await fireEvent(screen.getByTestId('setup-usual-switch'), 'valueChange', false);
  await fireEvent.press(screen.getByTestId('setup-next'));
  expect(mockCreate).not.toHaveBeenCalled();
  expect(useUsualVehicleStore.getState().profileId).toBe('b');
  await fireEvent.press(screen.getByTestId('setup-next'));
  await fireEvent.press(screen.getByTestId('setup-next'));
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/plan-route',
    params: { profile: 'a', from: 'here', chosen: 'existing', via: 'setup' },
  });
});

it("goes to Add a vehicle for the driver's own sizes, and Change goes back a step", async () => {
  mockProfiles.current = [{ id: 'a', name: 'Artic' }];
  await render(<SetupLorryScreen />);
  await fireEvent.press(screen.getByTestId('setup-own-sizes'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/profiles/new', params: { mode: 'type' } });

  await fireEvent.press(screen.getByTestId('setup-next'));
  await fireEvent.press(screen.getByTestId('setup-done-vehicle'));
  expect(screen.getByText('What do you drive?')).toBeTruthy();
});
