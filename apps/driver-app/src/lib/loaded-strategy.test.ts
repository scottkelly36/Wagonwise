import { useLoadStore } from '../state/load-store';
import { loadedStrategy } from './loaded-strategy';

it('is nothing for an empty vehicle, so a request is exactly what it was', () => {
  useLoadStore.setState({ loaded: false });
  expect(loadedStrategy()).toEqual({});
});

it('is the gentle strategy for a loaded one', () => {
  useLoadStore.setState({ loaded: true });
  expect(loadedStrategy()).toEqual({ strategy: 'gentle' });
});
