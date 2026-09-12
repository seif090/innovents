import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ReportTargetType } from '@prisma/client';

export enum ModerationAction {
  HIDE = 'HIDE',
  RESTORE = 'RESTORE',
  REJECT = 'REJECT',
}

export class AdminModerationDto {
  @ApiProperty({ enum: ReportTargetType, description: 'Target entity type to moderate' })
  @IsEnum(ReportTargetType)
  @IsNotEmpty()
  targetType!: ReportTargetType;

  @ApiProperty({ description: 'Target entity UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({ enum: ModerationAction, description: 'Moderation action to execute' })
  @IsEnum(ModerationAction)
  @IsNotEmpty()
  action!: ModerationAction;

  @ApiProperty({ description: 'Mandatory administrative moderation rationale', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ModerationResultDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ enum: ReportTargetType }) targetType!: ReportTargetType;
  @ApiProperty() targetId!: string;
  @ApiProperty({ enum: ModerationAction }) action!: ModerationAction;
  @ApiProperty() reason!: string;
  @ApiProperty() moderatedAt!: Date;
  @ApiProperty() moderatorId!: string;
}
