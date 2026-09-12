import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AdminApprovalsService } from '../services/admin-approvals.service';
import { ApprovalQueryDto } from '../dto/approval-query.dto';
import { RejectAccountDto } from '../dto/reject-account.dto';
import { SuspendAccountDto } from '../dto/suspend-account.dto';
import { PaginatedApprovalsDto, ApprovalActionResponseDto } from '../dto/approval-response.dto';
import { AdminProfileDto } from '../../business-profiles/dto/profile-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin Approvals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/approvals')
export class AdminApprovalsController {
  constructor(private readonly approvalsService: AdminApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'List accounts pending or in approval lifecycle (Admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated approval list', type: PaginatedApprovalsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async listApprovals(@Query() query: ApprovalQueryDto): Promise<PaginatedApprovalsDto> {
    return this.approvalsService.listApprovals(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get full verification and profile details for an account (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Complete profile details', type: AdminProfileDto })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getApprovalDetails(@Param('id', ParseUUIDPipe) id: string): Promise<AdminProfileDto> {
    return this.approvalsService.getApprovalDetails(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a business account application (Admin only)' })
  @ApiResponse({ status: 200, description: 'Account approved', type: ApprovalActionResponseDto })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async approveAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Req() req: Request,
  ): Promise<ApprovalActionResponseDto> {
    return this.approvalsService.approveAccount(id, adminId, req.ip, req.headers['user-agent']);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a business account application with reason (Admin only)' })
  @ApiResponse({ status: 200, description: 'Account rejected', type: ApprovalActionResponseDto })
  @ApiBadRequestResponse({ description: 'Rejection reason is required' })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async rejectAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: RejectAccountDto,
    @Req() req: Request,
  ): Promise<ApprovalActionResponseDto> {
    return this.approvalsService.rejectAccount(
      id,
      adminId,
      dto.reason,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend an active account and revoke active sessions (Admin only)' })
  @ApiResponse({ status: 200, description: 'Account suspended', type: ApprovalActionResponseDto })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async suspendAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: SuspendAccountDto,
    @Req() req: Request,
  ): Promise<ApprovalActionResponseDto> {
    return this.approvalsService.suspendAccount(
      id,
      adminId,
      dto.reason,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivate a suspended or rejected account back to active (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Account reactivated', type: ApprovalActionResponseDto })
  @ApiBadRequestResponse({ description: 'Account is not suspended or rejected' })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async reactivateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Req() req: Request,
  ): Promise<ApprovalActionResponseDto> {
    return this.approvalsService.reactivateAccount(id, adminId, req.ip, req.headers['user-agent']);
  }
}
