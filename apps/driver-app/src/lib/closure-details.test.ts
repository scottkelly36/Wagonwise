import {
  causeText,
  closureTitle,
  directionText,
  dayTimeText,
  durationText,
  isBritishSummerTime,
  LONG_WINDOW_NOTE,
  shutText,
  statusLabel,
  timingLines,
  windowNote,
} from './closure-details';

describe('dayTimeText', () => {
  it('shows UK time: GMT in winter, an hour on in British Summer Time', () => {
    expect(dayTimeText('2026-11-01T22:00:00Z')).toBe('Sun 1 Nov, 22:00');
    expect(dayTimeText('2026-07-15T22:30:00Z')).toBe('Wed 15 Jul, 23:30');
    // Past midnight in summer is the next day.
    expect(dayTimeText('2026-07-15T23:30:00Z')).toBe('Thu 16 Jul, 00:30');
  });

  it('puts the clock changes on the last Sundays of March and October, at 01:00 UTC', () => {
    expect(isBritishSummerTime(new Date('2026-03-29T00:59:00Z'))).toBe(false);
    expect(isBritishSummerTime(new Date('2026-03-29T01:00:00Z'))).toBe(true);
    expect(isBritishSummerTime(new Date('2026-10-25T00:59:00Z'))).toBe(true);
    expect(isBritishSummerTime(new Date('2026-10-25T01:00:00Z'))).toBe(false);
    expect(dayTimeText('2026-10-25T00:30:00Z')).toBe('Sun 25 Oct, 01:30');
  });
});

describe('durationText', () => {
  const h = 60 * 60 * 1000;
  it('is rough, in the units a driver thinks in', () => {
    expect(durationText(0, 20 * 60_000)).toBe('under an hour');
    expect(durationText(0, h)).toBe('1 hour');
    expect(durationText(0, 8 * h)).toBe('8 hours');
    expect(durationText(0, 47 * h)).toBe('47 hours');
    expect(durationText(0, 72 * h)).toBe('3 days');
    expect(durationText(10 * h, 0)).toBe('under an hour');
  });
});

describe('directionText and causeText', () => {
  it('reads the feed words as a driver would', () => {
    expect(directionText('eastBound')).toBe('Eastbound');
    expect(directionText('northBound')).toBe('Northbound');
    expect(directionText('inboundTowardsTown')).toBe('Inbound towards town');
    expect(directionText(undefined)).toBeUndefined();
    expect(causeText('maintenanceWork')).toBe('Maintenance work');
    expect(causeText('treeAndVegetationCuttingWork')).toBe('Tree and vegetation cutting');
    expect(causeText('somethingNew')).toBe('Something new');
    expect(causeText('other')).toBeUndefined();
    expect(causeText(undefined)).toBeUndefined();
  });
});

describe('titles and what is shut', () => {
  it('names the road and the kind of closure', () => {
    expect(closureTitle({ kind: 'full', road: 'M56' })).toBe('M56 closure');
    expect(closureTitle({ kind: 'lane', road: 'A1(M)' })).toBe('A1(M) lane closure');
    expect(closureTitle({ kind: 'full', road: undefined })).toBe('Closure');
    expect(closureTitle({ kind: 'lane', road: undefined })).toBe('Lane closure');
  });

  it('says what is shut', () => {
    expect(shutText({ kind: 'full', lanesClosed: 0 })).toBe('Road closed to all traffic');
    expect(shutText({ kind: 'lane', lanesClosed: 1 })).toBe('1 lane closed');
    expect(shutText({ kind: 'lane', lanesClosed: 3 })).toBe('3 lanes closed');
    expect(shutText({ kind: 'lane', lanesClosed: 0 })).toBe('Lanes closed');
  });
});

describe('timing', () => {
  const night = { startsAt: '2026-11-01T22:00:00Z', endsAt: '2026-11-02T06:00:00Z' };

  it('for one in force: until when and how long is left', () => {
    const now = new Date('2026-11-02T01:00:00Z');
    expect(statusLabel({ status: 'active' })).toBe('In force now');
    expect(timingLines({ status: 'active', ...night }, now)).toEqual([
      'Until Mon 2 Nov, 06:00',
      'About 5 hours left',
    ]);
  });

  it('for a planned one: when it starts, when it ends and how long it lasts', () => {
    const now = new Date('2026-11-01T15:00:00Z');
    expect(statusLabel({ status: 'planned' })).toBe('Planned');
    expect(timingLines({ status: 'planned', ...night }, now)).toEqual([
      'Starts Sun 1 Nov, 22:00',
      'Until Mon 2 Nov, 06:00',
      'Lasts 8 hours',
    ]);
  });

  it('does not say a planned closure "starts" in the past, nor give time left that has gone', () => {
    const late = new Date('2026-11-02T08:00:00Z');
    expect(timingLines({ status: 'planned', ...night }, late)[0]).toBe(
      'Planned from Sun 1 Nov, 22:00',
    );
    expect(timingLines({ status: 'active', ...night }, late)).toEqual(['Until Mon 2 Nov, 06:00']);
  });

  it('warns that a long window is not a long closure, and says nothing for an ordinary one', () => {
    expect(windowNote(night)).toBeUndefined();
    expect(windowNote({ startsAt: '2026-10-30T20:48:00Z', endsAt: '2026-11-02T06:00:00Z' })).toBe(
      LONG_WINDOW_NOTE,
    );
    expect(
      windowNote({ startsAt: '2026-10-30T22:00:00Z', endsAt: '2026-11-01T22:00:00Z' }),
    ).toBeUndefined();
  });
});
