import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SuspendUserDto {
  @ApiProperty({ description: 'Mandatory reason for suspending user account', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
