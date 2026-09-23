const MAPLIBRE_DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

/**
 * The design doc (§6) named MapTiler/Stadia as candidates but never picked one; the user chose
 * MapTiler (2026-09-23), but getting a real API key is a one-time, interactive account-creation
 * step only they can do. Falling back to MapLibre's own free, keyless demo style means this
 * screen renders a genuine map with no `.env` at all — the same "cold start needs no
 * undocumented step" convention every other config value in this monorepo follows — rather than
 * a blank screen with no way to tell whether the map code itself is even working. Once
 * `EXPO_PUBLIC_MAPTILER_API_KEY` is set, MapTiler's own style takes over automatically.
 */
export function mapStyleUrl(maptilerApiKey: string | undefined): string {
  if (!maptilerApiKey) {
    return MAPLIBRE_DEMO_STYLE_URL;
  }
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerApiKey}`;
}
