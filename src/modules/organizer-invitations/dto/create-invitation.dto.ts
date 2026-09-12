import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateInvitationDto {
  @ApiProperty({
    example: 'organizer@example.com',
    description: 'Email address of the prospective event organizer',
  })
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiPropertyOptional({
    example: 7,
    default: 7,
    description: 'Number of days until the invitation token expires (1-30 days)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresDays?: number = 7;
}
