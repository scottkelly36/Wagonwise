import type { AttachCheckPhotoRequest } from '@wagonwise/contracts/checks';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { prepareCheckPhoto } from '../lib/check-flow';

// The same camera settings as proof of delivery: a moderate JPEG keeps a modern phone's photo well inside the
// contract's size cap while still being a clear picture of a tyre or a load. This is evidence, not art.
const PHOTO_QUALITY = 0.5;

const CAMERA_OFF_MESSAGE =
  "Camera access is off. Turn it on in your phone's settings to take a photo.";
const UNUSABLE_PHOTO_MESSAGE = "That photo was too big or couldn't be read. Try taking it again.";
const CAMERA_FAILED_MESSAGE = "Couldn't open the camera. Try again.";

export interface CheckPhotoCapture {
  readonly busy: boolean;
  readonly error: string | undefined;
  /** Opens the camera; resolves with the photo, or `undefined` if the driver cancelled or it failed (see `error`). */
  readonly take: () => Promise<AttachCheckPhotoRequest | undefined>;
}

/** Takes one photo for a check question. The photo is handed back to the screen, which keeps it with the answer
 *  until the check is finished and saved to the offline queue. */
export function useCheckPhoto(): CheckPhotoCapture {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const take = useCallback(async (): Promise<AttachCheckPhotoRequest | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    setError(undefined);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(CAMERA_OFF_MESSAGE);
        return undefined;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: PHOTO_QUALITY,
        base64: true,
        exif: false,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset === undefined) return undefined;
      const photo = prepareCheckPhoto(asset);
      if (photo === undefined) setError(UNUSABLE_PHOTO_MESSAGE);
      return photo;
    } catch {
      setError(CAMERA_FAILED_MESSAGE);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { busy, error, take };
}
