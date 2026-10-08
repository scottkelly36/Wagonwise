import type { JobReportRowDto } from '@wagonwise/contracts/jobs';
import { describe, expect, it } from 'vitest';
import {
  csvCell,
  csvFileName,
  customRange,
  dateTimeText,
  presetRange,
  statusText,
  toCsv,
} from './job-report';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('presetRange', () => {
  const now = local(2026, 10, 15, 14, 30);

  it('last 7 days is today and the six before, whole days', () => {
    expect(presetRange('last7', now)).toEqual({
      from: local(2026, 10, 9),
      to: local(2026, 10, 16),
    });
  });

  it('last 30 days', () => {
    expect(presetRange('last30', now)).toEqual({
      from: local(2026, 9, 16),
      to: local(2026, 10, 16),
    });
  });

  it('this month and last month, across a year boundary', () => {
    expect(presetRange('thisMonth', now)).toEqual({
      from: local(2026, 10, 1),
      to: local(2026, 11, 1),
    });
    expect(presetRange('lastMonth', now)).toEqual({
      from: local(2026, 9, 1),
      to: local(2026, 10, 1),
    });
    expect(presetRange('lastMonth', local(2026, 1, 5))).toEqual({
      from: local(2025, 12, 1),
      to: local(2026, 1, 1),
    });
  });
});

describe('customRange', () => {
  it('includes both days', () => {
    expect(customRange('2026-10-01', '2026-10-31')).toEqual({
      from: local(2026, 10, 1),
      to: local(2026, 11, 1),
    });
    expect(customRange('2026-10-05', '2026-10-05')).toEqual({
      from: local(2026, 10, 5),
      to: local(2026, 10, 6),
    });
  });

  it('is undefined for a missing, malformed or backwards range', () => {
    expect(customRange('', '2026-10-05')).toBeUndefined();
    expect(customRange('2026-10-05', '')).toBeUndefined();
    expect(customRange('5 Oct', '2026-10-05')).toBeUndefined();
    expect(customRange('2026-10-06', '2026-10-05')).toBeUndefined();
  });
});

describe('csvCell', () => {
  it('leaves plain text alone and quotes commas, quotes and line breaks', () => {
    expect(csvCell('Hexham depot')).toBe('Hexham depot');
    expect(csvCell('Unit 4, Quay Road')).toBe('"Unit 4, Quay Road"');
    expect(csvCell('the "big" one')).toBe('"the ""big"" one"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses a cell a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://bad")')).toBe('"\'=HYPERLINK(""http://bad"")"');
    expect(csvCell('+44 7700 900000')).toBe("'+44 7700 900000");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('toCsv', () => {
  const row: JobReportRowDto = {
    jobId: 'j1',
    reference: 'WW-1',
    status: 'at_pickup',
    pickup: 'Depot, Hexham',
    delivery: 'Port',
    driver: 'pat@example.com',
    vehicle: 'Big Wagon',
    createdAt: local(2026, 10, 5, 7, 0).toISOString(),
    deliveredAt: local(2026, 10, 5, 12, 30).toISOString(),
    minutesAcceptedToDelivered: 270.4,
    onTime: false,
    requiresProofOfDelivery: true,
    hasProofOfDelivery: false,
  };

  it('starts with a byte-order mark and a header, one line per job, CRLF line ends', () => {
    const lines = toCsv([row]).split('\r\n');
    expect(lines[0]?.startsWith('﻿Reference,Status,Pickup,')).toBe(true);
    expect(lines).toHaveLength(3); // header, one row, trailing empty
    expect(lines[2]).toBe('');
  });

  it('writes the row readably: status as words, local times, whole minutes, Yes and No', () => {
    const line = toCsv([row]).split('\r\n')[1];
    expect(line).toBe(
      'WW-1,At pickup,"Depot, Hexham",Port,pat@example.com,Big Wagon,2026-10-05 07:00,,,,2026-10-05 12:30,,270,No,Yes,No',
    );
  });

  it('is just the header for no rows', () => {
    expect(toCsv([]).split('\r\n')).toHaveLength(2);
  });
});

describe('small helpers', () => {
  it('statusText', () => {
    expect(statusText('en_route')).toBe('En route');
    expect(statusText('delivered')).toBe('Delivered');
  });

  it('dateTimeText copes with nothing and with nonsense', () => {
    expect(dateTimeText(undefined)).toBe('');
    expect(dateTimeText('not a date')).toBe('');
  });

  it('csvFileName names the days included', () => {
    expect(csvFileName({ from: local(2026, 10, 1), to: local(2026, 11, 1) })).toBe(
      'wagonwise-jobs-2026-10-01-to-2026-10-31.csv',
    );
  });
});
