/** The one place this app reads Vite's env — mirrors driver-app's own `config.ts` (that one
 *  reads `process.env.EXPO_PUBLIC_*`, inlined by Metro; Vite inlines `import.meta.env.VITE_*`
 *  the same way, just under its own bundler's convention). Defaults to the BFF's own local-dev
 *  port with zero configuration needed, same as every other app in this monorepo. */
export const bffUrl: string = import.meta.env.VITE_BFF_URL ?? 'http://localhost:3002';
