import { requireOptionalNativeModule } from 'expo';

/** A file the driver chose, with its bytes as base64. */
export interface PickedFile {
  readonly name: string;
  readonly sizeBytes: number;
  /** When the file was last changed, in milliseconds, when the phone says. */
  readonly lastModifiedMs: number | undefined;
  readonly dataBase64: string;
}

/**
 * Whether this build of the app has the file picker in it. It is a native module, so a build made before it was added does not have
 * it, and a JavaScript update cannot add it: the screen offers the feature only when this says yes, rather than crashing.
 */
export function canPickFiles(): boolean {
  return requireOptionalNativeModule('ExpoDocumentPicker') !== null;
}

/** Reads a file at a `file://` address as base64, the way the web would (no extra native module needed). */
async function readAsBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Opens the phone's file chooser and returns the one file picked, or `null` when the driver backs out. Any file type is allowed: the
 * files tachograph tools save end in .ddd, .c1b or similar, and the phone does not know them.
 */
export async function pickCardFile(): Promise<PickedFile | null> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;
  return {
    name: asset.name,
    sizeBytes: asset.size ?? 0,
    lastModifiedMs: asset.lastModified,
    dataBase64: await readAsBase64(asset.uri),
  };
}
