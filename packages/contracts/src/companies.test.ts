import { describe, expect, it } from 'vitest';
import {
  companySchema,
  createCompanyRequestSchema,
  listCompaniesResponseSchema,
} from './companies.js';

describe('createCompanyRequestSchema', () => {
  it('accepts an id and a non-empty name', () => {
    const result = createCompanyRequestSchema.safeParse({ id: 'company-1', name: 'Acme Haulage' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = createCompanyRequestSchema.safeParse({ id: 'company-1', name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing id', () => {
    const result = createCompanyRequestSchema.safeParse({ name: 'Acme Haulage' });
    expect(result.success).toBe(false);
  });
});

describe('companySchema', () => {
  it('parses a real response shape', () => {
    const result = companySchema.safeParse({
      id: 'company-1',
      name: 'Acme Haulage',
      createdAt: '2026-09-27T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('listCompaniesResponseSchema', () => {
  it('parses a list of companies', () => {
    const result = listCompaniesResponseSchema.safeParse({
      companies: [{ id: 'company-1', name: 'Acme Haulage', createdAt: '2026-09-27T08:00:00.000Z' }],
    });
    expect(result.success).toBe(true);
  });

  it('parses an empty list', () => {
    const result = listCompaniesResponseSchema.safeParse({ companies: [] });
    expect(result.success).toBe(true);
  });
});
