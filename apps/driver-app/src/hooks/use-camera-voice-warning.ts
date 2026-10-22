import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';

import { cameraWarningText, type CameraAhead } from '../lib/camera-ahead';

/**
 * Says "Speed camera ahead" once for each camera, the first time it comes within the warning distance. Never repeats a
 * camera for the life of this hook (one trip). `enabled` is off while the driver has muted guidance or a voice report is
 * listening or speaking: talking over that would be worse than a missed warning.
 */
export function useCameraVoiceWarning(ahead: CameraAhead | undefined, enabled: boolean): void {
  const said = useRef<Set<string>>(new Set());
  const id = ahead?.camera.id;

  useEffect(() => {
    if (!enabled || !ahead || said.current.has(ahead.camera.id)) return;
    said.current.add(ahead.camera.id);
    Speech.speak(cameraWarningText(ahead.camera), { language: 'en-GB' });
    // The id is what matters: a new distance for the same camera is not a new warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);
}
