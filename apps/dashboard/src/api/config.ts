/** The one place this app reads Vite's env — mirrors driver-app's own `config.ts` (that one
 *  reads `process.env.EXPO_PUBLIC_*`, inlined by Metro; Vite inlines `import.meta.env.VITE_*`
 *  the same way, just under its own bundler's convention). The staff BFF (P2-M1.9) is the
 *  dashboard's only back end since P2-M1.12c; defaults to its local-dev port. */
export const staffBffUrl: string = import.meta.env.VITE_STAFF_BFF_URL ?? 'http://localhost:3003';
