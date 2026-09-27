import type { Company } from '../../domain/company.js';

export interface CompanyRepository {
  save(company: Company): Promise<void>;
  findAll(): Promise<Company[]>;
}
