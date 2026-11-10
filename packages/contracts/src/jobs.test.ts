import { describe, expect, it } from 'vitest';
import {
  advanceJobStatusRequestSchema,
  assignJobRequestSchema,
  attachProofOfDeliveryRequestSchema,
  attachSignatureRequestSchema,
  createJobRequestSchema,
  currentJobResponseSchema,
  failJobRequestSchema,
  jobSchema,
  proofOfDeliveryResponseSchema,
  signatureResponseSchema,
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

describe('the delivery signature', () => {
  const line = [
    [10, 20],
    [300, 200],
  ];

  it('accepts strokes inside the box, trims the name, and leaves it optional', () => {
    expect(attachSignatureRequestSchema.parse({ strokes: [line] })).toEqual({ strokes: [line] });
    expect(
      attachSignatureRequestSchema.parse({ strokes: [line], signerName: '  A. Receiver ' }),
    ).toMatchObject({ signerName: 'A. Receiver' });
  });

  it('refuses nothing drawn, points outside the box, fractions, and a name over 80 characters', () => {
    const bad = (body: object) => attachSignatureRequestSchema.safeParse(body).success;
    expect(bad({ strokes: [] })).toBe(false);
    expect(bad({ strokes: [[]] })).toBe(false);
    expect(bad({ strokes: [[[1001, 5]]] })).toBe(false);
    expect(bad({ strokes: [[[5, 501]]] })).toBe(false);
    expect(bad({ strokes: [[[-1, 5]]] })).toBe(false);
    expect(bad({ strokes: [[[1.5, 5]]] })).toBe(false);
    expect(bad({ strokes: [line], signerName: 'x'.repeat(81) })).toBe(false);
  });

  it('caps the strokes, the points in one stroke and the points in all', () => {
    const point = [5, 5];
    const stroke = (n: number) => Array.from({ length: n }, () => point);
    const bad = (strokes: unknown) => attachSignatureRequestSchema.safeParse({ strokes }).success;
    expect(bad(Array.from({ length: 60 }, () => stroke(2)))).toBe(true);
    expect(bad(Array.from({ length: 61 }, () => stroke(2)))).toBe(false);
    expect(bad([stroke(400)])).toBe(true);
    expect(bad([stroke(401)])).toBe(false);
    expect(bad(Array.from({ length: 6 }, () => stroke(400)))).toBe(false);
    expect(bad(Array.from({ length: 5 }, () => stroke(400)))).toBe(true);
  });

  it('is described to the portal with when it was taken', () => {
    expect(
      signatureResponseSchema.parse({ strokes: [line], capturedAt: '2026-10-08T08:36:00.000Z' }),
    ).toMatchObject({ strokes: [line] });
    expect(() =>
      signatureResponseSchema.parse({ strokes: [line], capturedAt: 'yesterday' }),
    ).toThrow();
  });

  it('defaults the new job fields for a server that predates signatures', () => {
    const parsed = jobSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      reference: 'JOB-1',
      stops: [pickup, delivery],
      status: 'draft',
      timeline: [{ status: 'draft', at: '2026-10-08T08:00:00.000Z' }],
      requiresProofOfDelivery: false,
      hasProofOfDelivery: false,
    });
    expect(parsed).toMatchObject({
      requiresSignature: false,
      hasSignature: false,
      signatureStops: [],
    });
  });
});
