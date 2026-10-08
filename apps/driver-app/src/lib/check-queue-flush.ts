import type { AttachCheckPhotoRequest, SubmitCheckRequest } from '@wagonwise/contracts/checks';

import { isPermanentRejection } from './proof-of-delivery-flush';

export interface QueuedCheckPhoto extends AttachCheckPhotoRequest {
  readonly itemId: string;
}

/** A completed check waiting on the phone, with the photos that go with it. */
export interface QueuedCheck {
  readonly request: SubmitCheckRequest;
  readonly photos: readonly QueuedCheckPhoto[];
}

export interface CheckFlushResult {
  /** Checks that reached the server, with all their photos. */
  readonly sent: readonly string[];
  /** Checks the server will never accept: dropped from the queue. */
  readonly discarded: readonly string[];
  /** Photos that reached the server, or that it will never accept: to be removed from the queue. */
  readonly photosDone: readonly { readonly checkId: string; readonly itemId: string }[];
  readonly remaining: readonly QueuedCheck[];
}

/**
 * Sends queued checks one at a time, oldest first: the check itself, then its photos. Pure orchestration (`submit`
 * and `sendPhoto` are injected), like `flushQueuedProofs`.
 *
 * Sending the check again is harmless (core returns the one already made), so a pass that stopped part-way, after
 * the check went in but before its photos did, simply starts again. A rejection the server will never change its
 * mind about (a 4xx other than "try again later") drops the check, or just the one photo; anything else (no signal,
 * a 5xx) stops the pass and leaves the rest queued.
 */
export async function flushQueuedChecks(
  queued: readonly QueuedCheck[],
  submit: (request: SubmitCheckRequest) => Promise<unknown>,
  sendPhoto: (checkId: string, photo: QueuedCheckPhoto) => Promise<unknown>,
): Promise<CheckFlushResult> {
  const sent: string[] = [];
  const discarded: string[] = [];
  const photosDone: { checkId: string; itemId: string }[] = [];

  for (let index = 0; index < queued.length; index++) {
    const item = queued[index];
    if (item === undefined) continue;
    const checkId = item.request.id;
    try {
      await submit(item.request);
    } catch (error) {
      if (isPermanentRejection(error)) {
        discarded.push(checkId);
        continue;
      }
      return { sent, discarded, photosDone, remaining: queued.slice(index) };
    }
    for (const photo of item.photos) {
      try {
        await sendPhoto(checkId, photo);
        photosDone.push({ checkId, itemId: photo.itemId });
      } catch (error) {
        if (isPermanentRejection(error)) {
          photosDone.push({ checkId, itemId: photo.itemId });
          continue;
        }
        return { sent, discarded, photosDone, remaining: queued.slice(index) };
      }
    }
    sent.push(checkId);
  }
  return { sent, discarded, photosDone, remaining: [] };
}
