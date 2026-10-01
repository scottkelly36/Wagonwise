import { describe, expect, it } from 'vitest';
import { createJobRequestSchema, jobSchema } from './jobs.js';

const pickup = {
  kind: 'pickup' as const,
  name: 'Hexham depot',
  location: { lat: 54.97, lon: -2.1 },
};
const delivery = {
  kind: 'delivery' as const,
  name: 'Newcastle port',
  location: { lat: 54.97, lon: -1.6 },
};

describe('createJobRequestSchema', () => {
  it('requires companyId, reference and at least one stop, no id field', () => {
    const result = createJobRequestSchema.safeParse({
      companyId: 'company-1',
      reference: 'JOB-1',
      stops: [pickup, delivery],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a blank reference', () => {
    expect(
      createJobRequestSchema.safeParse({
        companyId: 'company-1',
        reference: '',
        stops: [pickup, delivery],
      }).success,
    ).toBe(false);
  });

  it('rejects no stops', () => {
    expect(
      createJobRequestSchema.safeParse({
        companyId: 'company-1',
        reference: 'JOB-1',
        stops: [],
      }).success,
    ).toBe(false);
  });

  it('accepts optional plannedStart, dueBy and stop windows/notes', () => {
    const result = createJobRequestSchema.safeParse({
      companyId: 'company-1',
      reference: 'JOB-1',
      stops: [
        { ...pickup, windowFrom: '2026-10-02T08:00:00.000Z', notes: 'ring the buzzer' },
        { ...delivery, windowTo: '2026-10-02T17:00:00.000Z' },
      ],
      plannedStart: '2026-10-02T07:00:00.000Z',
      dueBy: '2026-10-02T18:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('jobSchema', () => {
  it('parses a real response shape', () => {
    const result = jobSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: 'company-1',
      reference: 'JOB-1',
      stops: [pickup, delivery],
      status: 'draft',
      timeline: [{ status: 'draft', at: '2026-10-01T09:00:00.000Z' }],
    });
    expect(result.success).toBe(true);
  });
});
