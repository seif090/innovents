import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { createGlobalValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const env = configService.get<string>('app.env', 'development');
  const corsOrigins = configService.get<string[]>('app.corsOrigins', ['http://localhost:3000']);
  const enableSwagger = configService.get<boolean>('app.enableSwagger', true);

  // 1. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: env === 'production' ? undefined : false,
    }),
  );

  // 2. CORS
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin) || env === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-correlation-id'],
  });

  // 3. Payload size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // 4. Global Filters, Interceptors & Validation
  app.useGlobalPipes(createGlobalValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // 5. API Prefix & Versioning: set global prefix with exclusion for health
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready'],
  });

  // 6. OpenAPI / Swagger Documentation
  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('INOVENT Smart Event Ecosystem API')
      .setDescription(
        'Enterprise Modular Monolith REST API powering the INOVENT attendee app and B2B portal. Strictly adheres to BRD v2 and Data Requirements v2.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Input your JWT access token here',
        },
        'JWT-auth',
      )
      .addTag('Health', 'System health checks, liveness, and readiness probes')
      .addTag(
        'Authentication',
        'Registration, OTP verification, login, refresh, logout, password reset',
      )
      .addTag('Users', 'User identity profiles and account management')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // 7. Graceful Shutdown Hooks
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`🚀 INOVENT Backend running in [${env}] mode on port: ${port}`);
  if (enableSwagger) {
    console.log(`📚 Swagger Documentation accessible at: http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during application bootstrap:', err);
  process.exit(1);
});
