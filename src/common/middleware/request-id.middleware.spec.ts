import { RequestIdMiddleware } from './request-id.middleware';
import { Request, Response } from 'express';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { REQUEST_ID_HEADER } from '../constants/system.constants';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('should generate a valid UUID v4 if x-request-id header is missing', () => {
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    const generatedId = mockRequest.headers![REQUEST_ID_HEADER] as string;
    expect(generatedId).toBeDefined();
    expect(uuidValidate(generatedId)).toBe(true);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, generatedId);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should preserve valid UUID v4 when provided in request header', () => {
    const existingId = uuidv4();
    mockRequest.headers![REQUEST_ID_HEADER] = existingId;

    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockRequest.headers![REQUEST_ID_HEADER]).toBe(existingId);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, existingId);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should regenerate UUID if incoming header is not a valid UUID', () => {
    mockRequest.headers![REQUEST_ID_HEADER] = 'invalid-non-uuid-string';

    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    const generatedId = mockRequest.headers![REQUEST_ID_HEADER] as string;
    expect(generatedId).not.toBe('invalid-non-uuid-string');
    expect(uuidValidate(generatedId)).toBe(true);
    expect(nextFunction).toHaveBeenCalled();
  });
});
