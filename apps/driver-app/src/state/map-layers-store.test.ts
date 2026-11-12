import * as SecureStore from 'expo-secure-store';
import { parseMapLayers, useMapLayersStore } from './map-layers-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useMapLayersStore.setState(useMapLayersStore.getInitialState());
});

it('shows every layer until the driver turns one off', () => {
  expect(Object.values(useMapLayersStore.getState().layers).every(Boolean)).toBe(true);
});

it('remembers a layer that was turned off, and brings it back on the next launch', async () => {
  await useMapLayersStore.getState().setLayer('laybys', false);
  expect(useMapLayersStore.getState().layers.laybys).toBe(false);
  const saved = setItemAsync.mock.calls[0]?.[1] as string;

  useMapLayersStore.setState(useMapLayersStore.getInitialState());
  getItemAsync.mockResolvedValue(saved);
  await useMapLayersStore.getState().restore();

  expect(useMapLayersStore.getState().layers.laybys).toBe(false);
  expect(useMapLayersStore.getState().layers.hazards).toBe(true);
});

it('keeps the choice for the session when saving fails, and shows everything when reading fails', async () => {
  setItemAsync.mockRejectedValue(new Error('locked'));
  await useMapLayersStore.getState().setLayer('fuel', false);
  expect(useMapLayersStore.getState().layers.fuel).toBe(false);

  useMapLayersStore.setState(useMapLayersStore.getInitialState());
  getItemAsync.mockRejectedValue(new Error('locked'));
  await useMapLayersStore.getState().restore();
  expect(useMapLayersStore.getState().layers.fuel).toBe(true);
});

it('shows a layer the saved text does not mention, and ignores text that is not ours', () => {
  expect(parseMapLayers('{"fuel":false}')).toMatchObject({ fuel: false, hazards: true });
  expect(parseMapLayers('not json').fuel).toBe(true);
  expect(parseMapLayers('"a string"').fuel).toBe(true);
  expect(parseMapLayers('{"fuel":"no"}').fuel).toBe(true);
});
