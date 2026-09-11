export default () => ({
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    logLevel: process.env.LOG_LEVEL || 'info',
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  otp: {
    expiresInMinutes: parseInt(process.env.OTP_EXPIRES_IN_MINUTES || '5', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    cooldownSeconds: parseInt(process.env.OTP_COOLDOWN_SECONDS || '60', 10),
  },
  email: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || '"INOVENT" <noreply@innovent.app>',
  },
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    region: process.env.STORAGE_REGION || 'us-east-1',
    bucket: process.env.STORAGE_BUCKET || 'innovent-media',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    },
  },
  notifications: {
    pushProvider: process.env.PUSH_PROVIDER || 'mock',
    fcmServerKey: process.env.FCM_SERVER_KEY,
    outboxBatchSize: parseInt(process.env.OUTBOX_BATCH_SIZE || '50', 10),
    outboxPollIntervalMs: parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || '5000', 10),
    maxDeliveryAttempts: parseInt(process.env.NOTIFICATION_MAX_DELIVERY_ATTEMPTS || '3', 10),
    retentionDays: parseInt(process.env.NOTIFICATION_RETENTION_DAYS || '90', 10),
    encryptionKey:
      process.env.NOTIFICATION_ENCRYPTION_KEY || 'innovent-secure-device-token-key-32ch!',
  },
});
