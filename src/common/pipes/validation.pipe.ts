import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

export const createGlobalValidationPipe = (options?: ValidationPipeOptions): ValidationPipe => {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    ...options,
  });
};
