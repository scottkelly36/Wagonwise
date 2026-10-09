import type { DefectDto } from '@wagonwise/contracts/checks';
import type { FinanceReportDto, InvoiceDto } from '@wagonwise/contracts/billing';
import type { FleetVehicleDto } from '@wagonwise/contracts/fleet';
import type { JobDto, JobEtaDto, JobNoticeDto } from '@wagonwise/contracts/jobs';
import type { OverviewRowDto, RepairDto } from '@wagonwise/contracts/maintenance';
import { describe, expect, it } from 'vitest';
import {
  chartMonths,
  complianceRows,
  localDay,
  lowOnHours,
  managerTiles,
  onTheRoad,
  platformRows,
  platformTiles,
} from './home';

const now = new Date(2026, 9, 9, 12, 0, 0);
const as = <T>(x: unknown): T => x as T;

const job = (over: Record<string, unknown>): JobDto =>
  as<JobDto>({ id: 'j1', reference: 'JOB-1', status: 'draft', stops: [], currentStop: 0, ...over });

describe('managerTiles', () => {
  it('counts unassigned jobs and those due today, and is quiet at zero', () => {
    const due = new Date(2026, 9, 9, 17, 0, 0).toISOString();
    const tiles = managerTiles(
      {
        jobs: [
          job({ id: 'a', dueBy: due }),
          job({ id: 'b' }),
          job({ id: 'c', status: 'assigned' }),
        ],
      },
      now,
    );
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      key: 'unassigned',
      value: '2',
      sub: '1 due today',
      tone: 'warn',
    });
    expect(managerTiles({ jobs: [] }, now)[0]).toMatchObject({ value: '0', tone: 'quiet' });
  });

  it('counts assigned jobs the driver has not opened, with the longest wait', () => {
    const t = new Date(2026, 9, 9, 11, 25, 0).toISOString();
    const notices = [
      as<JobNoticeDto>({ seenAt: null, lastAttemptAt: t }),
      as<JobNoticeDto>({ seenAt: '2026-10-09T10:00:00.000Z', lastAttemptAt: t }),
    ];
    const tile = managerTiles({ jobs: [], notices }, now).find((x) => x.key === 'not-opened');
    expect(tile).toMatchObject({ value: '1', tone: 'warn' });
    expect(tile?.sub).toMatch(/Longest waiting/);
  });

  it('shows do-not-drive defects not fixed, red, naming the vehicle', () => {
    const defects = [
      as<DefectDto>({
        severity: 'do_not_drive',
        status: 'open',
        vehicleName: 'Big Wagon',
        label: 'Tyres',
      }),
      as<DefectDto>({
        severity: 'do_not_drive',
        status: 'fixed',
        vehicleName: 'Old',
        label: 'Brakes',
      }),
      as<DefectDto>({ severity: 'advisory', status: 'open', vehicleName: 'Van', label: 'Wipers' }),
    ];
    const tile = managerTiles({ jobs: [], defects }, now).find((x) => x.key === 'do-not-drive');
    expect(tile).toMatchObject({ value: '1', tone: 'bad', sub: 'Big Wagon, tyres' });
  });

  it('counts maintenance overdue and due soon, and leaves a tile out when its data is not given', () => {
    const overview = [
      as<OverviewRowDto>({ status: 'overdue' }),
      as<OverviewRowDto>({ status: 'overdue' }),
      as<OverviewRowDto>({ status: 'due_soon' }),
      as<OverviewRowDto>({ status: 'ok' }),
    ];
    const tiles = managerTiles({ jobs: [], overview }, now);
    expect(tiles.find((x) => x.key === 'maintenance')).toMatchObject({
      value: '2',
      sub: '1 more due soon',
    });
    expect(tiles.map((x) => x.key)).toEqual(['unassigned', 'maintenance']);
  });
});

describe('onTheRoad', () => {
  it('lists jobs being driven, flags the late one and says by how much', () => {
    const rows = onTheRoad({
      jobs: [
        job({
          id: 'a',
          reference: 'A',
          status: 'en_route',
          driverId: 'd1',
          vehicleId: 'v1',
          dueBy: new Date(2026, 9, 9, 14, 0).toISOString(),
        }),
        job({
          id: 'b',
          reference: 'B',
          status: 'en_route',
          driverId: 'd2',
          dueBy: new Date(2026, 9, 9, 18, 0).toISOString(),
        }),
        job({ id: 'c', reference: 'C', status: 'assigned' }),
      ],
      etas: [
        as<JobEtaDto>({
          jobId: 'a',
          durationMin: 150,
          fromRecordedAt: new Date(2026, 9, 9, 12, 0).toISOString(),
        }),
        as<JobEtaDto>({
          jobId: 'b',
          durationMin: 60,
          fromRecordedAt: new Date(2026, 9, 9, 12, 0).toISOString(),
        }),
      ],
      driverName: (id) => (id === 'd1' ? 'Sam' : undefined),
      vehicleName: (id) => (id === 'v1' ? 'Big Wagon' : undefined),
      now,
    });
    expect(rows.map((r) => r.reference)).toEqual(['A', 'B']);
    expect(rows[0]).toMatchObject({ who: 'Sam, Big Wagon', late: true, lateBy: '30 min' });
    expect(rows[1]).toMatchObject({ who: 'Driver and vehicle unknown', late: false });
  });

  it('says there is no ETA yet when none is known', () => {
    const rows = onTheRoad({
      jobs: [job({ status: 'loaded' })],
      etas: [],
      driverName: () => undefined,
      vehicleName: () => undefined,
      now,
    });
    expect(rows[0]).toMatchObject({ eta: 'No ETA yet', late: false });
  });
});

