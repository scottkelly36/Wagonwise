import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { Transaction } from '../../../shared/ports/unit-of-work.js';
import type { CredentialRepository } from '../application/ports/credential-repository.js';
import type { DriverId } from '../domain/driver.js';
import type { DriverCredential } from '../domain/password.js';
import type { UntypedDb } from './db.js';

interface CredentialRow {
  readonly driver_id: string;
  readonly password_hash: string;
  readonly failed_attempts: number;
  readonly locked_until: Date | null;
  readonly updated_at: Date;
}

function toDomain(row: CredentialRow): DriverCredential {
  return {
    driverId: makeId<'DriverId'>(row.driver_id),
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    updatedAt: row.updated_at,
  };
}

/** Raw `sql`, as the other repositories here (see `postgres-driver-repository.ts`). */
export class PostgresCredentialRepository implements CredentialRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByDriverId(driverId: DriverId): Promise<DriverCredential | null> {
    const { rows } = await sql<CredentialRow>`
      select driver_id, password_hash, failed_attempts, locked_until, updated_at
      from identity.driver_credentials where driver_id = ${driverId}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(credential: DriverCredential, tx?: Transaction): Promise<void> {
    const executor = tx ? (tx as unknown as UntypedDb) : this.db;
    await sql`
      insert into identity.driver_credentials
        (driver_id, password_hash, failed_attempts, locked_until, updated_at)
      values (
        ${credential.driverId}, ${credential.passwordHash}, ${credential.failedAttempts},
        ${credential.lockedUntil}, ${credential.updatedAt}
      )
      on conflict (driver_id) do update set
        password_hash = excluded.password_hash,
        failed_attempts = excluded.failed_attempts,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    `.execute(executor);
  }

  async deleteForDriver(driverId: DriverId): Promise<void> {
    await sql`delete from identity.driver_credentials where driver_id = ${driverId}`.execute(
      this.db,
    );
  }
}
