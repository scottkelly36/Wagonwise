import {
  DEFAULT_SETTINGS,
  type CompanyId,
  type DriverId,
  type FileSummary,
  type FirmSettings,
  type NewFile,
  type StaffId,
  type StoredFile,
} from '../../domain/tachograph.js';
import type {
  CompanyRoster,
  DriverCompanies,
  FileRepository,
  SettingsRepository,
} from '../ports.js';

export class InMemorySettings implements SettingsRepository {
  readonly byCompany = new Map<CompanyId, FirmSettings>();

  get(companyId: CompanyId): Promise<FirmSettings> {
    return Promise.resolve(this.byCompany.get(companyId) ?? DEFAULT_SETTINGS);
  }

  set(companyId: CompanyId, settings: FirmSettings, _by: StaffId, _at: Date): Promise<void> {
    this.byCompany.set(companyId, settings);
    return Promise.resolve();
  }
}

export class InMemoryFiles implements FileRepository {
  readonly stored: NewFile[] = [];

  add(file: NewFile): Promise<'added' | 'duplicate'> {
    if (this.stored.some((f) => f.companyId === file.companyId && f.sha256 === file.sha256)) {
      return Promise.resolve('duplicate');
    }
    this.stored.push(file);
    return Promise.resolve('added');
  }

  private summary(f: NewFile): FileSummary {
    return {
      id: f.id,
      companyId: f.companyId,
      kind: f.kind,
      driverId: f.driverId,
      vehicleId: f.vehicleId,
      fileName: f.fileName,
      sizeBytes: f.data.length,
      downloadedOn: f.downloadedOn,
      receivedAt: f.receivedAt,
      source: f.uploadedByDriverId === undefined ? 'office' : 'driver_app',
    };
  }

  private forCompany(companyId: CompanyId): NewFile[] {
    return this.stored
      .filter((f) => f.companyId === companyId)
      .sort(
        (a, b) =>
          b.downloadedOn.localeCompare(a.downloadedOn) ||
          b.receivedAt.getTime() - a.receivedAt.getTime(),
      );
  }

  latestPerSubject(companyId: CompanyId): Promise<FileSummary[]> {
    const seen = new Set<string>();
    const latest: FileSummary[] = [];
    for (const f of this.forCompany(companyId)) {
      const key = `${f.kind}|${f.driverId ?? f.vehicleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      latest.push(this.summary(f));
    }
    return Promise.resolve(latest);
  }

  recent(companyId: CompanyId, limit: number): Promise<FileSummary[]> {
    return Promise.resolve(
      this.forCompany(companyId)
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
        .slice(0, limit)
        .map((f) => this.summary(f)),
    );
  }

  find(companyId: CompanyId, fileId: string): Promise<StoredFile | null> {
    const f = this.stored.find((s) => s.companyId === companyId && s.id === fileId);
    return Promise.resolve(
      f === undefined ? null : { summary: this.summary(f), data: f.data, sha256: f.sha256 },
    );
  }

  remove(companyId: CompanyId, fileId: string): Promise<boolean> {
    const index = this.stored.findIndex((s) => s.companyId === companyId && s.id === fileId);
    if (index < 0) return Promise.resolve(false);
    this.stored.splice(index, 1);
    return Promise.resolve(true);
  }

  latestCardDay(companyId: CompanyId, driverId: DriverId): Promise<string | undefined> {
    return Promise.resolve(
      this.forCompany(companyId).find((f) => f.kind === 'driver_card' && f.driverId === driverId)
        ?.downloadedOn,
    );
  }

  deleteExpired(_now: Date): Promise<number> {
    return Promise.resolve(0);
  }
}

export class InMemoryDriverCompanies implements DriverCompanies {
  readonly byDriver = new Map<string, { id: CompanyId; name: string }[]>();

  activeCompanies(driverId: DriverId): Promise<readonly { id: CompanyId; name: string }[]> {
    return Promise.resolve(this.byDriver.get(driverId) ?? []);
  }
}

export class InMemoryRoster implements CompanyRoster {
  /** `company|driver` and `company|vehicle` pairs. */
  readonly drivers = new Set<string>();
  readonly vehicles = new Set<string>();

  isActiveDriver(companyId: CompanyId, driverId: string): Promise<boolean> {
    return Promise.resolve(this.drivers.has(`${companyId}|${driverId}`));
  }

  hasVehicle(companyId: CompanyId, vehicleId: string): Promise<boolean> {
    return Promise.resolve(this.vehicles.has(`${companyId}|${vehicleId}`));
  }
}
