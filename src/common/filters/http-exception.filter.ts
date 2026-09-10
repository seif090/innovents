import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants/system.constants';
import { ErrorResponseDto, ErrorDetailDto } from '../dto/error-response.dto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request.headers[REQUEST_ID_HEADER] as string) || 'unknown-request-id';

    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected internal error occurred';
    let details: ErrorDetailDto[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.statusToErrorCode(status);
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const respObj = exceptionResponse as Record<string, unknown>;
        message = (respObj['message'] as string) || exception.message;
        code =
          (respObj['code'] as string) ||
          (typeof respObj['error'] === 'string'
            ? respObj['error'].toUpperCase().replace(/\s+/g, '_')
            : this.statusToErrorCode(status));

        // Handle class-validator multiple errors array
        if (Array.isArray(respObj['message'])) {
          details = (respObj['message'] as string[]).map((msg) => ({
            message: msg,
          }));
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
        }
      }
    } else if (exception instanceof Error) {
      // Unhandled standard error
      this.logger.error(
        `[${requestId}] Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );

      // In production do NOT expose internal exception details
      if (process.env.NODE_ENV !== 'production') {
        message = exception.message;
      }
    } else {
      this.logger.error(
        `[${requestId}] Unknown exception thrown on ${request.method} ${request.url}: ${String(exception)}`,
      );
    }

    const errorResponse: ErrorResponseDto = {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      meta: {
        requestId,
        timestamp,
      },
    };

    response.status(status).json(errorResponse);
  }

  private statusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
