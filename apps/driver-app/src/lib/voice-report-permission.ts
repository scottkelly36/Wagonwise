export type VoiceCapturePermissionResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'denied' | 'error' };

export interface PermissionStatus {
  readonly granted: boolean;
}

export interface VoiceCapturePermissionDeps {
  readonly getPermissionsAsync: () => Promise<PermissionStatus>;
  readonly requestPermissionsAsync: () => Promise<PermissionStatus>;
}

/**
 * Pure orchestration over injected, effectful `expo-speech-recognition` calls — same split as
 * `obtainPushToken` (M6.6): the permission-check-then-request branching is unit-testable without
 * mocking a native module. A denial is an expected outcome (AGENTS.md rule 13), not a thrown
 * error — a driver who says no to the microphone still has tap-to-drop reporting.
 */
export async function obtainVoiceCapturePermission(
  deps: VoiceCapturePermissionDeps,
): Promise<VoiceCapturePermissionResult> {
  try {
    const existing = await deps.getPermissionsAsync();
    const permission = existing.granted ? existing : await deps.requestPermissionsAsync();
    return permission.granted ? { ok: true } : { ok: false, reason: 'denied' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
