import type { InviteCode } from '../../domain/invite-code.js';
import type { InviteCodeRepository } from '../ports/invite-code-repository.js';

export class InMemoryInviteCodeRepository implements InviteCodeRepository {
  #byCode = new Map<string, InviteCode>();

  seed(invite: InviteCode): void {
    this.#byCode.set(invite.code, invite);
  }

  findByCode(code: string): Promise<InviteCode | null> {
    return Promise.resolve(this.#byCode.get(code) ?? null);
  }

  findAll(): Promise<InviteCode[]> {
    return Promise.resolve([...this.#byCode.values()]);
  }

  save(invite: InviteCode): Promise<void> {
    this.#byCode.set(invite.code, invite);
    return Promise.resolve();
  }
}
