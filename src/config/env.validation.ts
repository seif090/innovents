import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, Max, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api/v1';

  // Database
  @IsString()
  DATABASE_URL!: string;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsOptional()
  REDIS_URL: string = 'redis://localhost:6379';

  // JWT
  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  // OTP
  @IsNumber()
  @IsOptional()
  OTP_EXPIRES_IN_MINUTES: number = 5;

  @IsNumber()
  @IsOptional()
  OTP_MAX_ATTEMPTS: number = 5;

  @IsNumber()
  @IsOptional()
  OTP_COOLDOWN_SECONDS: number = 60;

  // Email (SMTP)
  @IsString()
  @IsOptional()
  SMTP_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  SMTP_PORT: number = 1025;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM: string = '"INOVENT" <noreply@innovent.app>';

  // S3 Storage
  @IsString()
  @IsOptional()
  STORAGE_ENDPOINT: string = 'http://localhost:9000';

  @IsString()
  @IsOptional()
  STORAGE_REGION: string = 'us-east-1';

  @IsString()
  @IsOptional()
  STORAGE_BUCKET: string = 'innovent-media';

  @IsString()
  @IsOptional()
  STORAGE_ACCESS_KEY: string = 'minioadmin';

  @IsString()
  @IsOptional()
  STORAGE_SECRET_KEY: string = 'minioadmin';

  @IsString()
  @IsOptional()
  STORAGE_FORCE_PATH_STYLE: string = 'true';

  // Stripe
  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET?: string;

  // OAuth
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  LINKEDIN_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  LINKEDIN_CLIENT_SECRET?: string;

  // CORS
  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = 'http://localhost:3000,http://localhost:5173';

  // Logging & Docs
  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'info';

  @IsString()
  @IsOptional()
  ENABLE_SWAGGER: string = 'true';
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation error: ${errors
        .map((e) => Object.values(e.constraints || {}).join(', '))
        .join('; ')}`,
    );
  }
  return validatedConfig;
}
