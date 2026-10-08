import type { Company, CompanyId } from '../../domain/company.js';
import type { CompanyRepository } from '../ports/company-repository.js';

export class InMemoryCompanyRepository implements CompanyRepository {
  #byId = new Map<CompanyId, Company>();

  save(company: Company): Promise<void> {
    this.#byId.set(company.id, company);
    return Promise.resolve();
  }

  findAll(): Promise<Company[]> {
    return Promise.resolve([...this.#byId.values()]);
  }

  findById(id: CompanyId): Promise<Company | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  setPhotoRetention(id: CompanyId, months: number): Promise<void> {
    const company = this.#byId.get(id);
    if (company) this.#byId.set(id, { ...company, photoRetentionMonths: months });
    return Promise.resolve();
  }
}
