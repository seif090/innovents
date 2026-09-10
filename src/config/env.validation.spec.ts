import { validate, Environment } from './env.validation';

describe('Environment Validation', () => {
  const validConfig = {
    NODE_ENV: 'development',
    PORT: 3000,
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'super-secret-access-key-1234567890',
    JWT_REFRESH_SECRET: 'super-secret-refresh-key-1234567890',
  };

  it('should pass validation when all required variables are present and valid', () => {
    const result = validate(validConfig);
    expect(result).toBeDefined();
    expect(result.NODE_ENV).toBe(Environment.Development);
    expect(result.PORT).toBe(3000);
  });

  it('should throw an error when DATABASE_URL is missing', () => {
    const invalidConfig = { ...validConfig, DATABASE_URL: undefined };
    expect(() => validate(invalidConfig as Record<string, unknown>)).toThrow();
  });

  it('should throw an error when JWT secrets are missing', () => {
    const invalidConfig = { ...validConfig, JWT_ACCESS_SECRET: undefined };
    expect(() => validate(invalidConfig as Record<string, unknown>)).toThrow();
  });

  it('should automatically convert string port to number', () => {
    const configWithStrPort = { ...validConfig, PORT: '4000' };
    const result = validate(configWithStrPort as Record<string, unknown>);
    expect(result.PORT).toBe(4000);
  });
});
