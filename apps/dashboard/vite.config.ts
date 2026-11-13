import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { contentSecurityPolicy } from './src/lib/content-security-policy.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      {
        // Only in the built page: the dev server needs inline scripts for hot reload.
        name: 'portal-content-security-policy',
        apply: 'build',
        transformIndexHtml: () => [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: contentSecurityPolicy(env.VITE_STAFF_BFF_URL ?? 'http://localhost:3003'),
            },
            injectTo: 'head-prepend' as const,
          },
        ],
      },
    ],
    // MapLibre starts its tile-decoding worker from a URL inside its own package; Vite's dependency
    // pre-bundling moves the main file and leaves that URL pointing nowhere ("Worker failed to load"),
    // so the library is served as-is in dev. The production build is unaffected.
    optimizeDeps: { exclude: ['maplibre-gl'] },
  };
});
