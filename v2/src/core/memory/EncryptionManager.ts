import * as crypto from 'crypto';

export type EncryptionAlgorithm = 'aes-256-gcm' | 'aes-256-cbc';

export interface EncryptionMetadata {
  algorithm: EncryptionAlgorithm;
  encrypted: boolean;
  timestamp: number;
}

/**
 * EncryptionManager - Handles encryption and decryption of sensitive data
 *
 * Features:
 * - AES-256-GCM encryption (authenticated encryption)
 * - Secure key generation
 * - IV (initialization vector) management
 * - Authentication tag validation
 * - Support for multiple encryption algorithms
 */
export class EncryptionManager {
  private static readonly DEFAULT_ALGORITHM: EncryptionAlgorithm = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits

  /**
   * Generate a secure encryption key
   */
  generateKey(): string {
    return crypto.randomBytes(EncryptionManager.KEY_LENGTH).toString('hex');
  }

  /**
   * Generate a random initialization vector
   */
  private generateIV(): Buffer {
    return crypto.randomBytes(EncryptionManager.IV_LENGTH);
  }

  /**
   * Convert hex key to buffer
   */
  private keyToBuffer(key: string): Buffer {
    return Buffer.from(key, 'hex');
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(
    plaintext: string,
    key: string,
    algorithm: EncryptionAlgorithm = EncryptionManager.DEFAULT_ALGORITHM
  ): Promise<string> {
    try {
      const keyBuffer = this.keyToBuffer(key);
      const iv = this.generateIV();

      if (algorithm === 'aes-256-gcm') {
        return this.encryptGCM(plaintext, keyBuffer, iv);
      } else if (algorithm === 'aes-256-cbc') {
        return this.encryptCBC(plaintext, keyBuffer, iv);
      }

      throw new Error(`Unsupported algorithm: ${algorithm}`);
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt using AES-256-GCM (authenticated encryption)
   */
  private encryptGCM(plaintext: string, key: Buffer, iv: Buffer): string {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: IV:encrypted:authTag
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  }

  /**
   * Encrypt using AES-256-CBC
   */
  private encryptCBC(plaintext: string, key: Buffer, iv: Buffer): string {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Format: IV:encrypted
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt data
   */
  async decrypt(
    ciphertext: string,
    key: string,
    algorithm: EncryptionAlgorithm = EncryptionManager.DEFAULT_ALGORITHM
  ): Promise<string> {
    try {
      const keyBuffer = this.keyToBuffer(key);

      if (algorithm === 'aes-256-gcm') {
        return this.decryptGCM(ciphertext, keyBuffer);
      } else if (algorithm === 'aes-256-cbc') {
        return this.decryptCBC(ciphertext, keyBuffer);
      }

      throw new Error(`Unsupported algorithm: ${algorithm}`);
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt using AES-256-GCM
   */
  private decryptGCM(ciphertext: string, key: Buffer): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Decrypt using AES-256-CBC
   */
  private decryptCBC(ciphertext: string, key: Buffer): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Check if data is encrypted (based on format)
   */
  isEncrypted(data: string): boolean {
    // Check for IV:encrypted or IV:encrypted:authTag format
    const parts = data.split(':');
    return parts.length === 2 || parts.length === 3;
  }

  /**
   * Get encryption metadata
   */
  getMetadata(
    algorithm: EncryptionAlgorithm = EncryptionManager.DEFAULT_ALGORITHM
  ): EncryptionMetadata {
    return {
      algorithm,
      encrypted: true,
      timestamp: Date.now()
    };
  }

  /**
   * Encrypt an object
   */
  async encryptObject(
    obj: any,
    key: string,
    algorithm?: EncryptionAlgorithm
  ): Promise<string> {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString, key, algorithm);
  }

  /**
   * Decrypt to object
   */
  async decryptObject<T = any>(
    ciphertext: string,
    key: string,
    algorithm?: EncryptionAlgorithm
  ): Promise<T> {
    const decrypted = await this.decrypt(ciphertext, key, algorithm);
    return JSON.parse(decrypted);
  }

  /**
   * Re-encrypt data with a new key
   */
  async reencrypt(
    ciphertext: string,
    oldKey: string,
    newKey: string,
    algorithm?: EncryptionAlgorithm
  ): Promise<string> {
    const decrypted = await this.decrypt(ciphertext, oldKey, algorithm);
    return this.encrypt(decrypted, newKey, algorithm);
  }

  /**
   * Generate a key from a password using PBKDF2
   */
  deriveKeyFromPassword(
    password: string,
    salt?: string,
    iterations: number = 100000
  ): string {
    const saltBuffer = salt
      ? Buffer.from(salt, 'hex')
      : crypto.randomBytes(16);

    const key = crypto.pbkdf2Sync(
      password,
      saltBuffer,
      iterations,
      EncryptionManager.KEY_LENGTH,
      'sha256'
    );

    return key.toString('hex');
  }

  /**
   * Validate encryption key format
   */
  isValidKey(key: string): boolean {
    try {
      const buffer = Buffer.from(key, 'hex');
      return buffer.length === EncryptionManager.KEY_LENGTH;
    } catch {
      return false;
    }
  }
}
