import { useFlowEventsStore } from '../state/flow-events-store';
import { routeOptionChoice, trackFlow } from './flow-events';

const mockQueued: unknown[] = [];

jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('../db/flow-event-queue', () => ({
  enqueueFlowEvent: jest.fn(async (item: unknown) => {
    mockQueued.push(item);
  }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

beforeEach(() => {
  mockQueued.length = 0;
  useFlowEventsStore.setState({ status: 'on' });
});

describe('trackFlow', () => {
  it('queues a step with its choice and the time', async () => {
    trackFlow('load_chosen', 'hill_sensitive');
    await flush();
    expect(mockQueued).toEqual([
      { event: 'load_chosen', choice: 'hill_sensitive', at: expect.any(String) },
    ]);
  });

  it('never queues anything off the fixed lists, such as a place someone typed', async () => {
    trackFlow('destination_chosen', 'NE46 3DT');
    trackFlow('load_chosen');
    await flush();
    expect(mockQueued).toEqual([]);
  });

  it('queues nothing while the driver has turned it off', async () => {
    useFlowEventsStore.setState({ status: 'off' });
    trackFlow('route_shown');
    await flush();
    expect(mockQueued).toEqual([]);
  });
});

describe('routeOptionChoice', () => {
  it('names a card by its main label, as the fixed list does', () => {
    expect(routeOptionChoice(['fastest', 'cheapest'])).toBe('fastest');
    expect(routeOptionChoice(['toll-free'])).toBe('toll_free');
    expect(routeOptionChoice(['gentle'])).toBe('fewer_hills');
    expect(routeOptionChoice(['shortest'])).toBe('shortest');
  });
});
