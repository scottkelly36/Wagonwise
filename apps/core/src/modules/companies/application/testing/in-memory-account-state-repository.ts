import {
  DEFAULT_ACCOUNT_SETTINGS,
  type AccountSettings,
  type AccountState,
  type AccountStateMove,
  type AccountStatus,
} from '../../domain/account-state.js';
import type { CompanyId } from '../../domain/company.js';
import type { AccountStateRepository } from '../ports/account-state-repository.js';

export class InMemoryAccountStateRepository implements AccountStateRepository {
  readonly states = new Map<CompanyId, AccountState>();
  readonly moves: AccountStateMove[] = [];
  settings: AccountSettings = DEFAULT_ACCOUNT_SETTINGS;

  get(companyId: CompanyId): Promise<AccountState | null> {
    return Promise.resolve(this.states.get(companyId) ?? null);
  }

  getStatus(companyId: CompanyId): Promise<AccountStatus | null> {
    return Promise.resolve(this.states.get(companyId)?.status ?? null);
  }

  getAll(): Promise<readonly AccountState[]> {
    return Promise.resolve([...this.states.values()]);
  }

  save(state: AccountState): Promise<void> {
    this.states.set(state.companyId, state);
    return Promise.resolve();
  }

  appendMove(move: AccountStateMove): Promise<void> {
    this.moves.push(move);
    return Promise.resolve();
  }

  getSettings(): Promise<AccountSettings> {
    return Promise.resolve(this.settings);
  }

  saveSettings(settings: AccountSettings): Promise<void> {
    this.settings = settings;
    return Promise.resolve();
  }
}
