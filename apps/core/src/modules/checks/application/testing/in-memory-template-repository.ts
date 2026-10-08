import type { CheckTemplate, CheckTemplateId, CompanyId } from '../../domain/check-template.js';
import type { TemplateRepository } from '../ports/template-repository.js';

export class InMemoryTemplateRepository implements TemplateRepository {
  readonly #byId = new Map<CheckTemplateId, CheckTemplate>();

  findById(id: CheckTemplateId): Promise<CheckTemplate | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<CheckTemplate[]> {
    return Promise.resolve(
      [...this.#byId.values()]
        .filter((t) => t.companyId === companyId && t.archivedAt === undefined)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  save(template: CheckTemplate): Promise<void> {
    this.#byId.set(template.id, template);
    return Promise.resolve();
  }
}
