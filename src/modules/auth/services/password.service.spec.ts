import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('should hash a password securely', async () => {
    const password = 'StrongPassword2026!';
    const hash = await service.hash(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  it('should correctly verify valid password against hash', async () => {
    const password = 'StrongPassword2026!';
    const hash = await service.hash(password);

    const isValid = await service.compare(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject invalid password against hash', async () => {
    const password = 'StrongPassword2026!';
    const hash = await service.hash(password);

    const isValid = await service.compare('WrongPassword123!', hash);
    expect(isValid).toBe(false);
  });

  describe('validateStrength', () => {
    it('should validate strong passwords with letters and numbers', () => {
      expect(service.validateStrength('ValidPass123')).toBe(true);
      expect(service.validateStrength('AnotherPass1!')).toBe(true);
    });

    it('should reject passwords shorter than 8 characters', () => {
      expect(service.validateStrength('Short1')).toBe(false);
    });

    it('should reject passwords without numbers', () => {
      expect(service.validateStrength('NoNumbersHere')).toBe(false);
    });

    it('should reject passwords without letters', () => {
      expect(service.validateStrength('1234567890')).toBe(false);
    });
  });
});
