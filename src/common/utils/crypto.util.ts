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
}
