import type { Result } from '../../../../shared/result.js';
import type {
  InvalidIdToken,
  ProviderNotConfigured,
  SocialProvider,
  VerifiedIdentity,
} from '../../domain/federated-identity.js';

/** Checks a Google or Apple ID token (the signed proof the phone gets from the provider's sign-in) and says who it is for. */
export interface IdTokenVerifier {
  verify(
    provider: SocialProvider,
    idToken: string,
  ): Promise<Result<VerifiedIdentity, InvalidIdToken | ProviderNotConfigured>>;
}
