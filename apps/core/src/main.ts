import { ConfigError, loadConfig } from './config.js';
import { composeCore } from './composition/compose-core.js';

function bootConfig() {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // No logger exists yet — the logger's level comes from the config that just failed.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = bootConfig();
const { app } = composeCore(config);

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
