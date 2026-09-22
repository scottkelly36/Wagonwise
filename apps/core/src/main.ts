import { ConfigError, loadConfig } from './config.js';
import { composeCore } from './composition/compose-core.js';
import { createTokenSigner } from './modules/identity/api.js';

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
// Built once, outside composeCore, because building one is async (key generation/import) and
// composeCore is not (compose-core.ts's doc comment explains why).
const tokenSigner = await createTokenSigner(config.identityPrivateKeyPem);
const core = composeCore(config, tokenSigner);
const { app } = core;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    core.close().then(
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
