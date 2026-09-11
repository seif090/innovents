import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserDeviceService } from '../services/user-device.service';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { UserDeviceResponseDto } from '../dto/user-device-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/devices')
export class UserDevicesController {
  constructor(private readonly userDeviceService: UserDeviceService) {}

  @Post()
  @ApiOperation({ summary: 'Register or rotate a push notification device token' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: UserDeviceResponseDto,
    description: 'Device registered successfully with masked token',
  })
  async registerDevice(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterDeviceDto,
  ): Promise<UserDeviceResponseDto> {
    return this.userDeviceService.registerDevice(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active registered devices for current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [UserDeviceResponseDto],
    description: 'Active user devices',
  })
  async getUserDevices(@CurrentUser('sub') userId: string): Promise<UserDeviceResponseDto[]> {
    return this.userDeviceService.getUserDevices(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an active device registration' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Device revoked' })
  async revokeDevice(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.userDeviceService.revokeDevice(userId, id);
  }
}
