import type { CompanyId } from '../../domain/vehicle.js';

export interface CompanyCodeRepository {
  /** The company's current code (normalised), if it has one. */
  findByCompany(companyId: CompanyId): Promise<string | null>;
  /** Which company a code belongs to, if any. A driver reaches this without being able to read
   *  anyone's codes (migration 0028's definer function). */
  findCompanyByCode(code: string): Promise<CompanyId | null>;
  /** Sets the company's code, replacing the old one, which stops working at once. */
  save(companyId: CompanyId, code: string, at: Date): Promise<void>;
}

/** Makes a fresh normalised code. A port so use cases stay deterministic under test. */
export interface CodeGenerator {
  generate(): string;
}
