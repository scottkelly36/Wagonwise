import { describe, expect, it, vi } from 'vitest';
import { NationalHighwaysClient, NoClosureSource } from './national-highways-client.js';

const URL = 'https://api.example.test/roads/v2.0/closures';

const FEED = `<?xml version="1.0"?>
<D2Payload><version>3.4</version>
  <situation><idG>1</idG>
    <situationRecord><sitRoadOrCarriagewayOrLaneManagement>
      <idG>rec-1</idG>
      <situationRecordVersionTime>2026-11-01T10:00:00Z</situationRecordVersionTime>
      <roadOrCarriagewayOrLaneManagementType><value>carriagewayClosures</value></roadOrCarriagewayOrLaneManagementType>
      <validity><validityStatus>planned</validityStatus><validityTimeSpecification><overallStartTime>2026-11-01T22:00:00Z</overallStartTime><overallEndTime>2026-11-02T06:00:00Z</overallEndTime></validityTimeSpecification></validity>
      <generalPublicComment><comment>M56 closure</comment></generalPublicComment>
      <locationReference><locLocationGroupByList><locationContainedInGroup><locLinearLocation><gmlLineString><locGmlLineString><posList>52.0 -1.0 52.1 -1.1</posList></locGmlLineString></gmlLineString></locLinearLocation></locationContainedInGroup></locLocationGroupByList></locationReference>
    </sitRoadOrCarriagewayOrLaneManagement></situationRecord>
  </situation>
</D2Payload>`;

const xml = (body: string, status = 200) => new Response(body, { status });

describe('NationalHighwaysClient', () => {
  it('sends the key in the subscription header and reads the feed', async () => {
    const fetchFn = vi.fn().mockResolvedValue(xml(FEED));
    const client = new NationalHighwaysClient({ keys: ['primary-key'], url: URL }, fetchFn);

    const result = await client.fetchClosures();
    expect(result.ok && result.value.map((c) => c.id)).toEqual(['rec-1']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(URL);
    expect((init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe(
      'primary-key',
    );
  });

  it('tries the secondary key when the primary is refused, and says which was refused', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(xml('Access denied', 401))
      .mockResolvedValueOnce(xml(FEED));
    const problems: string[] = [];
    const client = new NationalHighwaysClient(
      { keys: ['primary-key', 'secondary-key'], url: URL },
      fetchFn,
      (what) => problems.push(what),
    );

    expect((await client.fetchClosures()).ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(
      ((fetchFn.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>)[
        'Ocp-Apim-Subscription-Key'
      ],
    ).toBe('secondary-key');
    expect(problems).toEqual(['National Highways refused key 1']);
  });

  it('is unauthorised when every key is refused', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(xml('no', 403)));
    const client = new NationalHighwaysClient({ keys: ['a', 'b'], url: URL }, fetchFn);
    expect(await client.fetchClosures()).toEqual({
      ok: false,
      error: { tag: 'ClosureSourceUnavailable', reason: 'unauthorised', status: 403 },
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not try a second key for a failure a second key would not fix', async () => {
    const fetchFn = vi.fn().mockResolvedValue(xml('oops', 503));
    const client = new NationalHighwaysClient({ keys: ['a', 'b'], url: URL }, fetchFn);
    expect(await client.fetchClosures()).toEqual({
      ok: false,
      error: { tag: 'ClosureSourceUnavailable', reason: 'http_error', status: 503 },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure and an unreadable answer, never throwing', async () => {
    const down = new NationalHighwaysClient(
      { keys: ['a'], url: URL },
      vi.fn().mockRejectedValue(new Error('ECONNRESET')),
    );
    expect(await down.fetchClosures()).toEqual({
      ok: false,
      error: { tag: 'ClosureSourceUnavailable', reason: 'unreachable' },
    });

    const junk = new NationalHighwaysClient(
      { keys: ['a'], url: URL },
      vi.fn().mockResolvedValue(xml('<html>Service unavailable</html>')),
    );
    expect(await junk.fetchClosures()).toEqual({
      ok: false,
      error: { tag: 'ClosureSourceUnavailable', reason: 'unreadable' },
    });
  });

  it('never puts a key in what it reports about a problem', async () => {
    const seen: unknown[] = [];
    const client = new NationalHighwaysClient(
      { keys: ['super-secret-key'], url: URL },
      vi.fn().mockResolvedValue(xml('denied', 401)),
      (_what, detail) => seen.push(detail),
    );
    await client.fetchClosures();
    expect(JSON.stringify(seen)).not.toContain('super-secret-key');
  });
});

describe('NoClosureSource and a client with no key', () => {
  it('make no request and say they are not set up', async () => {
    const fetchFn = vi.fn();
    const none = new NationalHighwaysClient({ keys: [], url: URL }, fetchFn);
    expect(none.enabled).toBe(false);
    expect(await none.fetchClosures()).toEqual({
      ok: false,
      error: { tag: 'ClosureSourceUnavailable', reason: 'not_configured' },
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(new NoClosureSource().enabled).toBe(false);
  });
});
