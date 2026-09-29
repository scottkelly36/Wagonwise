import type { CompanyId } from '../../domain/company.js';
import type { StaffAccount, StaffId } from '../../domain/staff-account.js';
import type { StaffChallenge, StaffChallengeId } from '../../domain/staff-challenge.js';
import type { StaffAuditAction, StaffAuditEntry } from '../../domain/staff-audit.js';
import type { StaffCredentials } from '../../domain/staff-credentials.js';
import type { StaffInvite, StaffInviteId } from '../../domain/staff-invite.js';
import type { StaffSession, StaffSessionId } from '../../domain/staff-session.js';
import type { StaffAccountRepository } from '../ports/staff-account-repository.js';
import type { StaffAuditLog } from '../ports/staff-audit-log.js';
import type { StaffChallengeRepository } from '../ports/staff-challenge-repository.js';
import type { StaffInviteRepository } from '../ports/staff-invite-repository.js';
import type { StaffRecoveryCodeRepository } from '../ports/staff-recovery-code-repository.js';
import type { StaffSessionRepository } from '../ports/staff-session-repository.js';

/** Pure in-memory fakes for the staff ports (AGENTS.md rule 3: use cases are tested against
 *  fakes, never mocks). Same behaviour as the Postgres versions, which their own tests pin. */

export class InMemoryStaffAccountRepository implements StaffAccountRepository {
  readonly #accounts = new Map<StaffId, StaffAccount>();
  readonly #credentials = new Map<StaffId, StaffCredentials>();
  readonly #removed = new Set<StaffId>();

  create(account: StaffAccount, credentials: StaffCredentials): Promise<void> {
    if (this.#liveByEmail(account.email) !== undefined) {
      return Promise.reject(new Error(`a live staff account already uses ${account.email}`));
    }
    this.#accounts.set(account.id, account);
    this.#credentials.set(account.id, credentials);
    return Promise.resolve();
  }

