import { renderHook } from '@testing-library/react-native';

import { useNearbyHazards } from '../api/use-hazards';
import type { RouteOptionLine } from '../components/route-map';
import { useRouteOptionHazards } from './use-route-option-hazards';

jest.mock('../api/use-hazards', () => ({ useNearbyHazards: jest.fn() }));

const nearby = jest.mocked(useNearbyHazards);

// Two routes between the same two places: the first runs along the equator, the second runs a kilometre north of it.
const lines: RouteOptionLine[] = [
  {
    id: '0',
    color: '#000',
    line: [
      [0, 0],
      [0.02, 0],
    ],
  },
  {
    id: '1',
    color: '#000',
    line: [
      [0, 0.01],
      [0.02, 0.01],
    ],
  },
];

const hazard = (id: string, lat: number, lon: number, type = 'low_bridge') =>
  ({ id, type, location: { lat, lon } }) as never;

function answer(data: unknown): void {
  nearby.mockReturnValue({ data } as ReturnType<typeof useNearbyHazards>);
}

describe('useRouteOptionHazards', () => {
  it('counts the hazards on each route, not the ones on the next street over', async () => {
    answer([
      hazard('a', 0, 0.01),
      hazard('b', 0.01, 0.015),
      hazard('c', 0.01, 0.005),
      hazard('away', 0.005, 0.01),
    ]);
    const { result } = await renderHook(() => useRouteOptionHazards(lines));
    expect(result.current.counts).toEqual([1, 2]);
    expect(result.current.shown.map((h) => h.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('leaves speed cameras out of the count', async () => {
    answer([hazard('a', 0, 0.01), hazard('cam', 0, 0.012, 'speed_camera')]);
    const { result } = await renderHook(() => useRouteOptionHazards(lines));
    expect(result.current.counts).toEqual([1, 0]);
  });

  it('has no counts until the hazards are known', async () => {
    answer(undefined);
    const { result } = await renderHook(() => useRouteOptionHazards(lines));
    expect(result.current.counts).toBeUndefined();
    expect(result.current.shown).toEqual([]);
  });

  it('asks for nothing until there are routes', async () => {
    answer(undefined);
    await renderHook(() => useRouteOptionHazards(undefined));
    expect(nearby).toHaveBeenLastCalledWith([], 750);
  });

  it('asks along every route, so a hazard on either is found', async () => {
    answer([]);
    await renderHook(() => useRouteOptionHazards(lines));
    const [corridor] = nearby.mock.calls.at(-1) ?? [];
    expect(corridor?.length).toBe(4);
  });
});
