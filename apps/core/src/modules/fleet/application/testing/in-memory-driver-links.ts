import type { DomainEvent } from '../../../../shared/domain-event.js';
import {
  LIVE_STATUSES,
  type DriverId,
  type DriverLink,
  type DriverLinkId,
} from '../../domain/driver-link.js';
import type { CompanyId } from '../../domain/vehicle.js';
import type { CodeGenerator, CompanyCodeRepository } from '../ports/company-code-repository.js';
import type { DriverLinkRepository } from '../ports/driver-link-repository.js';

export class InMemoryDriverLinkRepository implements DriverLinkRepository {
  #byId = new Map<DriverLinkId, DriverLink>();
  /** Every event saved, in order, for tests to assert on. */
  readonly events: DomainEvent[] = [];

  findById(id: DriverLinkId): Promise<DriverLink | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findLive(companyId: CompanyId, driverId: DriverId): Promise<DriverLink | null> {
    const found = [...this.#byId.values()].find(
      (l) =>
        l.companyId === companyId && l.driverId === driverId && LIVE_STATUSES.includes(l.status),
    );
    return Promise.resolve(found ?? null);
  }

  findPendingInvite(companyId: CompanyId, identifier: string): Promise<DriverLink | null> {
    const found = [...this.#byId.values()].find(
      (l) =>
        l.companyId === companyId && l.status === 'invited' && l.invitedIdentifier === identifier,
    );
    return Promise.resolve(found ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<DriverLink[]> {
    return Promise.resolve([...this.#byId.values()].filter((l) => l.companyId === companyId));
  }

  listForDriver(driverId: DriverId, identifier: string): Promise<DriverLink[]> {
    return Promise.resolve(
      [...this.#byId.values()].filter(
        (l) =>
          l.driverId === driverId || (l.status === 'invited' && l.invitedIdentifier === identifier),
      ),
    );
  }

  save(link: DriverLink, events: readonly DomainEvent[] = []): Promise<void> {
    this.#byId.set(link.id, link);
    this.events.push(...events);
    return Promise.resolve();
  }
}

export class InMemoryCompanyCodeRepository implements CompanyCodeRepository {
  #byCompany = new Map<CompanyId, string>();

  findByCompany(companyId: CompanyId): Promise<string | null> {
    return Promise.resolve(this.#byCompany.get(companyId) ?? null);
  }

  findCompanyByCode(code: string): Promise<CompanyId | null> {
    const found = [...this.#byCompany.entries()].find(([, c]) => c === code);
    return Promise.resolve(found?.[0] ?? null);
  }

  save(companyId: CompanyId, code: string): Promise<void> {
    this.#byCompany.set(companyId, code);
    return Promise.resolve();
  }
}

/** Hands out the codes it was given, in order, so a test knows what a "random" code is. */
export class FixedCodeGenerator implements CodeGenerator {
  #next = 0;
  constructor(private readonly codes: readonly string[]) {}
  generate(): string {
    const code = this.codes[this.#next];
    if (code === undefined) throw new Error('FixedCodeGenerator ran out of codes');
    this.#next += 1;
    return code;
  }
}
