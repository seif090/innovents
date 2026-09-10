import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UserProfileResponseDto } from '../dto/user-response.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user identity profile',
    type: UserProfileResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getMe(@CurrentUser('sub') userId: string): Promise<UserProfileResponseDto> {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current authenticated user identity details' })
  @ApiResponse({
    status: 200,
    description: 'Updated user identity profile',
    type: UserProfileResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async updateMe(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserProfileResponseDto> {
    return this.usersService.update(userId, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete current user account' })
  @ApiResponse({ status: 204, description: 'Account successfully soft-deleted' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async deleteMe(@CurrentUser('sub') userId: string): Promise<void> {
    await this.usersService.softDelete(userId);
  }
}
