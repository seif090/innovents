import { ApiProperty } from '@nestjs/swagger';
import { ResponseMetaDto } from './api-response.dto';

export class ErrorDetailDto {
  @ApiProperty({
    description: 'Target field or parameter that caused the error',
    required: false,
    example: 'email',
  })
  field?: string;

  @ApiProperty({
    description: 'Specific error description for the field',
    example: 'email must be an email',
  })
  message!: string;
}

export class ErrorPayloadDto {
  @ApiProperty({ description: 'Machine-readable error code', example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiProperty({ description: 'Human-readable error message', example: 'Input validation failed' })
  message!: string;

  @ApiProperty({
    description: 'Detailed error messages or field validation failures',
    type: [ErrorDetailDto],
    required: false,
  })
  details?: ErrorDetailDto[];
}

export class ErrorResponseDto {
  @ApiProperty({ description: 'Always false for error responses', example: false })
  success: boolean = false;

  @ApiProperty({ description: 'Standardized error payload', type: ErrorPayloadDto })
  error!: ErrorPayloadDto;

  @ApiProperty({
    description: 'Standard response metadata including trace requestId',
    type: ResponseMetaDto,
  })
  meta!: ResponseMetaDto;
}
