import {
  attachProofOfDeliveryRequestSchema,
  type AttachProofOfDeliveryRequest,
  type JobDto,
} from '@wagonwise/contracts/jobs';

/** What the camera hands back that we care about — `expo-image-picker`'s asset, narrowed to the
 *  two fields we read so this stays testable without the native module. */
export interface CapturedPhoto {
  readonly base64?: string | null;
  readonly mimeType?: string | undefined;
}

/**
 * Turns a camera result into the request core accepts, or `undefined` if it can't be one. The
 * contract's own schema is the arbiter (non-empty, valid base64, under the size cap) rather than a
 * second copy of that cap here — a photo it rejects would only be rejected again, permanently, by
 * the server, so it's refused before it's ever queued.
 */
export function prepareProofPhoto(photo: CapturedPhoto): AttachProofOfDeliveryRequest | undefined {
  if (photo.base64 === undefined || photo.base64 === null) return undefined;
  const parsed = attachProofOfDeliveryRequestSchema.safeParse({
    contentType: photo.mimeType ?? 'image/jpeg',
    dataBase64: photo.base64,
  });
  return parsed.success ? parsed.data : undefined;
}

export type ProofOfDeliveryStatus = 'waiting-to-upload' | 'received' | 'required' | 'optional';

/** What the job screen tells the driver about proof of delivery. A photo sitting in the local
 *  queue wins over the server's flag: it's the newer photo (a retake), or the only one so far. */
export function proofOfDeliveryStatus(
  job: Pick<JobDto, 'requiresProofOfDelivery' | 'hasProofOfDelivery'>,
  queuedLocally: boolean,
): ProofOfDeliveryStatus {
  if (queuedLocally) return 'waiting-to-upload';
  if (job.hasProofOfDelivery) return 'received';
  return job.requiresProofOfDelivery ? 'required' : 'optional';
}

/** Core refuses `→ delivered` until the server has a photo (`ProofOfDeliveryRequired`), so a photo
 *  still in the local queue doesn't unblock it — only `hasProofOfDelivery` does. Mirrored here so
 *  the driver isn't offered a button that is certain to fail. */
export function isDeliveryBlockedByProof(
  job: Pick<JobDto, 'requiresProofOfDelivery' | 'hasProofOfDelivery'>,
): boolean {
  return job.requiresProofOfDelivery && !job.hasProofOfDelivery;
}

export const PROOF_STATUS_MESSAGES: Record<ProofOfDeliveryStatus, string> = {
  'waiting-to-upload': 'Photo saved — it will send when you have signal.',
  received: 'Photo received.',
  required: 'This job needs a photo of the delivery before you can finish it.',
  optional: 'You can add a photo of the delivery.',
};
