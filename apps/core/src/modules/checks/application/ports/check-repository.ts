import type { CheckTemplateId, VehicleId } from '../../domain/check-template.js';
import type { Check, CheckId } from '../../domain/check.js';

export interface CheckPhoto {
  readonly contentType: string;
  /** The picture itself, as sent: base64. */
  readonly dataBase64: string;
}

export interface CheckRepository {
  findById(id: CheckId): Promise<Check | null>;
  /** Whether anyone has already done this list on this vehicle on this UK day. */
  doneOnDay(templateId: CheckTemplateId, vehicleId: VehicleId, day: string): Promise<boolean>;
  /** The check, and a row for each defect it found. */
  save(check: Check, defectIds: readonly string[]): Promise<void>;
  /** A retake replaces the earlier photo for the same question. */
  savePhoto(check: Check, itemId: string, photo: CheckPhoto, at: Date): Promise<void>;
}
