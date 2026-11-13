import { useConnectionStore } from '../state/connection-store';
import { requestJson } from './http';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => useConnectionStore.setState({ offline: false }));

function respond(status: number): void {
  globalThis.fetch = jest.fn().mockResolvedValue({
    status,
    headers: { get: () => '0' },
    json: () => Promise.resolve({}),
  }) as unknown as typeof fetch;
}

describe('requestJson and the connection', () => {
  it('marks the phone offline when the request never reaches the server', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(requestJson('GET', '/x')).rejects.toThrow('Network request failed');
    expect(useConnectionStore.getState().offline).toBe(true);
  });

  it('marks it online again on any answer, even an error one', async () => {
    useConnectionStore.setState({ offline: true });
    respond(503);
    await requestJson('GET', '/x');
    expect(useConnectionStore.getState().offline).toBe(false);
  });
});
