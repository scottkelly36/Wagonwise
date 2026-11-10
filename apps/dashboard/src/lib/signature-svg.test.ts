import { describe, expect, it } from 'vitest';
import { signaturePath, signatureSvg } from './signature-svg';

describe('signaturePath', () => {
  it('moves to the first point of each stroke and draws lines through the rest', () => {
    expect(
      signaturePath([
        [
          [1, 2],
          [30, 40],
          [50, 60],
        ],
        [
          [100, 100],
          [120, 90],
        ],
      ]),
    ).toBe('M1 2L30 40L50 60M100 100L120 90');
  });

  it('draws a single point as a tiny line so it shows as a dot', () => {
    expect(signaturePath([[[10, 20]]])).toBe('M10 20L10.1 20');
  });
});

describe('signatureSvg', () => {
  it('is a standalone svg with the path and an escaped label', () => {
    const svg = signatureSvg(
      [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      'Signed by "A" <b>',
    );
    expect(svg).toContain('viewBox="0 0 1000 500"');
    expect(svg).toContain('d="M1 2L3 4"');
    expect(svg).toContain('aria-label="Signed by &quot;A&quot; &lt;b>"');
    expect(svg).not.toContain('<b>');
  });
});
