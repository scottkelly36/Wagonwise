export type PushTokenResult =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly reason: 'denied' | 'no-project-id' | 'error' };

export interface PermissionStatus {
  readonly status: 'granted' | 'denied' | 'undetermined';
}

export interface PushRegistrationDeps {
  readonly getPermissionsAsync: () => Promise<PermissionStatus>;
  readonly requestPermissionsAsync: () => Promise<PermissionStatus>;
  readonly getExpoPushTokenAsync: (options: { projectId: string }) => Promise<{ data: string }>;
  /** `Constants.expoConfig?.extra?.eas?.projectId` — undefined until an EAS project exists
   *  (docs/progress.md, M5.10: deferred pending Apple/Play accounts). `getExpoPushTokenAsync`
   *  throws without one, so this is checked up front as an expected outcome, not left to throw. */
  readonly projectId: string | undefined;
}

/**
 * Pure orchestration over injected, effectful expo-notifications calls — same split as
 * `flushQueuedReports` (M5.8) and `fetchCurrentLocation` (M5.4), so the permission/no-project-id/
 * error branching is unit-testable without mocking a native module. A denial is an expected
 * outcome (AGENTS.md rule 13), not a thrown error: a driver who says no to notifications still
 * gets a working app, just without reroute pushes.
 */
export async function obtainPushToken(deps: PushRegistrationDeps): Promise<PushTokenResult> {
  if (deps.projectId === undefined) {
    return { ok: false, reason: 'no-project-id' };
  }

  const existing = await deps.getPermissionsAsync();
  const permission =
    existing.status === 'granted' ? existing : await deps.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  try {
    const result = await deps.getExpoPushTokenAsync({ projectId: deps.projectId });
    return { ok: true, token: result.data };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
