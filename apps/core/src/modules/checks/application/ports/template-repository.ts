import type { CheckTemplate, CheckTemplateId, CompanyId } from '../../domain/check-template.js';

export interface TemplateRepository {
  /** An archived list is still found by id (its past checks refer to it) but not listed. */
  findById(id: CheckTemplateId): Promise<CheckTemplate | null>;
  /** The company's lists that are not archived, A to Z. */
  listForCompany(companyId: CompanyId): Promise<CheckTemplate[]>;
  /** Inserts, or replaces the list with the same id. */
  save(template: CheckTemplate): Promise<void>;
}
