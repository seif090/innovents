import { ApiProperty } from '@nestjs/swagger';

export class ResponseMetaDto {
  @ApiProperty({
    description: 'Unique trace/request ID',
    example: 'd3b07384-d113-46d8-99eb-03388c2ba43d',
  })
  requestId!: string;

  @ApiProperty({
    description: 'Timestamp in ISO 8601 UTC format',
    example: '2026-09-10T22:00:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({ description: 'Pagination metadata if applicable', required: false })
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export class ApiResponseDto<T> {
  @ApiProperty({ description: 'Indicates whether the request was successful', example: true })
  success!: boolean;

  @ApiProperty({ description: 'Response payload data' })
  data!: T;

  @ApiProperty({ description: 'Standard response metadata', type: ResponseMetaDto })
  meta!: ResponseMetaDto;
}
