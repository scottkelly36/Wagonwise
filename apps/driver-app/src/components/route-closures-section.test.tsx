import { fireEvent, render, screen } from '@testing-library/react-native';
import type { RouteClosureDto } from '@wagonwise/contracts/closures';

import type { ClosureOnRoute } from '../lib/closures-on-route';
import { RouteClosuresSection } from './route-closures-section';

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const item = (id: string, overrides: Partial<RouteClosureDto> = {}): ClosureOnRoute => ({
  closure: {
    id,
    kind: 'full',
    status: 'planned',
    road: 'M56',
    description: 'M56 eastbound carriageway closure',
    startsAt: '2026-11-02T22:00:00.000Z',
    endsAt: '2026-11-03T06:00:00.000Z',
    lanesClosed: 0,
    location: { lat: 53.36, lon: -2.3 },
    updatedAt: '2026-11-02T10:00:00.000Z',
    lines: [],
    ...overrides,
  },
  fromM: 1000,
  toM: 2000,
  routeM: 10_000,
  arrivesAt: new Date('2026-11-02T23:10:00.000Z'),
  mayBeOpen: false,
});

describe('RouteClosuresSection', () => {
  it('says nothing until closures have been fetched, rather than claiming there are none', async () => {
    await render(<RouteClosuresSection items={[]} ready={false} onSelect={jest.fn()} />);
    expect(screen.queryByText('Road closures')).toBeNull();
    expect(screen.queryByTestId('route-closures-none')).toBeNull();
  });

  it('says none were found once they have been fetched and there are none', async () => {
    await render(<RouteClosuresSection items={[]} ready onSelect={jest.fn()} />);
    expect(screen.getByTestId('route-closures-none')).toBeTruthy();
    expect(screen.queryByTestId('route-closure-warning')).toBeNull();
  });

  it('lists a closure with when the driver reaches it, warns that routes do not avoid it, and credits the data', async () => {
    await render(<RouteClosuresSection items={[item('a')]} ready onSelect={jest.fn()} />);
    expect(screen.getByTestId('route-closure-warning')).toBeTruthy();
    expect(screen.getByText('M56 is closed on your route')).toBeTruthy();
    expect(screen.getByText(/^Closed until Tue 3 Nov, 06:00 · you reach it about /)).toBeTruthy();
    expect(screen.getByText("Powered by National Highways' Transport Data Feeds")).toBeTruthy();
  });

  it('does not raise the alarm for lane closures alone', async () => {
    await render(
      <RouteClosuresSection
        items={[item('a', { kind: 'lane', lanesClosed: 1 })]}
        ready
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('route-closure-warning')).toBeNull();
    expect(screen.getByText('M56: a lane is closed on your route')).toBeTruthy();
  });

  it('opens the closure that is tapped', async () => {
    const onSelect = jest.fn();
    await render(<RouteClosuresSection items={[item('a'), item('b')]} ready onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('route-closure-b'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('lists three and counts the rest', async () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id));
    await render(<RouteClosuresSection items={many} ready onSelect={jest.fn()} />);
    expect(screen.getByTestId('route-closure-c')).toBeTruthy();
    expect(screen.queryByTestId('route-closure-d')).toBeNull();
    expect(screen.getByTestId('route-closures-more').props.children).toBe(
      'and 2 more on this route',
    );
  });
});
