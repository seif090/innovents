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
import { AdminUsersService } from '../services/admin-users.service';
import { AdminUserQueryDto } from '../dto/admin-user-query.dto';
import { AdminUserDetailDto, PaginatedAdminUsersDto } from '../dto/admin-user-response.dto';
import { SuspendUserDto } from '../dto/suspend-user.dto';
import { DeactivateUserDto } from '../dto/deactivate-user.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List and search platform users with filtering (Admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated user list', type: PaginatedAdminUsersDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async listUsers(@Query() query: AdminUserQueryDto): Promise<PaginatedAdminUsersDto> {
    return this.adminUsersService.listUsers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comprehensive sanitized user details (Admin only)' })
  @ApiResponse({ status: 200, description: 'Sanitized user profile', type: AdminUserDetailDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getUserDetails(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.adminUsersService.getUserDetails(id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a pending user account (Admin only)' })
  @ApiResponse({ status: 200, description: 'User activated', type: AdminUserDetailDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async activateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Req() req: Request,
  ): Promise<AdminUserDetailDto> {
    return this.adminUsersService.activateUser(
      id,
      adminId,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend user account and revoke active sessions (Admin only)' })
  @ApiResponse({ status: 200, description: 'User suspended', type: AdminUserDetailDto })
  @ApiBadRequestResponse({ description: 'Cannot suspend self or missing reason' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: SuspendUserDto,
    @Req() req: Request,
  ): Promise<AdminUserDetailDto> {
    return this.adminUsersService.suspendUser(
      id,
      adminId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a suspended user account (Admin only)' })
  @ApiResponse({ status: 200, description: 'User reactivated', type: AdminUserDetailDto })
  @ApiBadRequestResponse({ description: 'User is not suspended' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async reactivateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Req() req: Request,
  ): Promise<AdminUserDetailDto> {
    return this.adminUsersService.reactivateUser(
      id,
      adminId,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-deactivate a user account (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deactivated', type: AdminUserDetailDto })
  @ApiBadRequestResponse({ description: 'Cannot deactivate self' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async deactivateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: DeactivateUserDto,
    @Req() req: Request,
  ): Promise<AdminUserDetailDto> {
    return this.adminUsersService.deactivateUser(
      id,
      adminId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
