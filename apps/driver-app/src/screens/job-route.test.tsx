import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import JobRouteScreen from '../app/job-route';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useLoadStore } from '../state/load-store';
import { useMeasureUnitsStore } from '../state/measure-units-store';
import { useTripTollsStore } from '../state/trip-tolls-store';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: mockReplace,
    canGoBack: () => true,
  }),
  Redirect: ({ href }: { href: string }) => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, { testID: 'redirect' }, href);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../hooks/use-access-token', () => ({ useAccessToken: () => 'token-1' }));
const mockFetchLocation = jest.fn();
jest.mock('../hooks/use-current-location', () => ({
  fetchCurrentLocation: () => mockFetchLocation(),
}));
jest.mock('../components/route-map', () => ({ RouteMap: () => null }));

const mockGetProfile = jest.fn();
jest.mock('../api/jobs', () => ({
  getNavigationProfile: (...args: unknown[]) => mockGetProfile(...args),
}));

const mockJob = jest.fn();
jest.mock('../api/use-jobs', () => ({ useCurrentJob: () => mockJob() }));

const mockPreview = jest.fn();
const mockCreate = jest.fn();
jest.mock('../api/use-route-plans', () => ({
  useCreateRoutePlan: () => ({ mutate: mockCreate, isPending: false, isError: false }),
  usePreviewRouteOptions: () => ({ mutateAsync: mockPreview }),
}));

jest.setTimeout(30_000);

const here = { lat: 54.9, lon: -1.5 };
const stop = { lat: 56, lon: -3.7 };
const deliveryJob = {
  id: 'job-1',
  status: 'loaded',
  currentStop: 0,
  stops: [{ kind: 'delivery', location: stop }],
};
const options = [
  {
    geometry: 'a',
    distanceKm: 120,
    durationMin: 90,
    labels: ['fastest', 'shortest'],
    hasToll: true,
  },
  { geometry: 'b', distanceKm: 150, durationMin: 105, labels: ['toll-free'], hasToll: false },
];

async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <JobRouteScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const m of [
    mockReplace,
    mockFetchLocation,
    mockGetProfile,
    mockJob,
    mockPreview,
    mockCreate,
  ])
    m.mockReset();
  mockJob.mockReturnValue({ isPending: false, data: deliveryJob });
  mockFetchLocation.mockResolvedValue({ ok: true, point: here });
  mockGetProfile.mockResolvedValue({ profileId: 'company-vehicle' });
  mockPreview.mockResolvedValue(options);
  useLoadStore.setState({ loaded: false });
  useMeasureUnitsStore.setState({ distance: 'km', fuel: 'l100km' });
  useTripTollsStore.setState({ avoiding: {} });
  useCurrentRoutePlanStore.setState({ plan: undefined });
});

describe('the route choice on an assigned job', () => {
  it('looks for routes for the assigned vehicle, from here to the next stop, and shows them as cards', async () => {
    await open();
    expect(await screen.findByTestId('route-option-1')).toBeTruthy();

    expect(mockGetProfile).toHaveBeenCalledWith('token-1', 'job-1');
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview.mock.calls[0][0]).toMatchObject({
      profileId: 'company-vehicle',
      origin: here,
      destination: stop,
      tolls: true,
      dailyZones: true,
      costs: true,
    });
    expect(mockPreview.mock.calls[0][0]).not.toHaveProperty('loaded');
    expect(screen.getByTestId('job-route-heading').props.children.join('')).toMatch(/delivery/);
    expect(screen.getByText('Toll free')).toBeTruthy();
  });

  it('tells the server the load is Hill-sensitive when it is', async () => {
    useLoadStore.setState({ loaded: true });
    await open();
    await screen.findByTestId('route-option-0');
    expect(mockPreview.mock.calls[0][0]).toMatchObject({ loaded: true });
  });

  it('plans the route the driver chooses, with that choice, and opens the overview', async () => {
    await open();
    await fireEvent.press(await screen.findByTestId('route-option-0'));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [request, handlers] = mockCreate.mock.calls[0] as [
      Record<string, unknown>,
      { onSuccess: (plan: { id: string }) => void },
    ];
    expect(request).toMatchObject({
      profileId: 'company-vehicle',
      origin: here,
      destination: stop,
      strategy: 'fastest',
    });
    handlers.onSuccess({ id: 'plan-1' });
    expect(mockReplace).toHaveBeenCalledWith('/route-overview');
    expect(useCurrentRoutePlanStore.getState().plan).toMatchObject({ id: 'plan-1' });
    expect(useTripTollsStore.getState().isAvoiding('plan-1')).toBe(false);
  });

  it('remembers a Toll free choice, so a re-plan from here keeps avoiding tolls', async () => {
    await open();
    await fireEvent.press(await screen.findByTestId('route-option-1'));
    const [request, handlers] = mockCreate.mock.calls[0] as [
      Record<string, unknown>,
      { onSuccess: (plan: { id: string }) => void },
    ];
    expect(request).toMatchObject({ strategy: 'toll-free' });
    handlers.onSuccess({ id: 'plan-2' });
    expect(useTripTollsStore.getState().isAvoiding('plan-2')).toBe(true);
  });

  it('says why when the location is not available, and offers the way back to the job', async () => {
    mockFetchLocation.mockResolvedValue({ ok: false });
    await open();
    expect(await screen.findByTestId('job-route-error')).toBeTruthy();
    expect(screen.getByTestId('job-route-error').props.children).toMatch(/location/i);
    expect(mockPreview).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('job-route-back-to-job'));
    expect(mockReplace).toHaveBeenCalledWith('/job');
  });

  it('goes home when there is nothing to navigate to', async () => {
    mockJob.mockReturnValue({
      isPending: false,
      data: { ...deliveryJob, status: 'at_delivery' },
    });
    await open();
    expect(await screen.findByTestId('redirect')).toBeTruthy();
    expect(mockPreview).not.toHaveBeenCalled();
  });
});
