import { err, ok, type Result } from '../../../../shared/result.js';
import type {
  InvalidIdToken,
  ProviderNotConfigured,
  SocialProvider,
  VerifiedIdentity,
} from '../../domain/federated-identity.js';
import type { IdTokenVerifier } from '../ports/id-token-verifier.js';

/** Knows a fixed set of tokens, keyed "provider:token". Any other token is invalid. A provider can be marked unconfigured. */
export class FakeIdTokenVerifier implements IdTokenVerifier {
  readonly tokens = new Map<string, VerifiedIdentity>();
  readonly unconfigured = new Set<SocialProvider>();

  verify(
    provider: SocialProvider,
    idToken: string,
  ): Promise<Result<VerifiedIdentity, InvalidIdToken | ProviderNotConfigured>> {
    if (this.unconfigured.has(provider)) {
      return Promise.resolve(err({ tag: 'ProviderNotConfigured' }));
    }
    const identity = this.tokens.get(`${provider}:${idToken}`);
    return Promise.resolve(identity ? ok(identity) : err({ tag: 'InvalidIdToken' }));
  }
}
