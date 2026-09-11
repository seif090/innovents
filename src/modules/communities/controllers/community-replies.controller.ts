import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
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
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CommunityRepliesService } from '../services/community-replies.service';
import { CreateReplyDto } from '../dto/create-reply.dto';
import { ReplyResponseDto } from '../dto/reply-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Community Replies')
@Controller('communities/:communityId/posts/:postId/replies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityRepliesController {
  constructor(private readonly repliesService: CommunityRepliesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a threaded reply to a post or another reply (Active members only)',
  })
  @ApiResponse({ status: 201, description: 'Reply created', type: ReplyResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Must be an active member to reply' })
  @ApiNotFoundResponse({ description: 'Post or parent reply not found' })
  async create(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser('sub') authorId: string,
    @Body() dto: CreateReplyDto,
    @Req() req: Request,
  ): Promise<ReplyResponseDto> {
    return this.repliesService.create(
      communityId,
      postId,
      authorId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List threaded replies for a post' })
  @ApiResponse({ status: 200, description: 'Nested tree of replies' })
  async findAll(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Req() req: Request,
  ): Promise<ReplyResponseDto[]> {
    const user = req.user;
    return this.repliesService.findAll(communityId, postId, user?.sub, user?.roles ?? []);
  }

  @Delete(':replyId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a reply (Author, Moderator, Owner, or Admin)' })
  @ApiResponse({ status: 200, description: 'Reply deleted' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async delete(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('replyId', ParseUUIDPipe) replyId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean; message: string }> {
    return this.repliesService.delete(communityId, postId, replyId, user.sub, user.roles);
  }
}
