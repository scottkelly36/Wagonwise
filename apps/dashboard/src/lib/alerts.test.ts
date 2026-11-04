import { describe, expect, it } from 'vitest';
import { alertsFrom } from './alerts';
import type { Tile } from './home';

const tile = (key: string, value: number, tone: Tile['tone'], sub = ''): Tile => ({
  key,
  label: key,
  value: String(value),
  sub,
  tone,
  area: 'ops',
  to: `/fleet/${key}`,
});

describe('alertsFrom', () => {
  it('leaves quiet tiles out', () => {
    expect(
      alertsFrom([tile('unassigned', 0, 'quiet'), tile('maintenance', 0, 'quiet')], []),
    ).toEqual([]);
  });

  it('words each tile for the bell, singular and plural', () => {
    const alerts = alertsFrom(
      [tile('unassigned', 1, 'warn', '1 due today'), tile('maintenance', 3, 'warn')],
      [],
    );
    expect(alerts.map((a) => a.title)).toEqual([
      '1 job without a driver',
      '3 maintenance items overdue',
    ]);
    expect(alerts[0]).toMatchObject({ detail: '1 due today', to: '/fleet/unassigned' });
  });

  it('puts red alerts first, with low driving hours', () => {
    const alerts = alertsFrom(
      [tile('unassigned', 2, 'warn'), tile('do-not-drive', 1, 'bad', 'Truck 4, brakes')],
      ['Sam: 10 min of driving left'],
    );
    expect(alerts.map((a) => [a.title, a.tone])).toEqual([
      ['1 vehicle marked do not drive', 'bad'],
      ['Driving hours running low', 'bad'],
      ['2 jobs without a driver', 'warn'],
    ]);
  });

  it('skips a tile it has no wording for', () => {
    expect(alertsFrom([tile('something-new', 4, 'warn')], [])).toEqual([]);
  });
});
