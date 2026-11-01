import { describe, expect, it } from 'vitest';
import { parseClosuresFeed, parsePosList } from './datex-closures-parser.js';

interface RecordSpec {
  readonly id: string;
  readonly type?: string;
  readonly status?: string;
  readonly start?: string | undefined;
  readonly end?: string | undefined;
  readonly comment?: string;
  readonly lanes?: readonly string[];
  readonly lines?: readonly string[];
  readonly road?: string;
  readonly direction?: string;
}

/** One record shaped like National Highways' own (a trimmed copy of a real closure), with the parts a test varies. */
function record(spec: RecordSpec): string {
  const lanes = (spec.lanes ?? [])
    .map(
      (status, i) => `
        <lane>
          <laneNumber>${i + 1}</laneNumber>
          <laneExtensionG><impactOnLanes><impactExtensionG><lanesStatus>${status}</lanesStatus></impactExtensionG></impactOnLanes></laneExtensionG>
        </lane>`,
    )
    .join('');
  const lines = (spec.lines ?? ['52.0 -1.0 52.01 -1.01 52.02 -1.02'])
    .map(
      (posList) => `
      <locationContainedInGroup>
        <locLinearLocation>
          <gmlLineString><locGmlLineString><srsDimension>2</srsDimension><srsName>EPSG::4326</srsName><posList>${posList}</posList></locGmlLineString></gmlLineString>
          <supplementaryPositionalDescription>
            <locationDescription>M56 eastbound between J7 and J6</locationDescription>
            <carriageway><carriageway><value>extendedG</value><extendedValueG>dualCarriageway</extendedValueG></carriageway>${lanes}</carriageway>
          </supplementaryPositionalDescription>
        </locLinearLocation>
        <locSingleRoadLinearLocation>
          <linearWithinLinearElement>
            <directionOnLinearSection>${spec.direction ?? 'eastBound'}</directionOnLinearSection>
            <linearElement><locLinearElementByCode><roadName>${spec.road ?? 'M56'}</roadName></locLinearElementByCode></linearElement>
          </linearWithinLinearElement>
        </locSingleRoadLinearLocation>
      </locationContainedInGroup>`,
    )
    .join('');
  const window =
    spec.start === undefined && spec.end === undefined
      ? ''
      : `<validityTimeSpecification>${
          spec.start === undefined ? '' : `<overallStartTime>${spec.start}</overallStartTime>`
        }${spec.end === undefined ? '' : `<overallEndTime>${spec.end}</overallEndTime>`}</validityTimeSpecification>`;
  return `
  <situationRecord>
    <sitRoadOrCarriagewayOrLaneManagement>
      <idG>${spec.id}</idG>
      <versionG>1</versionG>
      <situationRecordVersionTime>2026-11-01T10:00:00Z</situationRecordVersionTime>
      <roadOrCarriagewayOrLaneManagementType><value>${spec.type ?? 'carriagewayClosures'}</value></roadOrCarriagewayOrLaneManagementType>
      <validity><validityStatus>${spec.status ?? 'planned'}</validityStatus>${window}</validity>
      <cause><causeType>roadMaintenance</causeType><detailedCauseType><roadMaintenanceType>maintenanceWork</roadMaintenanceType></detailedCauseType></cause>
      <generalPublicComment><comment>${spec.comment ?? 'M56 eastbound jct 7 to 6 carriageway closure'}</comment></generalPublicComment>
      <locationReference><locLocationGroupByList>${lines}</locLocationGroupByList></locationReference>
    </sitRoadOrCarriagewayOrLaneManagement>
  </situationRecord>`;
}

const feed = (...situations: string[][]): string => `<?xml version="1.0"?>
<D2Payload>
  <version>3.4</version>
  <feedType>SituationPublication</feedType>${situations
    .map((records, i) => `<situation><idG>${500000 + i}</idG>${records.join('')}</situation>`)
    .join('')}
</D2Payload>`;

const NIGHT = { start: '2026-11-01T22:00:00Z', end: '2026-11-02T06:00:00Z' };

