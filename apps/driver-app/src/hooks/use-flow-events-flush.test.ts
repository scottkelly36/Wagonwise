import { useFlowEventsStore } from '../state/flow-events-store';
import { sendFlowEvents } from './use-flow-events-flush';

const mockRows: { id: number; event: string; choice?: string; at: string }[] = [];
const mockPosted: unknown[] = [];
let mockPostFails = false;

jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.1' } },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('../db/flow-event-queue', () => ({
  listFlowEvents: jest.fn(async () => [...mockRows]),
  removeFlowEvents: jest.fn(async (ids: number[]) => {
    for (const id of ids) {
      const i = mockRows.findIndex((r) => r.id === id);
      if (i >= 0) mockRows.splice(i, 1);
    }
  }),
  clearFlowEvents: jest.fn(async () => {
    mockRows.length = 0;
  }),
  enqueueFlowEvent: jest.fn(),
}));
jest.mock('../api/usage', () => ({
  postFlowEvents: jest.fn(async (_token: string, body: unknown) => {
    if (mockPostFails) throw new Error('no signal');
    mockPosted.push(body);
    return 1;
  }),
}));

const now = new Date('2026-11-17T12:00:00.000Z');

beforeEach(() => {
  mockRows.length = 0;
  mockPosted.length = 0;
  mockPostFails = false;
  useFlowEventsStore.setState({ status: 'on' });
});

describe('sendFlowEvents', () => {
  it('sends the waiting events with the session, version and platform, and removes them once sent', async () => {
    mockRows.push({
      id: 1,
      event: 'load_chosen',
      choice: 'normal',
      at: '2026-11-17T11:00:00.000Z',
    });
    await sendFlowEvents('token', now);
    expect(mockPosted).toEqual([
      {
        sessionId: '11111111-1111-4111-8111-111111111111',
        appVersion: '1.2.1',
        platform: expect.stringMatching(/^(ios|android)$/),
        events: [{ event: 'load_chosen', choice: 'normal', at: '2026-11-17T11:00:00.000Z' }],
      },
    ]);
    expect(mockRows).toEqual([]);
  });

  it('keeps the events for next time when sending fails, and says nothing', async () => {
    mockPostFails = true;
    mockRows.push({ id: 1, event: 'route_shown', at: '2026-11-17T11:00:00.000Z' });
    await expect(sendFlowEvents('token', now)).rejects.toThrow();
    expect(mockRows).toHaveLength(1);
  });

  it('throws away anything over a day old without sending it', async () => {
    mockRows.push({ id: 1, event: 'route_shown', at: '2026-11-15T11:00:00.000Z' });
    await sendFlowEvents('token', now);
    expect(mockPosted).toEqual([]);
    expect(mockRows).toEqual([]);
  });

  it('empties the queue and sends nothing once the driver has turned it off', async () => {
    useFlowEventsStore.setState({ status: 'off' });
    mockRows.push({ id: 1, event: 'route_shown', at: '2026-11-17T11:00:00.000Z' });
    await sendFlowEvents('token', now);
    expect(mockPosted).toEqual([]);
    expect(mockRows).toEqual([]);
  });
});
