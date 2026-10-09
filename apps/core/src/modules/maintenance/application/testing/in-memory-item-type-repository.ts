import type { CompanyId, ItemType, ItemTypeId } from '../../domain/maintenance.js';
import type { ItemTypeRepository } from '../ports/item-type-repository.js';

export class InMemoryItemTypeRepository implements ItemTypeRepository {
  readonly #byId = new Map<ItemTypeId, ItemType>();

  findById(id: ItemTypeId): Promise<ItemType | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<ItemType[]> {
    return Promise.resolve(
      [...this.#byId.values()]
        .filter((i) => i.companyId === companyId && i.archivedAt === undefined)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  save(item: ItemType): Promise<void> {
    this.#byId.set(item.id, item);
    return Promise.resolve();
  }
}