describe('parseClosuresFeed', () => {
  it('reads a full carriageway closure: when, where, why, and what National Highways says', () => {
    const [closure] = parseClosuresFeed(
      feed([
        record({
          id: 'rec-1',
          status: 'active',
          ...NIGHT,
          lines: ['52.0 -1.0 52.01 -1.01 52.02 -1.02'],
        }),
      ]),
    );
    expect(closure).toMatchObject({
      id: 'rec-1',
      situationId: '500000',
      kind: 'full',
      status: 'active',
      road: 'M56',
      direction: 'eastBound',
      description: 'M56 eastbound jct 7 to 6 carriageway closure',
      locationText: 'M56 eastbound between J7 and J6',
      cause: 'maintenanceWork',
      lanesClosed: 0,
    });
    expect(closure?.startsAt).toEqual(new Date('2026-11-01T22:00:00Z'));
    expect(closure?.endsAt).toEqual(new Date('2026-11-02T06:00:00Z'));
    expect(closure?.updatedAt).toEqual(new Date('2026-11-01T10:00:00Z'));
    // Latitude comes first in the feed's numbers; the marker is the middle point of the line.
    expect(closure?.position).toEqual({ lat: 52.01, lon: -1.01 });
    expect(closure?.lines).toEqual([
      [
        { lat: 52.0, lon: -1.0 },
        { lat: 52.01, lon: -1.01 },
        { lat: 52.02, lon: -1.02 },
      ],
    ]);
  });

  it('keeps every line of a closure that has more than one, and draws it on the first', () => {
    const [closure] = parseClosuresFeed(
      feed([
        record({ id: 'rec-1', ...NIGHT, lines: ['52.0 -1.0 52.1 -1.1', '53.0 -2.0 53.1 -2.1'] }),
      ]),
    );
    expect(closure?.lines).toHaveLength(2);
    expect(closure?.position).toEqual({ lat: 52.1, lon: -1.1 });
  });

  it('keeps a short lane closure and counts the lanes shut', () => {
    const [closure] = parseClosuresFeed(
      feed([
        record({
          id: 'rec-2',
          type: 'other',
          comment: 'Lane 1 closure northbound',
          lanes: ['closed', 'closed', 'opened'],
          start: '2026-11-03T20:00:00Z',
          end: '2026-11-04T05:00:00Z',
        }),
      ]),
    );
    expect(closure).toMatchObject({ kind: 'lane', lanesClosed: 2 });
  });

  it('leaves out a lane closure that runs for months, a narrowing, and a record with no window', () => {
    const closures = parseClosuresFeed(
      feed([
        record({
          id: 'long',
          type: 'other',
          lanes: ['closed'],
          start: '2026-09-01T00:00:00Z',
          end: '2027-06-01T00:00:00Z',
        }),
        record({ id: 'narrow', type: 'other', lanes: ['narrow'], ...NIGHT }),
        record({ id: 'no-end', start: NIGHT.start }),
        record({ id: 'no-start', end: NIGHT.end }),
        record({ id: 'backwards', start: NIGHT.end, end: NIGHT.start }),
        record({ id: 'kept', ...NIGHT }),
      ]),
    );
    expect(closures.map((c) => c.id)).toEqual(['kept']);
  });

  it('keeps a full closure however long it runs', () => {
    const closures = parseClosuresFeed(
      feed([
        record({ id: 'long-full', start: '2026-09-01T00:00:00Z', end: '2027-12-01T00:00:00Z' }),
      ]),
    );
    expect(closures.map((c) => c.id)).toEqual(['long-full']);
  });

  it('reads suspended and unfamiliar statuses, and several schemes', () => {
    const closures = parseClosuresFeed(
      feed(
        [record({ id: 'a', status: 'suspended', ...NIGHT })],
        [record({ id: 'b', status: 'definedByValidityTimeSpec', ...NIGHT })],
      ),
    );
    expect(closures.map((c) => [c.id, c.situationId, c.status])).toEqual([
      ['a', '500000', 'suspended'],
      ['b', '500001', 'planned'],
    ]);
  });

  it('leaves out a record whose line cannot be read', () => {
    const closures = parseClosuresFeed(
      feed([
        record({ id: 'odd', ...NIGHT, lines: ['52.0 -1.0 52.1'] }),
        record({ id: 'junk', ...NIGHT, lines: ['north south'] }),
        record({ id: 'good', ...NIGHT }),
      ]),
    );
    expect(closures.map((c) => c.id)).toEqual(['good']);
  });

  it('gives nothing for a feed with no situations, and throws for something that is not a feed', () => {
    expect(
      parseClosuresFeed('<?xml version="1.0"?><D2Payload><version>3.4</version></D2Payload>'),
    ).toEqual([]);
    expect(() => parseClosuresFeed('<html><body>Service unavailable</body></html>')).toThrow();
    expect(() => parseClosuresFeed('')).toThrow();
  });
});

describe('parsePosList', () => {
  it('reads latitude and longitude pairs', () => {
    expect(parsePosList('52.25 0.0375 52.24 0.04')).toEqual([
      { lat: 52.25, lon: 0.0375 },
      { lat: 52.24, lon: 0.04 },
    ]);
  });

  it('refuses an odd count, a non-number, and a place off the earth', () => {
    expect(parsePosList('52.25 0.0375 52.24')).toEqual([]);
    expect(parsePosList('52.25 abc')).toEqual([]);
    expect(parsePosList('152.25 0.0375')).toEqual([]);
    expect(parsePosList('')).toEqual([]);
  });
});
