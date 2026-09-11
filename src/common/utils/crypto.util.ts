import * as crypto from 'crypto';

export class CryptoUtil {
  /**
   * Generates a cryptographically secure random hex string
   */
  static generateRandomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Generates a numeric OTP code of specified length
   */
  static generateNumericOtp(length = 6): string {
    const digits = '0123456789';
    let otp = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      const byteVal = randomBytes[i] ?? 0;
      otp += digits[byteVal % 10];
    }
    return otp;
  }

  /**
   * Hashes a string using SHA-256 for token fingerprinting
   */
  static sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Encrypts plaintext using AES-256-GCM with a secret key
   */
  static encrypt(text: string, secretKey: string): string {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts ciphertext using AES-256-GCM with a secret key
   */
  static decrypt(ciphertext: string, secretKey: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Invalid ciphertext components');
    }
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
