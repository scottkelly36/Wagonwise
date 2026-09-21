import { describe, expect, it } from 'vitest';
import { andThen, err, map, mapError, ok, type Result, type TaggedError } from './result.js';

type TooTall = TaggedError<'VehicleTooTall'> & { readonly limitM: number };
type NoRoute = TaggedError<'NoRoute'>;

describe('Result', () => {
  it('ok carries a value and err carries an error', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('nope')).toEqual({ ok: false, error: 'nope' });
  });

  it('narrows on the ok discriminant', () => {
    const result = ok(3) as Result<number, string>;
    if (result.ok) {
      expect(result.value + 1).toBe(4);
    } else {
      expect.unreachable();
    }
  });

  describe('map', () => {
    it('transforms a success', () => {
      expect(map(ok(2), (n) => n * 10)).toEqual(ok(20));
    });

    it('leaves a failure untouched and never calls the function', () => {
      let called = false;
      const failure: Result<number, string> = err('bad');
      const result = map(failure, (n) => {
        called = true;
        return n;
      });
      expect(result).toEqual(err('bad'));
      expect(called).toBe(false);
    });
  });

  describe('mapError', () => {
    it('transforms a failure', () => {
      const failure: Result<number, string> = err('bad');
      expect(mapError(failure, (e) => e.toUpperCase())).toEqual(err('BAD'));
    });

    it('leaves a success untouched', () => {
      const success: Result<number, string> = ok(1);
      expect(mapError(success, (e) => e.toUpperCase())).toEqual(ok(1));
    });
  });

  describe('andThen', () => {
    const checkHeight = (heightM: number): Result<number, TooTall> =>
      heightM > 4 ? err({ tag: 'VehicleTooTall', limitM: 4 }) : ok(heightM);
    const plan = (heightM: number): Result<string, NoRoute> =>
      heightM > 3 ? err({ tag: 'NoRoute' }) : ok(`route for ${heightM}m`);

    it('chains two steps that can each fail, widening the error to a union', () => {
      const chained: Result<string, TooTall | NoRoute> = andThen(checkHeight(2.5), plan);
      expect(chained).toEqual(ok('route for 2.5m'));
    });

    it('short-circuits on the first failure', () => {
      expect(andThen(checkHeight(4.5), plan)).toEqual(err({ tag: 'VehicleTooTall', limitM: 4 }));
    });

    it('surfaces the second step failure', () => {
      expect(andThen(checkHeight(3.5), plan)).toEqual(err({ tag: 'NoRoute' }));
    });
  });
});
