import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { REQUEST_ID_HEADER } from '../constants/system.constants';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader = req.headers[REQUEST_ID_HEADER];
    let requestId: string;

    if (typeof rawHeader === 'string' && uuidValidate(rawHeader)) {
      requestId = rawHeader;
    } else {
      requestId = uuidv4();
    }

    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
