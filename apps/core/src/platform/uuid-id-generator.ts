import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../shared/ports/id-generator.js';

export class UuidIdGenerator implements IdGenerator {
  newId(): string {
    return randomUUID();
  }
}
