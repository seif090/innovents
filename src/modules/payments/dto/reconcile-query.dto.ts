import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReconcileQueryDto {
  @ApiPropertyOptional({
    description: 'Reconcile pending payments older than specified minutes (default: 15)',
    default: 15,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  olderThanMinutes?: number = 15;

  @ApiPropertyOptional({
    description: 'Dry run check without mutating database states',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean = false;
}

export class ReconciliationReportDto {
  @ApiProperty({ example: 12 })
  scannedCount!: number;

  @ApiProperty({ example: 3 })
  reconciledSucceededCount!: number;

  @ApiProperty({ example: 2 })
  reconciledFailedCount!: number;

  @ApiProperty({ example: 7 })
  unresolvedCount!: number;

  @ApiProperty({ type: [String], example: [] })
  errors!: string[];
}
