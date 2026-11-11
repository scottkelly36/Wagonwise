import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PlanRouteScreen from '../app/plan-route';
import { useLoadStore } from '../state/load-store';
import { useMeasureUnitsStore } from '../state/measure-units-store';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../hooks/use-current-location', () => ({
  useCurrentLocation: () => ({
    status: 'ready',
    point: { lat: 54.9, lon: -1.5 },
    retry: jest.fn(),
  }),
}));
jest.mock('../api/use-hazards', () => ({ useNearbyHazards: () => ({ data: [] }) }));
jest.mock('../components/hazard-detail-drawer', () => ({ HazardDetailDrawer: () => null }));
jest.mock('../components/address-search-field', () => ({ AddressSearchField: () => null }));
jest.mock('../components/words-search-field', () => ({ WordsSearchField: () => null }));
// The map is a picture here; a button stands in for tapping it to choose where to go.
jest.mock('../components/route-map', () => {
  const { createElement } = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    RouteMap: ({ onMapPress }: { onMapPress: (p: { lat: number; lon: number }) => void }) =>
      createElement(
        Pressable,
        { testID: 'map-tap', onPress: () => onMapPress({ lat: 56, lon: -3.7 }) },
        createElement(Text, null, 'map'),
      ),
  };
});

const mockPreview = jest.fn();
jest.mock('../api/use-route-plans', () => ({
  useCreateRoutePlan: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  usePreviewRouteOptions: () => ({
    mutate: mockPreview,
    isPending: false,
    isError: false,
  }),
}));
jest.mock('../api/use-vehicle-profiles', () => ({
  useVehicleProfiles: () => ({
    data: [
      {
        id: 'p1',
        name: 'Artic 44 t',
        dimensions: { heightM: 4, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
      },
    ],
    isLoading: false,
  }),
  useCreateVehicleProfile: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const hills = (steepKm: number, highestPointM: number) => ({
  climbM: 900,
  highestPointM,
  steepestPct: 9,
  steepKm,
  steepStretches: 2,
});

async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <PlanRouteScreen />
    </QueryClientProvider>,
  );
}

async function chooseDestination() {
  await fireEvent.press(await screen.findByTestId('map-tap'));
}

beforeEach(() => {
  mockPreview.mockReset();
  useLoadStore.setState({ loaded: false });
  useMeasureUnitsStore.setState({ distance: 'km', fuel: 'l100km' });
});

describe('the Load switch on Plan route', () => {
  it('is Normal to begin with, and says what Hill-sensitive does when chosen', async () => {
    await open();
    expect(await screen.findByTestId('load-switch')).toBeTruthy();
    expect(screen.getByText('Plans the usual way, with no hill check.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('load-loaded-button'));
    expect(useLoadStore.getState().loaded).toBe(true);
    expect(screen.getByTestId('load-note').props.children).toMatch(/Checks the hills/);
  });

  it('asks for the quickest route only, with no hill check, when Empty', async () => {
    await open();
    await chooseDestination();
    await fireEvent.press(await screen.findByTestId('plan-route-button'));
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview.mock.calls[0][0]).not.toHaveProperty('loaded');
  });

  it('asks for the hills to be checked when Loaded', async () => {
    useLoadStore.setState({ loaded: true });
    await open();
    await chooseDestination();
    await fireEvent.press(await screen.findByTestId('plan-route-button'));
    expect(mockPreview.mock.calls[0][0]).toMatchObject({ profileId: 'p1', loaded: true });
  });

  it('shows both routes with their hills, and what the gentler one is called', async () => {
    useLoadStore.setState({ loaded: true });
    await open();
    await chooseDestination();
    await fireEvent.press(await screen.findByTestId('plan-route-button'));

    // The server's answer: the quickest, and a gentler one.
    const [, handlers] = mockPreview.mock.calls[0] as [
      unknown,
      { onSuccess: (o: unknown) => void },
    ];
    handlers.onSuccess([
      {
        geometry: 'a',
        distanceKm: 221,
        durationMin: 228,
        labels: ['fastest', 'shortest'],
        hills: hills(8.7, 418),
      },
      {
        geometry: 'b',
        distanceKm: 290,
        durationMin: 252,
        labels: ['gentle'],
        hills: hills(2.3, 328),
      },
    ]);

    expect(await screen.findByTestId('route-option-1')).toBeTruthy();
    expect(screen.getByText('Fastest & Shortest')).toBeTruthy();
    expect(screen.getByText('Fewer hills')).toBeTruthy();
    expect(screen.getByTestId('route-option-0-hills').props.children).toBe(
      '8.7 km of steep hill · highest point 418 m',
    );
    expect(screen.getByTestId('route-option-1-hills').props.children).toBe(
      '2.3 km of steep hill · highest point 328 m',
    );
    expect(screen.queryByTestId('hills-unavailable')).toBeNull();
  });

  it('says which routes have a toll, and shows the toll-free route as its own card', async () => {
    await open();
    await chooseDestination();
    await fireEvent.press(await screen.findByTestId('plan-route-button'));
    // This version tells the server it can show tolls, so an older app is never sent a label it cannot read.
    expect(mockPreview.mock.calls[0][0]).toMatchObject({ tolls: true, dailyZones: true });

    const [, handlers] = mockPreview.mock.calls[0] as [
      unknown,
      { onSuccess: (o: unknown) => void },
    ];
    handlers.onSuccess([
      {
        geometry: 'a',
        distanceKm: 120,
        durationMin: 90,
        labels: ['fastest', 'shortest'],
        hasToll: true,
      },
      { geometry: 'b', distanceKm: 150, durationMin: 105, labels: ['toll-free'], hasToll: false },
    ]);

    expect(await screen.findByTestId('route-option-1')).toBeTruthy();
    expect(screen.getByText('Toll free')).toBeTruthy();
    expect(screen.getByTestId('route-option-0-toll').props.children).toBe('Includes a toll');
    expect(screen.queryByTestId('route-option-1-toll')).toBeNull();
  });

  it('names the toll and its price on the card, with when to pay, and keeps "Includes a toll" for one it could not name', async () => {
    await open();
    await chooseDestination();
    await fireEvent.press(await screen.findByTestId('plan-route-button'));
    const [, handlers] = mockPreview.mock.calls[0] as [
      unknown,
      { onSuccess: (o: unknown) => void },
    ];
    handlers.onSuccess([
      {
        geometry: 'a',
        distanceKm: 120,
        durationMin: 90,
        labels: ['fastest', 'shortest'],
        hasToll: true,
        charges: [
          {
            name: 'Dartford Crossing',
            lowGBP: 8.4,
            highGBP: 8.4,
            note: 'Charged from 6am to 10pm.',
            payBy: 'Pay by midnight the day after you cross.',
          },
        ],
      },
      { geometry: 'b', distanceKm: 150, durationMin: 105, labels: ['gentle'], hasToll: true },
    ]);

    expect(await screen.findByTestId('route-option-1')).toBeTruthy();
    expect(screen.getByTestId('route-option-0-toll').props.children).toBe(
      'Toll: Dartford Crossing, £8.40',
    );
    expect(screen.getByTestId('route-option-0-toll-detail').props.children).toBe(
      'Charged from 6am to 10pm. Pay by midnight the day after you cross.',
    );
    expect(screen.getByTestId('route-option-1-toll').props.children).toBe('Includes a toll');
  });

  it('says on the card that a route enters a low emission zone, and what that means for the vehicle', async () => {
    await open();
    await chooseDestination();
    await fireEvent.press(await screen.findByTestId('plan-route-button'));
    const [, handlers] = mockPreview.mock.calls[0] as [
      unknown,
      { onSuccess: (o: unknown) => void },
    ];
    handlers.onSuccess([
      {
        geometry: 'a',
        distanceKm: 120,
        durationMin: 90,
        labels: ['fastest', 'shortest'],
        zones: [{ name: 'Glasgow Low Emission Zone', status: 'may-be-charged', penaltyGBP: 60 }],
      },
      { geometry: 'b', distanceKm: 150, durationMin: 105, labels: ['gentle'] },
    ]);

    expect(await screen.findByTestId('route-option-1')).toBeTruthy();
    expect(screen.getByTestId('route-option-0-zone').props.children).toMatch(
      /^Glasgow Low Emission Zone: a penalty of £60 applies/,
    );
    expect(screen.queryByTestId('route-option-1-zone')).toBeNull();
    // The licence asks for a credit, shown once.
    expect(screen.getAllByTestId('zone-credit')).toHaveLength(1);
    expect(screen.getByTestId('zone-credit').props.children).toMatch(
      /Open Government Licence v3.0/,
    );
  });

  it('says so when the server could not check the hills', async () => {
    useLoadStore.setState({ loaded: true });
    await open();
    await chooseDestination();
    await fireEvent.press(await screen.findByTestId('plan-route-button'));

    const [, handlers] = mockPreview.mock.calls[0] as [
      unknown,
      { onSuccess: (o: unknown) => void },
    ];
    handlers.onSuccess([
      { geometry: 'a', distanceKm: 221, durationMin: 228, labels: ['fastest', 'shortest'] },
    ]);

    expect(await screen.findByTestId('hills-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('route-option-0-hills')).toBeNull();
  });
});
