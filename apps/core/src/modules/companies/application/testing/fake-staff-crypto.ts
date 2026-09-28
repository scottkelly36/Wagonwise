import type { CodeSender } from '../ports/code-sender.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RandomCodes } from '../ports/random-codes.js';
import type { SecretBox } from '../ports/secret-box.js';
import type { StaffTokenIssuer } from '../ports/staff-token-issuer.js';
import type { Totp } from '../ports/totp.js';
import type { StaffAccount } from '../../domain/staff-account.js';
import type { StaffSessionId } from '../../domain/staff-session.js';

/** Readable, deterministic fakes for the staff crypto ports: tests assert on exact values. */

export class FakePasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }

  verify(password: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${password}`);
  }
}

export class FakeSecretBox implements SecretBox {
  encrypt(plaintext: string): string {
    return `sealed:${plaintext}`;
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith('sealed:')) throw new Error('not sealed');
    return ciphertext.slice('sealed:'.length);
  }
}

/** Accepts exactly the code set with `currentCode`, for any secret. */
export class FakeTotp implements Totp {
  currentCode = '424242';
  readonly secret = 'FAKESECRET';

  generateSecret(): string {
    return this.secret;
  }

  provisioningUri(secret: string, account: string): string {
    return `otpauth://totp/WagonWise:${account}?secret=${secret}`;
  }

  verify(_secret: string, code: string): boolean {
    return code === this.currentCode;
  }
}

export class RecordingCodeSender implements CodeSender {
  readonly sent: { destination: string; code: string }[] = [];
  fail = false;

  send(destination: string, code: string): Promise<void> {
    if (this.fail) return Promise.reject(new Error('delivery failed'));
    this.sent.push({ destination, code });
    return Promise.resolve();
  }

  lastCodeFor(destination: string): string | undefined {
    return this.sent.filter((s) => s.destination === destination).at(-1)?.code;
  }
}

export class SequentialRandomCodes implements RandomCodes {
  #n = 0;

  sixDigitCode(): string {
    this.#n += 1;
    return String(100000 + this.#n);
  }

  recoveryCodes(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `RECOV-${String(i).padStart(5, '0')}`);
  }

  inviteToken(): string {
    this.#n += 1;
    return `invite-token-${this.#n}`;
  }

  refreshToken(): string {
    this.#n += 1;
    return `refresh-token-${this.#n}`;
  }
}

export class FakeStaffTokenIssuer implements StaffTokenIssuer {
  issue(staff: StaffAccount, sessionId: StaffSessionId): Promise<string> {
    return Promise.resolve(`access:${staff.id}:${sessionId}`);
  }
}