describe('lowOnHours', () => {
  it('names sharing drivers with under half an hour left, but not those on a break', () => {
    const statuses = [
      { driverId: 'd1', state: 'driving', drivingLeftMin: 20, next: 'break', updatedAt: '' },
      { driverId: 'd2', state: 'on_break', drivingLeftMin: 10, next: 'break', updatedAt: '' },
      { driverId: 'd3', state: 'driving', drivingLeftMin: 90, next: 'break', updatedAt: '' },
    ] as never;
    expect(lowOnHours(statuses, (id) => (id === 'd1' ? 'Kim' : undefined))).toEqual([
      'Kim: 20m of driving left',
    ]);
  });
});

describe('complianceRows', () => {
  it('works out today’s checks against the fleet, and only shows what it is given', () => {
    const vehicles = [
      as<FleetVehicleDto>({ id: 'v1' }),
      as<FleetVehicleDto>({ id: 'v2' }),
      as<FleetVehicleDto>({ id: 'v3' }),
      as<FleetVehicleDto>({ id: 'v4' }),
    ];
    const { rows, checksShare } = complianceRows({
      vehicles,
      checksToday: [{ vehicleId: 'v1' }, { vehicleId: 'v1' }, { vehicleId: 'v2' }],
      defects: [as<DefectDto>({ status: 'open' }), as<DefectDto>({ status: 'fixed' })],
      repairs: [as<RepairDto>({ overdue: true }), as<RepairDto>({ overdue: false })],
      capacity: { vehiclesInUse: 4, capacityToday: 5 },
      joinRequests: 2,
    });
    expect(checksShare).toBe(0.5);
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Walk-round checks done today', '2 of 4'],
      ['Open defects', '1'],
      ['Repairs overdue', '1'],
      ['Vehicles on your plan', '4 of 5'],
      ['Driver requests', '2 to approve'],
    ]);
    expect(complianceRows({}).rows).toEqual([]);
  });

  it('is red when the fleet is over its plan, and good when every check is done', () => {
    const over = complianceRows({ capacity: { vehiclesInUse: 6, capacityToday: 5 } }).rows[0];
    expect(over?.tone).toBe('bad');
    const done = complianceRows({
      vehicles: [as<FleetVehicleDto>({ id: 'v1' })],
      checksToday: [{ vehicleId: 'v1' }],
    }).rows[0];
    expect(done?.tone).toBe('good');
  });
});

const finance = as<FinanceReportDto>({
  currentMonth: '2026-10',
  months: [
    {
      month: '2026-08',
      invoicedPence: 50_000,
      receivedPence: 0,
      costsPence: 20_000,
      profitInvoicedPence: 30_000,
      profitReceivedPence: 0,
    },
    {
      month: '2026-09',
      invoicedPence: 60_000,
      receivedPence: 0,
      costsPence: 25_000,
      profitInvoicedPence: 35_000,
      profitReceivedPence: 0,
    },
    {
      month: '2026-10',
      invoicedPence: 74_000,
      receivedPence: 0,
      costsPence: 31_000,
      profitInvoicedPence: 43_000,
      profitReceivedPence: 0,
    },
  ],
  revenueByCompany: [{}, {}],
  projection: { vehiclesCovered: 74 },
});

describe('platform home', () => {
  const invoices = [
    as<InvoiceDto>({ status: 'draft' }),
    as<InvoiceDto>({ status: 'draft' }),
    as<InvoiceDto>({ status: 'issued' }),
    as<InvoiceDto>({ status: 'paid' }),
  ];

  it('shows this month’s money, profit, and the drafts waiting', () => {
    const tiles = platformTiles({ finance, invoices });
    expect(tiles.map((t) => [t.key, t.value])).toEqual([
      ['revenue', '£740'],
      ['costs', '£310'],
      ['profit', '£430'],
      ['drafts', '2'],
    ]);
    expect(tiles[0]?.sub).toBe('74 vehicles, 2 companies');
    expect(tiles[2]?.tone).toBe('good');
  });

  it('turns the profit red when costs are above income', () => {
    const loss = as<FinanceReportDto>({
      ...finance,
      months: [
        {
          month: '2026-10',
          invoicedPence: 1_000,
          receivedPence: 0,
          costsPence: 5_000,
          profitInvoicedPence: -4_000,
          profitReceivedPence: 0,
        },
      ],
    });
    const tile = platformTiles({ finance: loss, invoices: [] }).find((t) => t.key === 'profit');
    expect(tile).toMatchObject({ value: '-£40', tone: 'bad' });
  });

  it('scales the chart bars to the largest figure, and counts what needs action', () => {
    const chart = chartMonths(finance, 3);
    expect(chart.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(chart[2]?.revenue).toBe(1);
    expect(chart[0]?.costs).toBeCloseTo(20 / 74);
    expect(platformRows({ moderationQueue: 5, invoices }).map((r) => r.value)).toEqual(['5', '1']);
  });
});

describe('localDay', () => {
  it('writes the viewer’s day', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
