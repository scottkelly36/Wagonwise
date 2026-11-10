import { describe, expect, it } from 'vitest';
import {
  chargesOnRoute,
  possibleAxles,
  priceFor,
  TOLL_CROSSINGS,
  type TollCrossing,
} from './tolls.js';

const crossing = (id: string): TollCrossing => {
  const found = TOLL_CROSSINGS.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no crossing ${id}`);
  return found;
};
const weight = (grossWeightT: number) => ({ grossWeightT });

describe('possibleAxles', () => {
  it('has two for a light rigid, either for the middle weights, and three or more for a heavy one', () => {
    expect(possibleAxles(7.5)).toEqual(['two']);
    expect(possibleAxles(12)).toEqual(['two', 'three-or-more']);
    expect(possibleAxles(18)).toEqual(['two', 'three-or-more']);
    expect(possibleAxles(18.1)).toEqual(['three-or-more']);
    expect(possibleAxles(44)).toEqual(['three-or-more']);
  });
});

describe('priceFor', () => {
  it('prices a 44 tonne artic at the Dartford class for more than two axles', () => {
    expect(priceFor(crossing('dartford'), weight(44))).toEqual({ lowGBP: 8.4, highGBP: 8.4 });
  });

  it('prices a 7.5 tonne rigid at the two-axle class', () => {
    expect(priceFor(crossing('dartford'), weight(7.5))).toEqual({ lowGBP: 4.2, highGBP: 4.2 });
  });

  it('gives a range when the weight could be two axles or more', () => {
    expect(priceFor(crossing('dartford'), weight(18))).toEqual({ lowGBP: 4.2, highGBP: 8.4 });
  });

  it('prices by weight where the operator does, so the Mersey class is settled whatever the axles', () => {
    expect(priceFor(crossing('mersey-gateway'), weight(7.5))).toEqual({
      lowGBP: 7.2,
      highGBP: 7.2,
    });
    expect(priceFor(crossing('mersey-gateway'), weight(12))).toEqual({ lowGBP: 7.2, highGBP: 7.2 });
    expect(priceFor(crossing('mersey-gateway'), weight(26))).toEqual({ lowGBP: 9.6, highGBP: 9.6 });
  });

  it('gives no price below the weights a goods tariff covers, rather than a wrong one', () => {
    expect(priceFor(crossing('mersey-gateway'), weight(3.5))).toBeUndefined();
    expect(priceFor(crossing('tyne-tunnel'), weight(3.5))).toBeUndefined();
  });

  it('gives no price for a Humber band that was not read, but prices the one that was', () => {
    expect(priceFor(crossing('humber-bridge'), weight(44))).toEqual({ lowGBP: 15, highGBP: 15 });
    expect(priceFor(crossing('humber-bridge'), weight(6))).toEqual({ lowGBP: 5, highGBP: 5 });
    // A 7.5 tonne rigid and an 18 tonne one sit between the two bands that were read.
    expect(priceFor(crossing('humber-bridge'), weight(7.5))).toBeUndefined();
    expect(priceFor(crossing('humber-bridge'), weight(18))).toBeUndefined();
  });

  it('prices the M6 Toll by axles, and the Tyne Tunnel at its one figure', () => {
    expect(priceFor(crossing('m6-toll'), weight(44))).toEqual({ lowGBP: 20.9, highGBP: 20.9 });
    expect(priceFor(crossing('m6-toll'), weight(7.5))).toEqual({ lowGBP: 20.2, highGBP: 20.2 });
    expect(priceFor(crossing('tyne-tunnel'), weight(44))).toEqual({ lowGBP: 4.8, highGBP: 4.8 });
  });
});

describe('chargesOnRoute', () => {
  const dartford = [{ lat: 51.4567, lon: 0.2474 }];
  const m6 = [{ lat: 52.65, lon: -1.9 }];

  it('names the crossing a tolled stretch is on, with its price for the vehicle', () => {
    const charges = chargesOnRoute(dartford, weight(44));
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({
      id: 'dartford',
      name: 'Dartford Crossing',
      lowGBP: 8.4,
      highGBP: 8.4,
    });
    expect(charges[0]?.payBy).toMatch(/midnight/);
  });

  it('lists the crossings in the order the route meets them', () => {
    const there = chargesOnRoute([...m6, ...dartford], weight(44));
    const back = chargesOnRoute([...dartford, ...m6], weight(44));
    expect(there.map((c) => c.id)).toEqual(['m6-toll', 'dartford']);
    expect(back.map((c) => c.id)).toEqual(['dartford', 'm6-toll']);
  });

  it('names a crossing once however many of its points the route has', () => {
    expect(
      chargesOnRoute(
        [...dartford, { lat: 51.458, lon: 0.25 }, { lat: 51.46, lon: 0.255 }],
        weight(44),
      ),
    ).toHaveLength(1);
  });

  it('says nothing for a toll the table does not know, or for no toll', () => {
    expect(chargesOnRoute([{ lat: 50.4, lon: -4.2 }], weight(44))).toEqual([]);
    expect(chargesOnRoute([], weight(44))).toEqual([]);
  });

  it('keeps the name but no price when the vehicle falls in a class that was not read', () => {
    const [humber] = chargesOnRoute([{ lat: 53.7068, lon: -0.4501 }], weight(7.5));
    expect(humber?.name).toBe('Humber Bridge');
    expect(humber).not.toHaveProperty('lowGBP');
    expect(humber).not.toHaveProperty('highGBP');
  });

  it('puts a range on the charge when the axles are not known', () => {
    expect(chargesOnRoute(dartford, weight(18))[0]).toMatchObject({ lowGBP: 4.2, highGBP: 8.4 });
  });

  it('matches the Mersey Gateway by either bridge', () => {
    expect(chargesOnRoute([{ lat: 53.3523, lon: -2.7126 }], weight(26))[0]?.id).toBe(
      'mersey-gateway',
    );
    expect(chargesOnRoute([{ lat: 53.3459, lon: -2.7381 }], weight(26))[0]?.id).toBe(
      'mersey-gateway',
    );
  });
});

describe('the table itself', () => {
  it('gives every crossing a source page, a day it was read, somewhere to look and a tariff', () => {
    for (const c of TOLL_CROSSINGS) {
      expect(c.sourceUrl).toMatch(/^https:\/\//);
      expect(c.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(c.checkedOn))).toBe(false);
      expect(c.near.length).toBeGreaterThan(0);
      expect(c.radiusM).toBeGreaterThan(0);
      expect(c.tariffs.length).toBeGreaterThan(0);
      expect(c.tariffs.every((t) => t.amountGBP > 0)).toBe(true);
    }
  });

  it('has no two crossings with the same id', () => {
    const ids = TOLL_CROSSINGS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
