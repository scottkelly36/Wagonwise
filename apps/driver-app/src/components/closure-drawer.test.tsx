import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ClosureDto } from '@wagonwise/contracts/closures';

import { ClosureDrawer } from './closure-drawer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const closure = (overrides: Partial<ClosureDto> = {}): ClosureDto => ({
  id: 'rec-1',
  kind: 'full',
  status: 'planned',
  road: 'M56',
  direction: 'eastBound',
  description: 'M56 eastbound jct 7 to 6 carriageway closure',
  locationText: 'M56 eastbound between J7 and J6',
  cause: 'maintenanceWork',
  startsAt: hoursFromNow(5),
  endsAt: hoursFromNow(13),
  lanesClosed: 0,
  location: { lat: 53.36, lon: -2.3 },
  distanceM: 800,
  updatedAt: hoursFromNow(-2),
  ...overrides,
});

describe('ClosureDrawer', () => {
  it('shows nothing about a closure while none is picked', async () => {
    await render(<ClosureDrawer closure={undefined} onClose={jest.fn()} />);
    expect(screen.queryByTestId('closure-description')).toBeNull();
  });

  it('shows a planned closure: what National Highways says, what is shut, when it starts and how long it lasts', async () => {
    await render(<ClosureDrawer closure={closure()} onClose={jest.fn()} />);
    expect(screen.getByText('M56 closure')).toBeTruthy();
    expect(screen.getByTestId('closure-status').props.children).toBe('Planned');
    expect(screen.getByTestId('closure-description').props.children).toBe(
      'M56 eastbound jct 7 to 6 carriageway closure',
    );
    expect(screen.getByText('Road closed to all traffic')).toBeTruthy();
    expect(screen.getByText(/^Starts /)).toBeTruthy();
    expect(screen.getByText('Lasts 8 hours')).toBeTruthy();
    expect(screen.getByText('M56 eastbound between J7 and J6')).toBeTruthy();
    expect(screen.getByText(/Eastbound · Maintenance work · /)).toBeTruthy();
    expect(screen.getByText(/Always follow the road signs/)).toBeTruthy();
    expect(screen.getByText("Powered by National Highways' Transport Data Feeds")).toBeTruthy();
    expect(screen.queryByTestId('closure-window-note')).toBeNull();
  });

  it('shows one in force with how long is left, and lanes rather than the whole road', async () => {
    await render(
      <ClosureDrawer
        closure={closure({
          kind: 'lane',
          status: 'active',
          lanesClosed: 2,
          startsAt: hoursFromNow(-3),
          endsAt: hoursFromNow(5),
          road: 'M6',
        })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('M6 lane closure')).toBeTruthy();
    expect(screen.getByTestId('closure-status').props.children).toBe('In force now');
    expect(screen.getByText('2 lanes closed')).toBeTruthy();
    expect(screen.getByText(/^Until /)).toBeTruthy();
    expect(screen.getByText('About 5 hours left')).toBeTruthy();
  });

  it('says a long window is not a long closure', async () => {
    await render(
      <ClosureDrawer
        closure={closure({ startsAt: hoursFromNow(-60), endsAt: hoursFromNow(24) })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('closure-window-note')).toBeTruthy();
  });

  it('closes from the button', async () => {
    const onClose = jest.fn();
    await render(<ClosureDrawer closure={closure()} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('closure-drawer-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
