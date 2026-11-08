import type { CheckTemplateId, CompanyId, VehicleId } from '../../domain/check-template.js';
import type { Check, CheckId } from '../../domain/check.js';
import type { RetentionCutoffs } from '../../domain/settings.js';

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
  /**
   * Deletes the company's checks, with their photos and defects: a check that found nothing once it was submitted before
   * `clearBefore`, and a check that found a defect once it was submitted before `withDefectsBefore`. Never one that still has a
   * defect open or seen. Returns how many were deleted.
   */
  deleteOlderThan(companyId: CompanyId, cutoffs: RetentionCutoffs): Promise<number>;
}
