import { act, render, screen } from '@testing-library/react-native';

import { useConnectionStore } from '../state/connection-store';
import { NoSignalChip } from './no-signal-chip';

beforeEach(() => useConnectionStore.setState({ offline: false }));

describe('the no-signal chip', () => {
  it('shows nothing while the phone can reach WagonWise', async () => {
    await render(<NoSignalChip />);
    expect(screen.queryByTestId('no-signal-chip')).toBeNull();
  });

  it('says so with no signal, and goes by itself when signal is back', async () => {
    useConnectionStore.setState({ offline: true });
    await render(<NoSignalChip />);
    expect(screen.getByText('No signal')).toBeTruthy();
    await act(async () => useConnectionStore.getState().setOffline(false));
    expect(screen.queryByTestId('no-signal-chip')).toBeNull();
  });
});
