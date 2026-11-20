import type { Referral } from '../../domain/referral.js';
import type { ReferralCodeRepository, ReferralRepository } from '../referrals.js';

export class InMemoryReferralCodes implements ReferralCodeRepository {
  readonly byDriver = new Map<string, string>();
  findByDriver(driverId: string) {
    return Promise.resolve(this.byDriver.get(driverId) ?? null);
  }
  findDriver(code: string) {
    for (const [driver, c] of this.byDriver) if (c === code) return Promise.resolve(driver);
    return Promise.resolve(null);
  }
  insert(driverId: string, code: string) {
    if (this.byDriver.has(driverId) || [...this.byDriver.values()].includes(code))
      return Promise.resolve(false);
    this.byDriver.set(driverId, code);
    return Promise.resolve(true);
  }
  eraseDriver(driverId: string) {
    this.byDriver.delete(driverId);
    return Promise.resolve();
  }
}

export class InMemoryReferrals implements ReferralRepository {
  readonly rows = new Map<string, { referral: Referral; key: string }>();
  insert(referral: Referral, key: string) {
    for (const r of this.rows.values())
      if (r.key === key && r.referral.status !== 'void') return Promise.resolve(false);
    this.rows.set(referral.id, { referral, key });
    return Promise.resolve(true);
  }
  find(id: string) {
    return Promise.resolve(this.rows.get(id)?.referral ?? null);
  }
  listForDriver(driverId: string) {
    return Promise.resolve(
      [...this.rows.values()].map((r) => r.referral).filter((r) => r.driverId === driverId),
    );
  }
  listAll() {
    return Promise.resolve([...this.rows.values()].map((r) => r.referral));
  }
  update(referral: Referral) {
    const row = this.rows.get(referral.id);
    if (row !== undefined) row.referral = referral;
    return Promise.resolve();
  }
  eraseDriver(driverId: string) {
    for (const [id, r] of this.rows) if (r.referral.driverId === driverId) this.rows.delete(id);
    return Promise.resolve();
  }
}
