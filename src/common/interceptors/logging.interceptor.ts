import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants/system.constants';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId = (req.headers[REQUEST_ID_HEADER] as string) || 'unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;

          this.logger.log(
            JSON.stringify({
              requestId,
              method,
              url,
              statusCode,
              durationMs: duration,
              ip,
              userAgent,
              timestamp: new Date().toISOString(),
            }),
          );
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const statusCode = err?.status || 500;

          this.logger.error(
            JSON.stringify({
              requestId,
              method,
              url,
              statusCode,
              durationMs: duration,
              ip,
              userAgent,
              error: err?.message || 'Error',
              timestamp: new Date().toISOString(),
            }),
          );
        },
      }),
    );
  }
}
