import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CommunityMemberRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: 'New role for the community member (MODERATOR, SPEAKER, or MEMBER)',
    enum: CommunityMemberRole,
    example: CommunityMemberRole.SPEAKER,
  })
  @IsNotEmpty({ message: 'role is required' })
  @IsEnum(CommunityMemberRole, { message: 'role must be MODERATOR, SPEAKER, or MEMBER' })
  role!: CommunityMemberRole;
}
