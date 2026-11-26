import { requireOptionalNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';

/** Whether this build can hand a file to another app (a build made before the sharing package was added cannot). */
export function canShareFiles(): boolean {
  return requireOptionalNativeModule('ExpoSharing') !== null;
}

/**
 * Saves bytes as a file in the app's own cache and opens the phone's share sheet for it, so the driver chooses where it goes (their
 * email, a drive). Nothing is sent by the app itself. The copy is NOT deleted when the sheet closes (the receiving app may still be
 * reading it): it stays in the cache until `deleteSavedFile`, the next save with the same name, or the phone clearing its cache.
 */
export async function shareBytes(name: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

/** Removes a file saved by `shareBytes`. */
export function deleteSavedFile(name: string): void {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
}
