import { Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AdminModerationService } from '../services/admin-moderation.service';
import { AdminModerationDto, ModerationResultDto } from '../dto/admin-moderation.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin Content Moderation')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/moderation')
export class AdminModerationController {
  constructor(private readonly moderationService: AdminModerationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute administrative content moderation on a platform resource (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Content successfully moderated',
    type: ModerationResultDto,
  })
  @ApiNotFoundResponse({ description: 'Target resource not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async moderateContent(
    @CurrentUser('sub') adminId: string,
    @Body() dto: AdminModerationDto,
    @Req() req: Request,
  ): Promise<ModerationResultDto> {
    return this.moderationService.moderateContent(
      adminId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
