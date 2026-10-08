import { setWorkerUrl } from 'maplibre-gl';
// `?worker&url` makes Vite bundle MapLibre's tile-decoding worker, with the shared file it imports, into
// the build and hand back its address. Left alone, MapLibre 6 looks for `maplibre-gl-worker.mjs` next to
// the page's own script; the build does not contain it, the host answers with the home page, the worker
// never starts, and the map draws its background and nothing else.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
