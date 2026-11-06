import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FuelStationDto, UnpricedFuelStationDto } from '@wagonwise/contracts/fuel';

import NearbyFuelScreen from '../app/nearby-fuel';
import { FuelStationDrawer } from '../components/fuel-station-drawer';
import { useFuelChoiceStore } from '../state/fuel-choice-store';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('../hooks/use-current-location', () => ({
  useCurrentLocation: () => ({ status: 'ready', point: { lat: 54.97, lon: -2.1 } }),
}));
jest.mock('../hooks/use-parking-drive-times', () => ({
  useDrivingProfileId: () => 'profile-1',
}));

const mockNavigate = jest.fn();
jest.mock('../hooks/use-navigate-to-spot', () => ({
  useNavigateToPlace: () => ({ mutate: mockNavigate, isPending: false, isError: false }),
}));

let mockFuel: {
  data?: { stations: FuelStationDto[]; withoutPrice?: UnpricedFuelStationDto[] };
  isPending: boolean;
  isError: boolean;
} = {
  isPending: false,
  isError: false,
};
jest.mock('../api/use-fuel', () => ({
  useNearbyFuel: () => ({ ...mockFuel, isRefetching: false, refetch: jest.fn() }),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const station = (overrides: Partial<FuelStationDto>): FuelStationDto => ({
  id: 'a',
  name: 'Station A',
  location: { lat: 54.97, lon: -2.1 },
  isMotorway: false,
  isSupermarket: false,
  amenities: [],
  pencePerLitre: 198.9,
  priceUpdatedAt: hoursAgo(2),
  distanceM: 1000,
  ...overrides,
});

const dear = station({ id: 'dear', brand: 'SHELL', pencePerLitre: 205, distanceM: 500 });
const cheap = station({
  id: 'cheap',
  brand: 'TESCO',
  pencePerLitre: 189.9,
  distanceM: 8000,
  priceUpdatedAt: hoursAgo(30),
});

beforeEach(() => {
  jest.clearAllMocks();
  useFuelChoiceStore.setState({ choice: 'diesel' });
  mockFuel = { data: { stations: [dear, cheap] }, isPending: false, isError: false };
});

const rowIds = () =>
  screen
    .getAllByTestId(/^fuel-row-/)
    .map((row) => (row.props as { testID: string }).testID.replace('fuel-row-', ''));

describe('Nearby fuel list', () => {
  it('lists the cheapest first, with each price and when it was reported', async () => {
    await render(<NearbyFuelScreen />);
    expect(rowIds()).toEqual(['cheap', 'dear']);
    expect(screen.getByText(/189.9p a litre/)).toBeTruthy();
    expect(screen.getAllByText(/Diesel/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Updated 2 hours ago/)).toBeTruthy();
    expect(screen.getByText(/Updated yesterday/)).toBeTruthy();
  });

  it('switches to the closest first', async () => {
    await render(<NearbyFuelScreen />);
    await fireEvent.press(screen.getByTestId('fuel-order-closest'));
    expect(rowIds()).toEqual(['dear', 'cheap']);
  });

  it('switches between diesel and petrol, naming the fuel on every row', async () => {
    await render(<NearbyFuelScreen />);
    expect(screen.getByText('Diesel prices from the last 30 days')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('fuel-choice-petrol'));
    expect(useFuelChoiceStore.getState().choice).toBe('petrol');
    expect(screen.getByText('Petrol prices from the last 30 days')).toBeTruthy();
    expect(screen.getAllByText(/Petrol\s+·/)).toHaveLength(2);
    expect(screen.queryAllByText(/Diesel\s+·/)).toHaveLength(0);
  });

  it('takes the driver to the station that was tapped', async () => {
    await render(<NearbyFuelScreen />);
    await fireEvent.press(screen.getByTestId('fuel-row-cheap'));
    expect(mockNavigate).toHaveBeenCalledWith(cheap.location);
  });

  it('says so when there are no recent prices', async () => {
    mockFuel = { data: { stations: [] }, isPending: false, isError: false };
    await render(<NearbyFuelScreen />);
    expect(screen.getByTestId('nearby-fuel-empty')).toBeTruthy();
  });

  it('marks a price over a week old as possibly out of date, and leaves a fresh one alone', async () => {
    const old = station({ id: 'old', pencePerLitre: 192, priceUpdatedAt: hoursAgo(24 * 12) });
    mockFuel = { data: { stations: [old, dear] }, isPending: false, isError: false };
    await render(<NearbyFuelScreen />);
    expect(screen.getByText(/Updated 12 days ago/)).toBeTruthy();
    expect(screen.getByTestId('fuel-stale-old')).toBeTruthy();
    expect(screen.queryByTestId('fuel-stale-dear')).toBeNull();
  });

  it('lists a nearby station with no price below the priced ones, with no number, and takes the driver there', async () => {
    const esso: UnpricedFuelStationDto = {
      id: 'esso',
      name: 'Esso Hexham',
      brand: 'ESSO',
      location: { lat: 54.96, lon: -2.09 },
      isMotorway: false,
      isSupermarket: false,
      amenities: [],
      distanceM: 700,
    };
    mockFuel = {
      data: { stations: [dear, cheap], withoutPrice: [esso] },
      isPending: false,
      isError: false,
    };
    await render(<NearbyFuelScreen />);
    expect(rowIds()).toEqual(['cheap', 'dear']);
    expect(screen.getByTestId('nearby-fuel-unpriced-heading')).toBeTruthy();
    expect(screen.getAllByText('No recent diesel price reported').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ESSO')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('fuel-unpriced-esso'));
    expect(mockNavigate).toHaveBeenCalledWith(esso.location);
  });

  it('explains when nothing nearby has a price but some stations are there', async () => {
    const esso: UnpricedFuelStationDto = {
      id: 'esso',
      name: 'Esso Hexham',
      location: { lat: 54.96, lon: -2.09 },
      isMotorway: false,
      isSupermarket: false,
      amenities: [],
      distanceM: 700,
    };
    mockFuel = {
      data: { stations: [], withoutPrice: [esso] },
      isPending: false,
      isError: false,
    };
    await render(<NearbyFuelScreen />);
    expect(screen.getByTestId('nearby-fuel-none-priced')).toBeTruthy();
    expect(screen.queryByTestId('nearby-fuel-empty')).toBeNull();
    expect(screen.getByTestId('fuel-unpriced-esso')).toBeTruthy();
  });

  it('says so when the prices could not be loaded', async () => {
    mockFuel = { isPending: false, isError: true };
    await render(<NearbyFuelScreen />);
    expect(screen.getByText(/Couldn’t load fuel prices/)).toBeTruthy();
  });
});

describe('Fuel station drawer', () => {
  it('shows the price and its age, and takes the driver there', async () => {
    const onNavigate = jest.fn();
    await render(<FuelStationDrawer station={cheap} onClose={jest.fn()} onNavigate={onNavigate} />);
    expect(screen.getByTestId('fuel-price')).toHaveTextContent('189.9p a litre');
    expect(screen.getByTestId('fuel-updated')).toHaveTextContent('Updated yesterday');
    await fireEvent.press(screen.getByTestId('fuel-navigate-button'));
    expect(onNavigate).toHaveBeenCalledWith(cheap);
  });

  it('marks a price over a week old as possibly out of date', async () => {
    const old = station({ id: 'old', priceUpdatedAt: hoursAgo(24 * 12) });
    await render(<FuelStationDrawer station={old} onClose={jest.fn()} onNavigate={jest.fn()} />);
    expect(screen.getByTestId('fuel-stale')).toHaveTextContent('May be out of date');
  });

  it('does not mark a recent price', async () => {
    await render(<FuelStationDrawer station={dear} onClose={jest.fn()} onNavigate={jest.fn()} />);
    expect(screen.queryByTestId('fuel-stale')).toBeNull();
  });

  it('names petrol when that is the driver’s fuel', async () => {
    useFuelChoiceStore.setState({ choice: 'petrol' });
    await render(<FuelStationDrawer station={cheap} onClose={jest.fn()} onNavigate={jest.fn()} />);
    expect(screen.getByText('Petrol')).toBeTruthy();
    expect(screen.queryByText('Diesel')).toBeNull();
  });

  it('is closed with no station', async () => {
    await render(
      <FuelStationDrawer station={undefined} onClose={jest.fn()} onNavigate={jest.fn()} />,
    );
    expect(screen.queryByTestId('fuel-price')).toBeNull();
  });
});
