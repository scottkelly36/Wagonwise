import type {
  CompanyId,
  HistoryEntry,
  ItemTypeId,
  Schedule,
  StaffId,
  VehicleId,
} from '../../domain/maintenance.js';
import type { ScheduleRepository } from '../ports/schedule-repository.js';

export class InMemoryScheduleRepository implements ScheduleRepository {
  readonly #schedules = new Map<string, { companyId: CompanyId; schedule: Schedule }>();
  readonly #history: { companyId: CompanyId; entry: HistoryEntry }[] = [];
  private static key(vehicleId: VehicleId, itemTypeId: ItemTypeId): string {
    return `${vehicleId}/${itemTypeId}`;
  }

  listForCompany(companyId: CompanyId): Promise<Schedule[]> {
    return Promise.resolve(
      [...this.#schedules.values()].filter((s) => s.companyId === companyId).map((s) => s.schedule),
    );
  }

  listForVehicle(vehicleId: VehicleId): Promise<Schedule[]> {
    return Promise.resolve(
      [...this.#schedules.values()].map((s) => s.schedule).filter((s) => s.vehicleId === vehicleId),
    );
  }

  find(vehicleId: VehicleId, itemTypeId: ItemTypeId): Promise<Schedule | null> {
    return Promise.resolve(
      this.#schedules.get(InMemoryScheduleRepository.key(vehicleId, itemTypeId))?.schedule ?? null,
    );
  }

  upsert(companyId: CompanyId, schedule: Schedule, _by?: StaffId, _at?: Date): Promise<void> {
    this.#schedules.set(InMemoryScheduleRepository.key(schedule.vehicleId, schedule.itemTypeId), {
      companyId,
      schedule,
    });
    return Promise.resolve();
  }

  addHistory(companyId: CompanyId, entry: HistoryEntry): Promise<void> {
    this.#history.push({ companyId, entry });
    return Promise.resolve();
  }

  listHistory(vehicleId: VehicleId): Promise<HistoryEntry[]> {
    return Promise.resolve(
      this.#history
        .map((h) => h.entry)
        .filter((e) => e.vehicleId === vehicleId)
        .sort(
          (a, b) =>
            b.doneOn.localeCompare(a.doneOn) || b.recordedAt.getTime() - a.recordedAt.getTime(),
        ),
    );
  }
}
