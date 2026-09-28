import { PRIVILEGES as CONTRACT_PRIVILEGES } from '@wagonwise/contracts/staff';
import { describe, expect, it } from 'vitest';
import { PRIVILEGES as DOMAIN_PRIVILEGES } from '../domain/staff-account.js';

// The domain can't import contracts (AGENTS.md rule 2), so it keeps its own copy of the
// privilege list. This is the check that the two never drift apart.
describe('privilege list', () => {
  it('is identical in the domain and in packages/contracts', () => {
    expect([...DOMAIN_PRIVILEGES]).toEqual([...CONTRACT_PRIVILEGES]);
  });
});
