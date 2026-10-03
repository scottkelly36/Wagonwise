import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { enqueueProofOfDelivery, listQueuedProofJobIds } from '../db/proof-of-delivery-queue';
import { prepareProofPhoto } from '../lib/proof-of-delivery';
import { useAccessToken } from './use-access-token';
import { PENDING_PROOFS_KEY, syncProofOfDeliveryQueue } from './use-proof-of-delivery-queue-flush';

// Camera photos are far bigger than anything else this app sends, and the contract caps the base64
// at ~5MB of image. A moderate JPEG quality keeps a modern phone's photo well inside that while
// still being a clear picture of a delivered load or a signed note — this is evidence, not art.
const PHOTO_QUALITY = 0.5;

const CAMERA_OFF_MESSAGE =
  "Camera access is off. Turn it on in your phone's settings to take a photo.";
const UNUSABLE_PHOTO_MESSAGE = "That photo was too big or couldn't be read. Try taking it again.";
const CAMERA_FAILED_MESSAGE = "Couldn't open the camera. Try again.";

export interface ProofOfDeliveryCapture {
  /** Whether a photo for this job is saved on the phone but not yet uploaded. */
  readonly queuedLocally: boolean;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly takePhoto: () => Promise<void>;
}

/**
 * The driver's side of proof of delivery (P2-M5.5b): open the camera, save the photo to the offline
 * queue first, then try to upload it straight away. Saving before uploading is the point — if there
 * is no signal at the drop, the photo is safe and the queue sends it later
 * (`useProofOfDeliveryQueueFlush`). The driver is only asked to take a photo; whether it has
 * reached the server comes back via the job's own `hasProofOfDelivery`.
 */
export function useProofOfDeliveryCapture(jobId: string): ProofOfDeliveryCapture {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const pending = useQuery({ queryKey: PENDING_PROOFS_KEY, queryFn: listQueuedProofJobIds });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const takePhoto = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(CAMERA_OFF_MESSAGE);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
        base64: true,
        exif: false,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset === undefined) return;

      const photo = prepareProofPhoto(asset);
      if (photo === undefined) {
        setError(UNUSABLE_PHOTO_MESSAGE);
        return;
      }
      await enqueueProofOfDelivery({ jobId, ...photo });
      await queryClient.invalidateQueries({ queryKey: PENDING_PROOFS_KEY });
      void syncProofOfDeliveryQueue(accessToken);
    } catch {
      setError(CAMERA_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  }, [accessToken, busy, jobId, queryClient]);

  return {
    queuedLocally: pending.data?.includes(jobId) ?? false,
    busy,
    error,
    takePhoto,
  };
}
