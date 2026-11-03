import { XMLParser } from 'fast-xml-parser';
import {
  isWorthKeeping,
  middleOf,
  type Closure,
  type ClosureKind,
  type ClosurePoint,
  type ClosureStatus,
} from '../domain/closure.js';

/**
 * Reads National Highways' Road and Lane Closures feed (DATEX II 3.4): a `D2Payload` of `situation`s (roadworks schemes), each with
 * `situationRecord`s, each one a closure, a narrowing, a speed limit… Only closures are kept (see `isWorthKeeping`).
 *
 * The nesting is deep and not the same from record to record (one line or several, one lane or several), so values are found by
 * their tag name anywhere inside the record rather than by a fixed path. The few tags used are unique to their meaning in this feed.
 */
const parser = new XMLParser({
  ignoreAttributes: true,
  // Keep every value as text: "0" lanes and "1-1788362591-…" ids must not be turned into numbers.
  parseTagValue: false,
  trimValues: true,
  // These repeat, so one of them must still be a list.
  isArray: (name) => name === 'situation' || name === 'situationRecord',
});

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every value of this tag anywhere inside `node`, in document order. */
function collect(node: unknown, tag: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, tag, out);
  } else if (isNode(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === tag) out.push(value);
      collect(value, tag, out);
    }
  }
  return out;
}

const firstText = (node: unknown, tag: string): string | undefined => {
  for (const value of collect(node, tag)) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
};

/** "lat lon lat lon…" (the feed says EPSG:4326, and its numbers are latitude first) as points. A broken list gives no points. */
export function parsePosList(text: string): ClosurePoint[] {
  const numbers = text.trim().split(/\s+/).map(Number);
  if (numbers.length < 2 || numbers.length % 2 !== 0 || numbers.some((n) => !Number.isFinite(n))) {
    return [];
  }
  const points: ClosurePoint[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    const lat = numbers[i];
    const lon = numbers[i + 1];
    if (lat === undefined || lon === undefined) return [];
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return [];
    points.push({ lat, lon });
  }
  return points;
}

function toStatus(raw: string | undefined): ClosureStatus {
  if (raw === 'active') return 'active';
  if (raw === 'suspended') return 'suspended';
  return 'planned';
}

function toDate(raw: string | undefined): Date | undefined {
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toClosure(situationId: string, record: Node): Closure | undefined {
  const id = firstText(record, 'idG');
  const startsAt = toDate(firstText(record, 'overallStartTime'));
  const endsAt = toDate(firstText(record, 'overallEndTime'));
  const updatedAt = toDate(firstText(record, 'situationRecordVersionTime'));
  // Without a window a driver cannot be told how long it lasts, and a route cannot tell whether it applies.
  if (id === undefined || startsAt === undefined || endsAt === undefined || endsAt <= startsAt) {
    return undefined;
  }

  const lanesClosed = collect(record, 'lanesStatus').filter((v) => v === 'closed').length;
  const managementType = firstText(record.roadOrCarriagewayOrLaneManagementType ?? {}, 'value');
  const kind: ClosureKind | undefined =
    managementType === 'carriagewayClosures' ? 'full' : lanesClosed > 0 ? 'lane' : undefined;
  if (kind === undefined) return undefined;

  const lines = collect(record, 'posList')
    .filter((v): v is string => typeof v === 'string')
    .map(parsePosList)
    // One point is not a line, and the database would refuse it.
    .filter((line) => line.length >= 2);
  const firstLine = lines[0];
  const position = firstLine === undefined ? undefined : middleOf(firstLine);
  if (position === undefined) return undefined;

  const closure: Closure = {
    id,
    situationId,
    kind,
    status: toStatus(firstText(record, 'validityStatus')),
    road: firstText(record, 'roadName'),
    direction: firstText(record, 'directionOnLinearSection'),
    description: firstText(record, 'comment') ?? 'Closure',
    locationText: firstText(record, 'locationDescription'),
    // The most specific reason the feed gives: "roadsideWork" over "roadMaintenance".
    cause:
      firstText(record, 'roadMaintenanceType') ??
      firstText(record, 'constructionWorkType') ??
      firstText(record, 'causeType'),
    startsAt,
    endsAt,
    lanesClosed,
    position,
    lines,
    updatedAt: updatedAt ?? startsAt,
  };
  return isWorthKeeping(closure) ? closure : undefined;
}

/** Throws if the text is not a closures feed at all. A record that cannot be read is left out, not an error for the rest. */
export function parseClosuresFeed(xml: string): Closure[] {
  const parsed: unknown = parser.parse(xml);
  const payload = isNode(parsed) ? parsed.D2Payload : undefined;
  if (!isNode(payload)) throw new Error('not a DATEX II payload');
  const situations = payload.situation;
  if (situations === undefined) return [];
  if (!Array.isArray(situations)) throw new Error('unexpected situation list');

  const closures: Closure[] = [];
  for (const situation of situations) {
    if (!isNode(situation)) continue;
    const situationId = firstText({ idG: situation.idG }, 'idG') ?? 'unknown';
    const records = Array.isArray(situation.situationRecord) ? situation.situationRecord : [];
    for (const wrapper of records) {
      if (!isNode(wrapper)) continue;
      // Each record is wrapped in an element named for its type (sitRoadOrCarriagewayOrLaneManagement, sitSpeedManagement…).
      for (const record of Object.values(wrapper)) {
        if (!isNode(record)) continue;
        const closure = toClosure(situationId, record);
        if (closure !== undefined) closures.push(closure);
      }
    }
  }
  return closures;
}
