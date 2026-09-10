import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  private readonly saltRounds = 12;

  /**
   * Hashes a plaintext password securely using bcrypt with 12 salt rounds
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Compares a plaintext password against a stored bcrypt hash
   */
  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validates password strength policy:
   * - At least 8 characters
   * - Contains at least one letter and one number
   */
  validateStrength(password: string): boolean {
    if (!password || password.length < 8) {
      return false;
    }
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    return hasLetter && hasNumber;
  }
}
