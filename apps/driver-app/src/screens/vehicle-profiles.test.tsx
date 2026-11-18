import { fireEvent, render, screen } from '@testing-library/react-native';

import VehicleProfileScreen from '../app/profiles/[id]';
import VehicleProfilesScreen from '../app/profiles/index';
import { useUsualVehicleStore } from '../state/usual-vehicle-store';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p2' }),
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
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
const profiles = [
  {
    id: 'p1',
    name: 'Artic',
    dimensions: { heightM: 4.2, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
  },
  {
    id: 'p2',
    name: 'Rigid',
    dimensions: { heightM: 4, widthM: 2.55, lengthM: 10, grossWeightT: 18 },
  },
];
const mutation = () => ({ mutate: jest.fn(), isPending: false, isError: false });
jest.mock('../api/use-vehicle-profiles', () => ({
  useVehicleProfiles: () => ({
    data: profiles,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useVehicleProfile: () => ({ data: profiles[1], isLoading: false, isError: false }),
  useUpdateVehicleProfile: () => mutation(),
  useDeleteVehicleProfile: () => mutation(),
}));

jest.setTimeout(30_000);

beforeEach(() => useUsualVehicleStore.setState({ profileId: undefined }));

it('tags the usual lorry in the list', async () => {
  useUsualVehicleStore.setState({ profileId: 'p1' });
  await render(<VehicleProfilesScreen />);
  expect(screen.getByTestId('profile-usual-p1')).toBeTruthy();
  expect(screen.queryByTestId('profile-usual-p2')).toBeNull();
});

it('sets and clears the usual lorry from a vehicle', async () => {
  await render(<VehicleProfileScreen />);
  await fireEvent(screen.getByTestId('profile-usual-switch'), 'valueChange', true);
  expect(useUsualVehicleStore.getState().profileId).toBe('p2');
  await fireEvent(screen.getByTestId('profile-usual-switch'), 'valueChange', false);
  expect(useUsualVehicleStore.getState().profileId).toBeUndefined();
});
