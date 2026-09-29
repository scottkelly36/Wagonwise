import { createStaffTokenVerifier } from './auth/staff-token-verifier.js';
import { ConfigError, loadConfig } from './config.js';
import { createCoreClient } from './core-client.js';
import { buildApp } from './host/build-app.js';
import { registerDashboardRoutes } from './dashboard-routes.js';
import { registerStaffRoutes } from './staff-routes.js';

function bootConfig() {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = bootConfig();
const app = buildApp(config);

const routeDeps = {
  coreClient: createCoreClient(config.coreInternalUrl, config.coreInternalKey),
  staffTokenVerifier: createStaffTokenVerifier(config.coreInternalUrl, config.coreInternalKey),
};
registerStaffRoutes(app, routeDeps);
registerDashboardRoutes(app, routeDeps);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'error during shutdown');
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exit(1);
}
