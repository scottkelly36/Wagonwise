/**
 * Symmetric encryption for secrets core has to read back later (the TOTP shared secret: unlike a
 * password, it can't be hashed, because checking a code needs the secret itself).
 */
export interface SecretBox {
  encrypt(plaintext: string): string;
  /** Throws if the ciphertext was tampered with or made with a different key. */
  decrypt(ciphertext: string): string;
}
