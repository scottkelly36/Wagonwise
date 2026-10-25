import { namesText, outcomeText, positionText, readOutText } from './sos-messages';

const acme = '11111111-1111-4111-8111-111111111111';
const beta = '22222222-2222-4222-8222-222222222222';

describe('readOutText', () => {
  it('gives the three words, or the position when there are none', () => {
    const location = { lat: 54.9731, lon: -2.1013 };
    expect(readOutText({ words: 'filled.count.soap', location })).toBe('///filled.count.soap');
    expect(readOutText({ words: undefined, location })).toBe('54.97310, -2.10130');
    expect(positionText(location)).toBe('54.97310, -2.10130');
  });
});

describe('namesText', () => {
  it('reads as a sentence', () => {
    expect(namesText([])).toBe('');
    expect(namesText(['Acme'])).toBe('Acme');
    expect(namesText(['Acme', 'Beta'])).toBe('Acme and Beta');
    expect(namesText(['Acme', 'Beta', 'Gamma'])).toBe('Acme, Beta and Gamma');
  });
});

describe('outcomeText', () => {
  it('says who was told, and that nobody was for a driver with no company', () => {
    expect(outcomeText({ notified: [{ companyId: acme, name: 'Acme Haulage' }] } as never)).toBe(
      'Acme Haulage has been told where you are, with your name, number and vehicle.',
    );
    expect(
      outcomeText({
        notified: [
          { companyId: acme, name: 'Acme' },
          { companyId: beta, name: 'Beta' },
        ],
      } as never),
    ).toMatch(/^Acme and Beta have been told/);
    expect(outcomeText({ notified: [] })).toMatch(/^Nobody was told/);
  });
});
