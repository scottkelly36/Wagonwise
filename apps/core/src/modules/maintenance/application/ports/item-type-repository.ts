import type { CompanyId, ItemType, ItemTypeId } from '../../domain/maintenance.js';

export interface ItemTypeRepository {
  /** An archived item is still found by id (its history refers to it) but not listed. */
  findById(id: ItemTypeId): Promise<ItemType | null>;
  /** The company's items that are not archived, A to Z. */
  listForCompany(companyId: CompanyId): Promise<ItemType[]>;
  /** Inserts, or replaces the item with the same id. */
  save(item: ItemType): Promise<void>;
}
