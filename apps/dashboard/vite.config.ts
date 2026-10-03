import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // MapLibre starts its tile-decoding worker from a URL inside its own package; Vite's dependency
  // pre-bundling moves the main file and leaves that URL pointing nowhere ("Worker failed to load"),
  // so the library is served as-is in dev. The production build is unaffected.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
