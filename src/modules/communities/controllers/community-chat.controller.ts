import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { CommunityChatService } from '../services/community-chat.service';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';
import { ChatMessageResponseDto } from '../dto/chat-message-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Community Chat')
@Controller('communities/:communityId/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityChatController {
  constructor(private readonly chatService: CommunityChatService) {}

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Send a message in community chat (Active members only)' })
  @ApiResponse({ status: 201, description: 'Message sent', type: ChatMessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Must be an active member to chat' })
  async sendMessage(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser('sub') senderId: string,
    @Body() dto: SendChatMessageDto,
  ): Promise<ChatMessageResponseDto> {
    return this.chatService.saveMessage(communityId, senderId, dto);
  }

  @Get('messages')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Fetch recent chat history (Active members only)' })
  @ApiResponse({ status: 200, description: 'Recent chat messages', type: [ChatMessageResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Must be an active member' })
  async getRecentMessages(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: number,
  ): Promise<ChatMessageResponseDto[]> {
    return this.chatService.getRecentMessages(communityId, userId, limit ? Number(limit) : 50);
  }
}
