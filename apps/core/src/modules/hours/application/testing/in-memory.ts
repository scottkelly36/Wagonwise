import type { CompanyId, DriverId, HoursStatus, StaffId } from '../../domain/hours.js';
import type {
  ActiveJobs,
  DriverCompanies,
  SettingsRepository,
  SharingRepository,
  StatusRepository,
} from '../ports.js';

export class InMemorySettings implements SettingsRepository {
  readonly enabled = new Set<CompanyId>();

  isEnabled(companyId: CompanyId): Promise<boolean> {
    return Promise.resolve(this.enabled.has(companyId));
  }

  set(companyId: CompanyId, enabled: boolean, _by: StaffId, _at: Date): Promise<void> {
    if (enabled) this.enabled.add(companyId);
    else this.enabled.delete(companyId);
    return Promise.resolve();
  }
}

export class InMemorySharing implements SharingRepository {
  readonly rows = new Map<string, { wordingVersion: number; at: Date }>();
  private key = (c: CompanyId, d: DriverId): string => `${c}|${d}`;

  isSharing(companyId: CompanyId, driverId: DriverId): Promise<boolean> {
    return Promise.resolve(this.rows.has(this.key(companyId, driverId)));
  }

  set(
    companyId: CompanyId,
    driverId: DriverId,
    sharing: boolean,
    wordingVersion: number,
    at: Date,
  ): Promise<void> {
    if (sharing) this.rows.set(this.key(companyId, driverId), { wordingVersion, at });
    else this.rows.delete(this.key(companyId, driverId));
    return Promise.resolve();
  }
}

export class InMemoryStatuses implements StatusRepository {
  readonly rows = new Map<string, HoursStatus>();
  private key = (c: CompanyId, d: DriverId): string => `${c}|${d}`;

  upsert(status: HoursStatus): Promise<void> {
    this.rows.set(this.key(status.companyId, status.driverId), status);
    return Promise.resolve();
  }

  listForCompany(companyId: CompanyId): Promise<HoursStatus[]> {
    return Promise.resolve([...this.rows.values()].filter((s) => s.companyId === companyId));
  }

  remove(driverId: DriverId, companyId?: CompanyId): Promise<void> {
    for (const [key, s] of this.rows) {
      if (s.driverId === driverId && (companyId === undefined || s.companyId === companyId)) {
        this.rows.delete(key);
      }
    }
    return Promise.resolve();
  }

  removeAllForCompany(companyId: CompanyId): Promise<void> {
    for (const [key, s] of this.rows) if (s.companyId === companyId) this.rows.delete(key);
    return Promise.resolve();
  }

  deleteStale(before: Date): Promise<number> {
    let n = 0;
    for (const [key, s] of this.rows) {
      if (s.updatedAt < before) {
        this.rows.delete(key);
        n += 1;
      }
    }
    return Promise.resolve(n);
  }
}

export class FakeDriverCompanies implements DriverCompanies {
  readonly byDriver = new Map<DriverId, { id: CompanyId; name: string }[]>();

  activeCompanies(driverId: DriverId): Promise<{ id: CompanyId; name: string }[]> {
    return Promise.resolve(this.byDriver.get(driverId) ?? []);
  }
}

export class FakeActiveJobs implements ActiveJobs {
  readonly onJob = new Map<DriverId, CompanyId>();

  companyOfActiveJob(driverId: DriverId): Promise<CompanyId | null> {
    return Promise.resolve(this.onJob.get(driverId) ?? null);
  }

  driversOnJobs(companyId: CompanyId): Promise<DriverId[]> {
    return Promise.resolve([...this.onJob].filter(([, c]) => c === companyId).map(([d]) => d));
  }
}
