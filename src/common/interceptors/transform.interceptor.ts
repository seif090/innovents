import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { REQUEST_ID_HEADER } from '../constants/system.constants';
import { ApiResponseDto } from '../dto/api-response.dto';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponseDto<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponseDto<T> | T> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = (request.headers[REQUEST_ID_HEADER] as string) || 'unknown-request-id';
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => {
        // Bypass wrapping for health checks to comply with standard probes
        if (request.url.includes('/health')) {
          return data;
        }

        // If the controller already returned a formatted response or raw stream, return as-is
        if (data && typeof data === 'object' && 'success' in data && 'meta' in data) {
          return data;
        }

        return {
          success: true,
          data: data !== undefined ? data : null,
          meta: {
            requestId,
            timestamp,
          },
        };
      }),
    );
  }
}
