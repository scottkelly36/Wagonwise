import { describe, expect, it } from 'vitest';
import {
  advanceJobStatusRequestSchema,
  assignJobRequestSchema,
  attachProofOfDeliveryRequestSchema,
  createJobRequestSchema,
  currentJobResponseSchema,
  failJobRequestSchema,
  jobSchema,
  proofOfDeliveryResponseSchema,
} from './jobs.js';

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

  it('accepts optional plannedStart, dueBy, requiresProofOfDelivery and stop windows/notes', () => {
    const result = createJobRequestSchema.safeParse({
      companyId: 'company-1',
      reference: 'JOB-1',
      stops: [
        { ...pickup, windowFrom: '2026-10-02T08:00:00.000Z', notes: 'ring the buzzer' },
        { ...delivery, windowTo: '2026-10-02T17:00:00.000Z' },
      ],
      plannedStart: '2026-10-02T07:00:00.000Z',
      dueBy: '2026-10-02T18:00:00.000Z',
      requiresProofOfDelivery: true,
    });
    expect(result.success).toBe(true);
  });
});

const job = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: 'company-1',
  reference: 'JOB-1',
  stops: [pickup, delivery],
  status: 'draft' as const,
  timeline: [{ status: 'draft' as const, at: '2026-10-01T09:00:00.000Z' }],
  requiresProofOfDelivery: false,
  hasProofOfDelivery: false,
};

describe('jobSchema', () => {
  it('parses a real response shape', () => {
    expect(jobSchema.safeParse(job).success).toBe(true);
  });

  it('requires requiresProofOfDelivery and hasProofOfDelivery', () => {
    const { requiresProofOfDelivery: _r, ...withoutRequires } = job;
    expect(jobSchema.safeParse(withoutRequires).success).toBe(false);
    const { hasProofOfDelivery: _h, ...withoutHas } = job;
    expect(jobSchema.safeParse(withoutHas).success).toBe(false);
  });
});

describe('currentJobResponseSchema', () => {
  it('accepts a real job or null', () => {
    expect(currentJobResponseSchema.safeParse({ job: null }).success).toBe(true);
    expect(currentJobResponseSchema.safeParse({ job }).success).toBe(true);
  });
});

describe('attachProofOfDeliveryRequestSchema', () => {
  it('accepts a content type and base64 data', () => {
    expect(
      attachProofOfDeliveryRequestSchema.safeParse({
        contentType: 'image/jpeg',
        dataBase64: Buffer.from('a photo').toString('base64'),
      }).success,
    ).toBe(true);
  });

  it('rejects a blank content type or non-base64 data', () => {
    expect(
      attachProofOfDeliveryRequestSchema.safeParse({ contentType: '', dataBase64: 'YQ==' }).success,
    ).toBe(false);
    expect(
      attachProofOfDeliveryRequestSchema.safeParse({
        contentType: 'image/jpeg',
        dataBase64: 'not base64!!',
      }).success,
    ).toBe(false);
  });
});

describe('dispatch request schemas', () => {
  it('accepts an assign request, a one-step status request with an optional position, and a bare fail', () => {
    expect(assignJobRequestSchema.safeParse({ driverId: 'd1', vehicleId: 'v1' }).success).toBe(
      true,
    );
    expect(
      advanceJobStatusRequestSchema.safeParse({
        status: 'loaded',
        position: { lat: 54.9, lon: -2.1 },
      }).success,
    ).toBe(true);
    expect(failJobRequestSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an unknown status and a blank driver', () => {
    expect(advanceJobStatusRequestSchema.safeParse({ status: 'flying' }).success).toBe(false);
    expect(assignJobRequestSchema.safeParse({ driverId: '', vehicleId: 'v1' }).success).toBe(false);
  });
});

describe('proof-of-delivery content types', () => {
  const dataBase64 = Buffer.from('a photo').toString('base64');

  it('accepts only image types, so a data: URL built from one can’t be a web page', () => {
    for (const contentType of ['text/html', 'application/javascript', 'image/', 'image/jpeg;x=1']) {
      expect(
        attachProofOfDeliveryRequestSchema.safeParse({ contentType, dataBase64 }).success,
      ).toBe(false);
    }
    for (const contentType of ['image/jpeg', 'image/png', 'image/heic', 'image/svg+xml']) {
      expect(
        attachProofOfDeliveryRequestSchema.safeParse({ contentType, dataBase64 }).success,
      ).toBe(true);
    }
  });

  it('applies the same rule to the response the dashboard receives', () => {
    const capturedAt = '2026-10-03T10:00:00.000Z';
    expect(
      proofOfDeliveryResponseSchema.safeParse({ contentType: 'image/jpeg', dataBase64, capturedAt })
        .success,
    ).toBe(true);
    expect(
      proofOfDeliveryResponseSchema.safeParse({ contentType: 'text/html', dataBase64, capturedAt })
        .success,
    ).toBe(false);
  });
});
