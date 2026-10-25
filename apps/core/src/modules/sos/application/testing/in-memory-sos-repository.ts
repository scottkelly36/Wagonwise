import type { CompanyId, DriverId, SosAlert, SosAlertId, StaffId } from '../../domain/sos.js';
import type { SosRepository } from '../ports.js';

export class InMemorySosRepository implements SosRepository {
  readonly #alerts = new Map<SosAlertId, SosAlert>();

  insertAll(alerts: readonly SosAlert[]): Promise<void> {
    for (const alert of alerts) {
      const exists = [...this.#alerts.values()].some(
        (a) => a.requestId === alert.requestId && a.companyId === alert.companyId,
      );
      if (!exists) this.#alerts.set(alert.id, alert);
    }
    return Promise.resolve();
  }

  findByRequest(requestId: string, driverId: DriverId): Promise<SosAlert[]> {
    return Promise.resolve(
      [...this.#alerts.values()].filter(
        (a) => a.requestId === requestId && a.driverId === driverId,
      ),
    );
  }

  listForCompany(companyId: CompanyId, status: 'open' | 'all', limit: number): Promise<SosAlert[]> {
    return Promise.resolve(
      [...this.#alerts.values()]
        .filter((a) => a.companyId === companyId && (status === 'all' || a.status === 'open'))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    );
  }

  findById(id: SosAlertId): Promise<SosAlert | null> {
    return Promise.resolve(this.#alerts.get(id) ?? null);
  }

  resolve(id: SosAlertId, by: StaffId, at: Date): Promise<void> {
    const alert = this.#alerts.get(id);
    if (alert?.status === 'open') {
      this.#alerts.set(id, {
        ...alert,
        status: 'resolved',
        resolvedBy: by,
        resolvedAt: at,
        updatedAt: at,
      });
    }
    return Promise.resolve();
  }

  cancelRequest(requestId: string, driverId: DriverId, at: Date): Promise<SosAlert[]> {
    const cancelled: SosAlert[] = [];
    for (const alert of this.#alerts.values()) {
      if (alert.requestId === requestId && alert.driverId === driverId && alert.status === 'open') {
        const next: SosAlert = { ...alert, status: 'cancelled', updatedAt: at };
        this.#alerts.set(alert.id, next);
        cancelled.push(next);
      }
    }
    return Promise.resolve(cancelled);
  }

  deleteClosedBefore(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const alert of [...this.#alerts.values()]) {
      if (alert.status !== 'open' && alert.updatedAt < cutoff) {
        this.#alerts.delete(alert.id);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }

  eraseDriver(driverId: DriverId): Promise<void> {
    for (const alert of [...this.#alerts.values()]) {
      if (alert.driverId === driverId) this.#alerts.delete(alert.id);
    }
    return Promise.resolve();
  }
}
