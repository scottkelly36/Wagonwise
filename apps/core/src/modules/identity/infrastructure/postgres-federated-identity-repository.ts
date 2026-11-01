import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { FederatedIdentityRepository } from '../application/ports/federated-identity-repository.js';
import type { DriverId } from '../domain/driver.js';
import type { FederatedIdentity, SocialProvider } from '../domain/federated-identity.js';
import type { UntypedDb } from './db.js';

interface FederatedRow {
  readonly provider: SocialProvider;
  readonly subject: string;
  readonly driver_id: string;
  readonly email: string | null;
  readonly created_at: Date;
}

function toDomain(row: FederatedRow): FederatedIdentity {
  return {
    provider: row.provider,
    subject: row.subject,
    driverId: makeId<'DriverId'>(row.driver_id),
    email: row.email ?? undefined,
    createdAt: row.created_at,
  };
}

/** Raw `sql`, as the other repositories here (see `postgres-driver-repository.ts`). */
export class PostgresFederatedIdentityRepository implements FederatedIdentityRepository {
  constructor(private readonly db: UntypedDb) {}

  async find(provider: SocialProvider, subject: string): Promise<FederatedIdentity | null> {
    const { rows } = await sql<FederatedRow>`
      select provider, subject, driver_id, email, created_at
      from identity.federated_identities
      where provider = ${provider} and subject = ${subject}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(identity: FederatedIdentity): Promise<void> {
    await sql`
      insert into identity.federated_identities (provider, subject, driver_id, email, created_at)
      values (
        ${identity.provider}, ${identity.subject}, ${identity.driverId},
        ${identity.email ?? null}, ${identity.createdAt}
      )
      on conflict (provider, subject) do update set
        driver_id = excluded.driver_id,
        email = excluded.email
    `.execute(this.db);
  }

  async deleteForDriver(driverId: DriverId): Promise<void> {
    await sql`delete from identity.federated_identities where driver_id = ${driverId}`.execute(
      this.db,
    );
  }
}
