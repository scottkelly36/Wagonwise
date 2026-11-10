import {
  SIGNATURE_HEIGHT,
  SIGNATURE_MAX_POINTS,
  SIGNATURE_MAX_POINTS_PER_STROKE,
  SIGNATURE_MAX_STROKES,
  SIGNATURE_WIDTH,
  attachSignatureRequestSchema,
  type AttachSignatureRequest,
  type JobDto,
} from '@wagonwise/contracts/jobs';

/** A point on the signing pad, in the pad's own pixels as the touch reports it. */
export interface PadPoint {
  readonly x: number;
  readonly y: number;
}

export interface PadSize {
  readonly width: number;
  readonly height: number;
}

/** Points closer together than this (in the 1000 x 500 box) add nothing to how the line looks, so they are dropped. */
const MIN_POINT_GAP = 4;

/** The pad's pixels into the contract's 1000 x 500 box, as whole numbers kept inside it. */
function toBox(point: PadPoint, pad: PadSize): [number, number] {
  const clamp = (v: number, max: number): number => Math.min(max, Math.max(0, Math.round(v)));
  return [
    clamp((point.x / pad.width) * SIGNATURE_WIDTH, SIGNATURE_WIDTH),
    clamp((point.y / pad.height) * SIGNATURE_HEIGHT, SIGNATURE_HEIGHT),
  ];
}

/** Drops a point that has barely moved from the one kept before it, always keeping the first and the last. */
function thin(points: readonly [number, number][]): [number, number][] {
  const kept: [number, number][] = [];
  points.forEach((point, index) => {
    const previous = kept.at(-1);
    const isLast = index === points.length - 1;
    if (
      previous === undefined ||
      isLast ||
      Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= MIN_POINT_GAP
    ) {
      kept.push(point);
    }
  });
  return kept;
}

/**
 * The lines the receiver drew, as the request core accepts, or `undefined` when there is nothing to send: no marks, or a
 * drawing the contract would refuse. A long scribble is thinned rather than refused, so a real signature always fits.
 * The contract's own schema is the arbiter, as for the photo.
 */
export function prepareSignature(
  strokes: readonly (readonly PadPoint[])[],
  pad: PadSize,
  signerName: string,
): AttachSignatureRequest | undefined {
  if (pad.width <= 0 || pad.height <= 0) return undefined;
  const boxed = strokes
    .filter((stroke) => stroke.length > 0)
    .slice(0, SIGNATURE_MAX_STROKES)
    .map((stroke) =>
      thin(stroke.map((p) => toBox(p, pad))).slice(0, SIGNATURE_MAX_POINTS_PER_STROKE),
    );
  // A tap with no movement is a dot: still a mark, but a dot alone is not a signature worth keeping.
  const total = boxed.reduce((n, s) => n + s.length, 0);
  if (boxed.length === 0 || total < 3) return undefined;
  const budgeted = total > SIGNATURE_MAX_POINTS ? shrinkTo(boxed, SIGNATURE_MAX_POINTS) : boxed;
  const name = signerName.trim();
  const parsed = attachSignatureRequestSchema.safeParse({
    ...(name === '' ? {} : { signerName: name.slice(0, 80) }),
    strokes: budgeted,
  });
  return parsed.success ? parsed.data : undefined;
}

/** Keeps every other point of every stroke (and each end) until the whole fits, for a very long drawing. */
function shrinkTo(strokes: [number, number][][], limit: number): [number, number][][] {
  let current = strokes;
  while (current.reduce((n, s) => n + s.length, 0) > limit) {
    current = current.map((s) =>
      s.length <= 2 ? s : s.filter((_, i) => i % 2 === 0 || i === s.length - 1),
    );
    if (current.every((s) => s.length <= 2)) break;
  }
  return current;
}

export type SignatureStatus = 'waiting-to-upload' | 'received' | 'required' | 'optional';

/** What the job screen tells the driver about the signature: one saved on the phone wins over the server's flag, as for the photo. */
export function signatureStatus(
  job: Pick<JobDto, 'requiresSignature' | 'hasSignature'>,
  queuedLocally: boolean,
): SignatureStatus {
  if (queuedLocally) return 'waiting-to-upload';
  if (job.hasSignature) return 'received';
  return job.requiresSignature ? 'required' : 'optional';
}

/** Core refuses `-> delivered` until the server has the signature, so one still on the phone does not unblock it. */
export function isDeliveryBlockedBySignature(
  job: Pick<JobDto, 'requiresSignature' | 'hasSignature'>,
): boolean {
  return job.requiresSignature && !job.hasSignature;
}

export const SIGNATURE_STATUS_MESSAGES: Record<SignatureStatus, string> = {
  'waiting-to-upload': 'Signature saved. It will send when you have signal.',
  received: 'Signature received.',
  required: 'This job needs the receiver’s signature before you can finish it.',
  optional: 'You can ask the receiver to sign.',
};

/** One short piece of a drawn line, ready to draw as a thin rotated rectangle. */
export interface PadSegment {
  readonly key: string;
  /** Where the middle of the piece is. */
  readonly cx: number;
  readonly cy: number;
  readonly length: number;
  /** Degrees, clockwise from pointing right. */
  readonly angle: number;
}

/** A line is drawn as the short pieces between its points; a lone point has no piece, so it is drawn as a dot by the pad. */
export function segmentsFor(strokes: readonly (readonly PadPoint[])[]): PadSegment[] {
  const segments: PadSegment[] = [];
  strokes.forEach((stroke, s) => {
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      if (a === undefined || b === undefined) continue;
      segments.push({
        key: `${s}-${i}`,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        length: Math.hypot(b.x - a.x, b.y - a.y),
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      });
    }
  });
  return segments;
}
