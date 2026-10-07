import type { DriverDataEraser } from '../ports/driver-data-eraser.js';

/** Remembers what it was asked to erase; `failWith` makes the next calls throw, to test a failure. */
export class RecordingDriverDataEraser implements DriverDataEraser {
  readonly erased: { readonly driverId: string; readonly identifier: string }[] = [];
  failWith: Error | undefined;

  erase(input: { readonly driverId: string; readonly identifier: string }): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.erased.push(input);
    return Promise.resolve();
  }
}
