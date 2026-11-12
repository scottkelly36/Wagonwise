import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.mapLayers';

/** The kinds of marker the home map can show or hide. */
export const MAP_LAYERS = [
  'hazards',
  'cameras',
  'traffic',
  'parking',
  'fuel',
  'laybys',
  'closures',
] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];
export type MapLayers = Readonly<Record<MapLayer, boolean>>;

const ALL_ON: MapLayers = {
  hazards: true,
  cameras: true,
  traffic: true,
  parking: true,
  fuel: true,
  laybys: true,
  closures: true,
};

export interface MapLayersStore {
  readonly layers: MapLayers;
  restore(): Promise<void>;
  setLayer(layer: MapLayer, shown: boolean): Promise<void>;
}

/** What was saved, read defensively: a layer the saved text does not mention (one added since) is shown. */
export function parseMapLayers(stored: string | null): MapLayers {
  if (stored === null) return ALL_ON;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return ALL_ON;
    const saved = parsed as Record<string, unknown>;
    const layers = { ...ALL_ON };
    for (const layer of MAP_LAYERS) {
      if (typeof saved[layer] === 'boolean') layers[layer] = saved[layer];
    }
    return layers;
  } catch {
    return ALL_ON;
  }
}

/** Which layers the home map shows, kept on the phone: a driver who turned lay-bys off should not have to do it every launch. */
export const useMapLayersStore = create<MapLayersStore>((set, get) => ({
  layers: ALL_ON,

  async restore() {
    try {
      set({ layers: parseMapLayers(await SecureStore.getItemAsync(KEY)) });
    } catch {
      // Unreadable: everything shown, which is what a new driver gets.
    }
  },

  async setLayer(layer, shown) {
    const layers = { ...get().layers, [layer]: shown };
    set({ layers });
    try {
      await SecureStore.setItemAsync(KEY, JSON.stringify(layers));
    } catch {
      // The choice still holds for this session; only remembering it failed.
    }
  },
}));
