import {
  Controller,
  Post,
  Param,
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
import { CommunityLikesService } from '../services/community-likes.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Community Likes')
@Controller('communities/:communityId/posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityLikesController {
  constructor(private readonly likesService: CommunityLikesService) {}

  @Post(':postId/like')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Toggle like on a post (Active members only)' })
  @ApiResponse({ status: 200, description: 'Like toggled' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Must be an active member to like' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  async togglePostLike(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.likesService.togglePostLike(communityId, postId, userId);
  }

  @Post(':postId/replies/:replyId/like')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Toggle like on a reply (Active members only)' })
  @ApiResponse({ status: 200, description: 'Like toggled' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Must be an active member to like' })
  @ApiNotFoundResponse({ description: 'Reply not found' })
  async toggleReplyLike(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('replyId', ParseUUIDPipe) replyId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.likesService.toggleReplyLike(communityId, postId, replyId, userId);
  }
}
