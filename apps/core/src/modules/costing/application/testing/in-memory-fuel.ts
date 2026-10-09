import type {
  CompanyId,
  FuelImport,
  FuelImportId,
  FuelTransaction,
  FuelTransactionId,
  VehicleId,
} from '../../domain/fuel.js';
import type { FuelRepository } from '../ports.js';

export class InMemoryFuelRepository implements FuelRepository {
  readonly imports = new Map<FuelImportId, FuelImport>();
  readonly transactions = new Map<FuelTransactionId, FuelTransaction>();

  existingKeys(companyId: CompanyId, keys: readonly string[]): Promise<ReadonlySet<string>> {
    const held = new Set(
      [...this.transactions.values()]
        .filter((t) => t.companyId === companyId)
        .map((t) => t.dedupeKey),
    );
    return Promise.resolve(new Set(keys.filter((k) => held.has(k))));
  }

  async saveImport(
    fuelImport: FuelImport,
    transactions: readonly FuelTransaction[],
  ): Promise<ReadonlySet<string>> {
    const held = await this.existingKeys(
      fuelImport.companyId,
      transactions.map((t) => t.dedupeKey),
    );
    const fresh = transactions.filter((t) => !held.has(t.dedupeKey));
    this.imports.set(fuelImport.id, { ...fuelImport, rowsImported: fresh.length });
    for (const t of fresh) this.transactions.set(t.id, t);
    return new Set(fresh.map((t) => t.dedupeKey));
  }

  listBetween(companyId: CompanyId, from: Date, to: Date): Promise<FuelTransaction[]> {
    return Promise.resolve(
      [...this.transactions.values()]
        .filter((t) => t.companyId === companyId && t.occurredAt >= from && t.occurredAt < to)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
    );
  }

  listUnmatched(companyId: CompanyId): Promise<FuelTransaction[]> {
    return Promise.resolve(
      [...this.transactions.values()]
        .filter((t) => t.companyId === companyId && t.vehicleId === undefined)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
    );
  }

  findTransaction(id: FuelTransactionId): Promise<FuelTransaction | null> {
    return Promise.resolve(this.transactions.get(id) ?? null);
  }

  setVehicle(id: FuelTransactionId, vehicleId: VehicleId | undefined): Promise<void> {
    const t = this.transactions.get(id);
    if (t !== undefined) this.transactions.set(id, { ...t, vehicleId });
    return Promise.resolve();
  }

  listImports(companyId: CompanyId): Promise<FuelImport[]> {
    return Promise.resolve(
      [...this.imports.values()]
        .filter((i) => i.companyId === companyId)
        .sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime()),
    );
  }

  findImport(id: FuelImportId): Promise<FuelImport | null> {
    return Promise.resolve(this.imports.get(id) ?? null);
  }

  deleteImport(id: FuelImportId): Promise<void> {
    this.imports.delete(id);
    for (const [key, t] of this.transactions) if (t.importId === id) this.transactions.delete(key);
    return Promise.resolve();
  }
}
