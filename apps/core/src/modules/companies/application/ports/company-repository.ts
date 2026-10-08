import type { Company, CompanyId } from '../../domain/company.js';

export interface CompanyRepository {
  save(company: Company): Promise<void>;
  findAll(): Promise<Company[]>;
  findById(id: CompanyId): Promise<Company | null>;
  setPhotoRetention(id: CompanyId, months: number): Promise<void>;
}
