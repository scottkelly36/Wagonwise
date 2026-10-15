import { describe, expect, it } from 'vitest';
import { maskAddress } from './mask-address.js';

describe('maskAddress', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskAddress('dave.kelly@gmail.com')).toBe('d***@gmail.com');
  });

  it('hides something that is not an address altogether', () => {
    expect(maskAddress('not-an-address')).toBe('***');
    expect(maskAddress('@gmail.com')).toBe('***');
  });
});
