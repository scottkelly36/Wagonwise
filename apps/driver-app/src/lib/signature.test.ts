import { attachSignatureRequestSchema } from '@wagonwise/contracts/jobs';

import {
  SIGNATURE_STATUS_MESSAGES,
  isDeliveryBlockedBySignature,
  prepareSignature,
  segmentsFor,
  signatureStatus,
} from './signature';

const PAD = { width: 500, height: 250 };

/** A zig-zag across the pad, plenty of points. */
function scribble(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    x: (i * 7) % 500,
    y: i % 2 === 0 ? 40 : 160,
  }));
}

describe('prepareSignature', () => {
  it('scales the pad into the 1000 x 500 box and keeps a trimmed name', () => {
    const request = prepareSignature(
      [
        [
          { x: 0, y: 0 },
          { x: 250, y: 100 },
          { x: 500, y: 200 },
        ],
      ],
      PAD,
      '  A. Receiver ',
    );
    expect(request).toEqual({
      signerName: 'A. Receiver',
      strokes: [
        [
          [0, 0],
          [500, 200],
          [1000, 400],
        ],
      ],
    });
  });

  it('leaves the name out when it is blank', () => {
    const request = prepareSignature(
      [
        [
          { x: 0, y: 0 },
          { x: 100, y: 50 },
          { x: 300, y: 20 },
        ],
      ],
      PAD,
      '   ',
    );
    expect(request).not.toHaveProperty('signerName');
  });

  it('keeps points inside the box when a finger slides off the pad', () => {
    const request = prepareSignature(
      [
        [
          { x: -30, y: -5 },
          { x: 250, y: 100 },
          { x: 900, y: 500 },
        ],
      ],
      PAD,
      '',
    );
    expect(request?.strokes[0]?.[0]).toEqual([0, 0]);
    expect(request?.strokes[0]?.at(-1)).toEqual([1000, 500]);
  });

  it('sends nothing for no marks, a lone dot, or a pad that has not been measured', () => {
    expect(prepareSignature([], PAD, '')).toBeUndefined();
    expect(prepareSignature([[{ x: 5, y: 5 }]], PAD, '')).toBeUndefined();
    expect(
      prepareSignature(
        [
          [
            { x: 0, y: 0 },
            { x: 100, y: 50 },
            { x: 300, y: 20 },
          ],
        ],
        { width: 0, height: 0 },
        '',
      ),
    ).toBeUndefined();
  });

  it('drops points that barely moved, but keeps the last one', () => {
    const request = prepareSignature(
      [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 100, y: 40 },
          { x: 101, y: 40 },
        ],
      ],
      PAD,
      '',
    );
    expect(request?.strokes[0]).toEqual([
      [0, 0],
      [4, 0],
      [200, 80],
      [202, 80],
    ]);
  });

  it('always makes a request the contract accepts, however long or busy the drawing', () => {
    const many = Array.from({ length: 80 }, () => scribble(900));
    const request = prepareSignature(many, PAD, 'x'.repeat(200));
    expect(request).toBeDefined();
    expect(attachSignatureRequestSchema.safeParse(request).success).toBe(true);
    expect(request?.strokes.length).toBeLessThanOrEqual(60);
    expect(request?.signerName?.length).toBeLessThanOrEqual(80);
  });
});

describe('segmentsFor', () => {
  it('makes one piece between each pair of points, with its middle, length and angle', () => {
    const [segment, ...rest] = segmentsFor([
      [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ],
    ]);
    expect(rest).toEqual([]);
    expect(segment).toMatchObject({ cx: 15, cy: 20, length: 50 });
    expect(segment?.angle).toBeCloseTo(53.13, 1);
  });

  it('makes no pieces for a lone point or for a stroke with nothing in it', () => {
    expect(segmentsFor([[{ x: 1, y: 1 }], []])).toEqual([]);
  });
});

describe('the signature status, set like the photo', () => {
  const optional = { requiresSignature: false, hasSignature: false };
  const required = { requiresSignature: true, hasSignature: false };
  const received = { requiresSignature: true, hasSignature: true };

  it('says what the driver needs to do', () => {
    expect(signatureStatus(optional, false)).toBe('optional');
    expect(signatureStatus(required, false)).toBe('required');
    expect(signatureStatus(received, false)).toBe('received');
    expect(signatureStatus(required, true)).toBe('waiting-to-upload');
    expect(SIGNATURE_STATUS_MESSAGES.required).toMatch(/before you can finish/);
  });

  it('blocks delivery only when one is required and the server does not have it yet', () => {
    expect(isDeliveryBlockedBySignature(optional)).toBe(false);
    expect(isDeliveryBlockedBySignature(required)).toBe(true);
    expect(isDeliveryBlockedBySignature(received)).toBe(false);
  });
});
