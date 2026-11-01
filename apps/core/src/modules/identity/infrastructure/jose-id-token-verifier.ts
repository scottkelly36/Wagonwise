import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { err, ok, type Result } from '../../../shared/result.js';
import type {
  InvalidIdToken,
  ProviderNotConfigured,
  SocialProvider,
  VerifiedIdentity,
} from '../domain/federated-identity.js';
import type { IdTokenVerifier } from '../application/ports/id-token-verifier.js';

interface ProviderSettings {
  /** What the token's `iss` must be. Google writes it two ways. */
  readonly issuers: readonly string[];
  /** Where the provider publishes the public keys its tokens are signed with. */
  readonly keysUrl: string;
}

const PROVIDERS: Record<SocialProvider, ProviderSettings> = {
  google: {
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    keysUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  apple: {
    issuers: ['https://appleid.apple.com'],
    keysUrl: 'https://appleid.apple.com/auth/keys',
  },
};

export interface JoseIdTokenVerifierOptions {
  /** Our app's client ids at Google (the web client, and the Android and iOS ones). A token is accepted only if made for one of these. */
  readonly googleClientIds: readonly string[];
  /** Our app's identifiers at Apple (the app's bundle id). */
  readonly appleClientIds: readonly string[];
  /** Where to get keys instead of the providers' own published ones. For tests. */
  readonly keys?: Partial<Record<SocialProvider, JWTVerifyGetKey>>;
}

/**
 * Checks a Google or Apple ID token with `jose`: the signature against the provider's published keys (fetched once and cached by
 * `createRemoteJWKSet`), the issuer, that it was made for this app (the audience), and that it has not expired. A provider with no client id set
 * answers `ProviderNotConfigured`, so it is simply off until it is set up.
 */
export class JoseIdTokenVerifier implements IdTokenVerifier {
  readonly #keys: Partial<Record<SocialProvider, JWTVerifyGetKey>>;

  constructor(private readonly options: JoseIdTokenVerifierOptions) {
    this.#keys = { ...options.keys };
  }

  async verify(
    provider: SocialProvider,
    idToken: string,
  ): Promise<Result<VerifiedIdentity, InvalidIdToken | ProviderNotConfigured>> {
    const clientIds =
      provider === 'google' ? this.options.googleClientIds : this.options.appleClientIds;
    if (clientIds.length === 0) return err({ tag: 'ProviderNotConfigured' });
    const settings = PROVIDERS[provider];
    const getKey = (this.#keys[provider] ??= createRemoteJWKSet(new URL(settings.keysUrl)));

    try {
      const { payload } = await jwtVerify(idToken, getKey, {
        issuer: [...settings.issuers],
        audience: [...clientIds],
        algorithms: ['RS256', 'ES256'],
      });
      if (typeof payload.sub !== 'string' || payload.sub === '')
        return err({ tag: 'InvalidIdToken' });
      const verified = payload.email_verified === true || payload.email_verified === 'true';
      return ok({
        subject: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        emailVerified: verified,
      });
    } catch {
      // A bad signature, the wrong issuer or audience, an expired token, junk, or the provider's keys being unreachable: the same to the
      // caller, which does not need to know which.
      return err({ tag: 'InvalidIdToken' });
    }
  }
}
