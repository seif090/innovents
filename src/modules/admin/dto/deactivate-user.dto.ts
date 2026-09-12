import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeactivateUserDto {
  @ApiProperty({ description: 'Mandatory reason for deactivating user account', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
