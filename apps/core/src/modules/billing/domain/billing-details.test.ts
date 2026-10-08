import { describe, expect, it } from 'vitest';
import {
  placeholderFields,
  validateBillingDetails,
  type BillingDetails,
} from './billing-details.js';

const real: BillingDetails = {
  tradingName: 'WagonWise Ltd',
  address: '1 High Street, Hexham NE46 1AA',
  contactEmail: 'billing@example.com',
  paymentDetails: 'Sort code 00-00-00, account 00000000',
  vatStatus: 'Not VAT registered',
  paymentTerms: '14 days',
};

describe('placeholderFields', () => {
  it('is empty once every field is real', () => {
    expect(placeholderFields(real)).toEqual([]);
  });

  it('names each field still holding a [bracketed] placeholder', () => {
    expect(
      placeholderFields({
        ...real,
        tradingName: '[Trading name]',
        paymentTerms: 'Within [x] days',
      }),
    ).toEqual(['tradingName', 'paymentTerms']);
  });

  it('treats the seeded VAT placeholder, which quotes a phrase, as a placeholder', () => {
    expect(
      placeholderFields({ ...real, vatStatus: '[VAT number, or "Not VAT registered"]' }),
    ).toEqual(['vatStatus']);
  });
});

describe('validateBillingDetails', () => {
  it('trims every field', () => {
    const result = validateBillingDetails({ ...real, tradingName: '  WagonWise Ltd  ' });
    expect(result.ok && result.value.tradingName).toBe('WagonWise Ltd');
  });

  it('names the fields that are empty or too long', () => {
    const result = validateBillingDetails({
      ...real,
      address: '   ',
      paymentTerms: 'x'.repeat(201),
    });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidBillingDetails', fields: ['address', 'paymentTerms'] },
    });
  });
});
