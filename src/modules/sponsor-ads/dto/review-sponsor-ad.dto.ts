import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class RejectSponsorAdDto {
  @ApiPropertyOptional({
    description: 'Mandatory reason explaining why the ad was rejected',
    example: 'Image does not comply with brand guidelines. Resolution is too low.',
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}
