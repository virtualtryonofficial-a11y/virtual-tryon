import * as crypto from 'crypto';
import { config as appConfig } from '@trail/config';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives a 32-byte key from the provided secret using SHA-256.
 */
function getKey(): Buffer {
  const secret = appConfig.shopify.apiSecret;
  if (!secret) {
    throw new Error('Missing shopify.apiSecret required for encryption');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(encryptedString: string): string {
  if (!encryptedString) {
    throw new Error('Invalid encrypted token string');
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted token must be in the format iv:authTag:encryptedData');
  }

  const [ivHex, authTagHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
