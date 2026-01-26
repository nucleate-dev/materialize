import crypto from 'crypto';

/**
 * Encryption utilities for sensitive data (e.g., GitHub & Supabase tokens)
 *
 * Uses AES-256-GCM with a master key from environment variable.
 * The encrypted output format is: IV:AUTH_TAG:CIPHERTEXT (all hex-encoded)
 *
 * ENV VAR required:
 *   - GITHUB_TOKEN_ENCRYPTION_KEY
 *   - SUPABASE_OAUTH_TOKEN_ENCRYPTION_KEY
 *   - Must be 32 bytes (64 hex characters) or base64-encoded 32 bytes
 *   - Generate with: openssl rand -hex 32 or openssl rand -base64 32
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM

export type EncryptionKeyType = 'github' | 'supabase';

/**
 * Get the encryption key from environment variable.
 * Supports both hex (64 chars) and base64 (44 chars) encoding.
 */
function getEncryptionKey(keyType: EncryptionKeyType): Buffer {
  let envName = '';
  switch (keyType) {
    case 'github':
      envName = 'GITHUB_TOKEN_ENCRYPTION_KEY';
      break;
    case 'supabase':
      envName = 'SUPABASE_OAUTH_TOKEN_ENCRYPTION_KEY';
      break;
    default:
      envName = 'GITHUB_TOKEN_ENCRYPTION_KEY';
  }

  const keyEnv = process.env[envName];

  if (!keyEnv) {
    throw new Error(`${envName} environment variable is not set`);
  }

  // Try hex format first (64 hex chars = 32 bytes)
  if (keyEnv.length === 64 && /^[0-9a-fA-F]+$/.test(keyEnv)) {
    return Buffer.from(keyEnv, 'hex');
  }

  // Try base64 format (44 chars for 32 bytes)
  if (keyEnv.length === 44) {
    const key = Buffer.from(keyEnv, 'base64');
    if (key.length === 32) {
      return key;
    }
  }

  throw new Error(
    `${envName} must be 32 bytes encoded as hex (64 chars) or base64 (44 chars). ` +
      'Generate with: openssl rand -hex 32',
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: IV:AUTH_TAG:CIPHERTEXT (all hex-encoded)
 */
export function encrypt(
  plaintext: string,
  keyType: EncryptionKeyType,
): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty plaintext');
  }

  const key = getEncryptionKey(keyType);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: IV:AUTH_TAG:CIPHERTEXT
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt an encrypted string using AES-256-GCM.
 *
 * @param encrypted - The encrypted string in format IV:AUTH_TAG:CIPHERTEXT
 * @returns Decrypted plaintext string
 */
export function decrypt(
  encrypted: string,
  keyType: EncryptionKeyType,
): string {
  if (!encrypted) {
    throw new Error('Cannot decrypt empty encrypted string');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted data format. Expected IV:AUTH_TAG:CIPHERTEXT',
    );
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const key = getEncryptionKey(keyType);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Safely test if the encryption key is configured correctly.
 * Returns true if the key is valid, false otherwise.
 */
export function isEncryptionKeyConfigured(keyType: EncryptionKeyType): boolean {
  try {
    getEncryptionKey(keyType);
    return true;
  } catch {
    return false;
  }
}
