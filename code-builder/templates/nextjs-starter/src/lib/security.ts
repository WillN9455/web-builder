/**
 * Security helpers — hashing, password validation, rate limiting state.
 */

import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12; // Work factor — increase for higher security (slower)

/** Hash a password with bcrypt. Never store plaintext. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Verify a password against a bcrypt hash. */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