  save(account: StaffAccount): Promise<void> {
    if (!this.#accounts.has(account.id)) return Promise.reject(new Error('no such account'));
    this.#accounts.set(account.id, account);
    return Promise.resolve();
  }

  saveCredentials(credentials: StaffCredentials): Promise<void> {
    this.#credentials.set(credentials.staffId, credentials);
    return Promise.resolve();
  }

  findById(id: StaffId): Promise<StaffAccount | null> {
    return Promise.resolve(this.#removed.has(id) ? null : (this.#accounts.get(id) ?? null));
  }

  findByEmail(email: string): Promise<StaffAccount | null> {
    return Promise.resolve(this.#liveByEmail(email) ?? null);
  }

  findCredentials(id: StaffId): Promise<StaffCredentials | null> {
    return Promise.resolve(this.#removed.has(id) ? null : (this.#credentials.get(id) ?? null));
  }

  listByCompany(companyId: CompanyId): Promise<StaffAccount[]> {
    return Promise.resolve(
      this.#live().filter((a) => a.kind === 'fleet' && a.companyId === companyId),
    );
  }

  listAll(): Promise<StaffAccount[]> {
    const live = this.#live();
    return Promise.resolve([
      ...live.filter((a) => a.kind === 'platform'),
      ...live.filter((a) => a.kind === 'fleet'),
    ]);
  }

  countManagers(companyId: CompanyId): Promise<number> {
    return Promise.resolve(
      this.#live().filter(
        (a) =>
          a.kind === 'fleet' && a.companyId === companyId && a.privileges.includes('manage_users'),
      ).length,
    );
  }

  remove(id: StaffId): Promise<void> {
    this.#removed.add(id);
    return Promise.resolve();
  }

  #live(): StaffAccount[] {
    return [...this.#accounts.values()].filter((a) => !this.#removed.has(a.id));
  }

  #liveByEmail(email: string): StaffAccount | undefined {
    return this.#live().find((a) => a.email.toLowerCase() === email.toLowerCase());
  }
}

export class InMemoryStaffInviteRepository implements StaffInviteRepository {
  readonly #byId = new Map<StaffInviteId, StaffInvite>();

  save(invite: StaffInvite): Promise<void> {
    this.#byId.set(invite.id, invite);
    return Promise.resolve();
  }

  findById(id: StaffInviteId): Promise<StaffInvite | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findByTokenHash(tokenHash: string): Promise<StaffInvite | null> {
    return Promise.resolve([...this.#byId.values()].find((i) => i.tokenHash === tokenHash) ?? null);
  }

  listByCompany(companyId: CompanyId): Promise<StaffInvite[]> {
    return Promise.resolve(
      [...this.#byId.values()]
        .filter((i) => i.companyId === companyId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }
}

export class InMemoryStaffSessionRepository implements StaffSessionRepository {
  readonly #byId = new Map<StaffSessionId, StaffSession>();

  findByRefreshTokenHash(hash: string): Promise<StaffSession | null> {
    for (const session of this.#byId.values()) {
      if (session.refreshTokenHash === hash || session.previousRefreshTokenHash === hash) {
        return Promise.resolve(session);
      }
    }
    return Promise.resolve(null);
  }

  findById(id: StaffSessionId): Promise<StaffSession | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  save(session: StaffSession): Promise<void> {
    this.#byId.set(session.id, session);
    return Promise.resolve();
  }

  revokeAllForStaff(staffId: StaffId, now: Date): Promise<void> {
    for (const [id, session] of this.#byId) {
      if (session.staffId === staffId && session.revokedAt === null) {
        this.#byId.set(id, { ...session, revokedAt: now });
      }
    }
    return Promise.resolve();
  }
}

export class InMemoryStaffChallengeRepository implements StaffChallengeRepository {
  readonly #byId = new Map<StaffChallengeId, StaffChallenge>();

  save(challenge: StaffChallenge): Promise<void> {
    this.#byId.set(challenge.id, challenge);
    return Promise.resolve();
  }

  findById(id: StaffChallengeId): Promise<StaffChallenge | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }
}

export class InMemoryStaffRecoveryCodeRepository implements StaffRecoveryCodeRepository {
  readonly #codes = new Map<StaffId, Map<string, Date | null>>();

  replaceAll(staffId: StaffId, codeHashes: readonly string[]): Promise<void> {
    this.#codes.set(staffId, new Map(codeHashes.map((h) => [h, null])));
    return Promise.resolve();
  }

  use(staffId: StaffId, codeHash: string, at: Date): Promise<boolean> {
    const codes = this.#codes.get(staffId);
    if (!codes?.has(codeHash) || codes.get(codeHash) !== null) return Promise.resolve(false);
    codes.set(codeHash, at);
    return Promise.resolve(true);
  }

  countUnused(staffId: StaffId): Promise<number> {
    const codes = this.#codes.get(staffId);
    return Promise.resolve(codes ? [...codes.values()].filter((u) => u === null).length : 0);
  }
}

/** Keeps entries in order; `recent` returns newest first, like the Postgres one. */
export class InMemoryStaffAuditLog implements StaffAuditLog {
  readonly entries: StaffAuditEntry[] = [];

  record(entry: StaffAuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  recent(input: {
    readonly companyId?: CompanyId | undefined;
    readonly limit: number;
  }): Promise<StaffAuditEntry[]> {
    const matching = this.entries.filter(
      (e) => input.companyId === undefined || e.companyId === input.companyId,
    );
    return Promise.resolve(matching.reverse().slice(0, input.limit));
  }

  countSince(input: {
    readonly targetId: StaffId;
    readonly action: StaffAuditAction;
    readonly since: Date;
  }): Promise<number> {
    return Promise.resolve(
      this.entries.filter(
        (e) => e.targetId === input.targetId && e.action === input.action && e.at >= input.since,
      ).length,
    );
  }
}
