import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { Request, Response } from 'express';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;
  let mockArgumentsHost: Partial<ArgumentsHost>;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      url: '/api/v1/test',
      method: 'GET',
      headers: {
        'x-request-id': 'test-trace-id-1234',
      },
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('should format standard HttpException properly', () => {
    const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockArgumentsHost as ArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'Forbidden resource',
        }),
        meta: expect.objectContaining({
          requestId: 'test-trace-id-1234',
        }),
      }),
    );
  });

  it('should handle validation error arrays with details', () => {
    const exception = new BadRequestException(['name should not be empty', 'email must be valid']);

    filter.catch(exception, mockArgumentsHost as ArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ message: 'name should not be empty' }, { message: 'email must be valid' }],
        }),
      }),
    );
  });
});
