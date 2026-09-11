import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { CommunityPostsService } from '../services/community-posts.service';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { PostQueryDto } from '../dto/post-query.dto';
import { PostResponseDto } from '../dto/post-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Community Posts')
@Controller('communities/:communityId/posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityPostsController {
  constructor(private readonly postsService: CommunityPostsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a post in a community (Active community members only)' })
  @ApiResponse({ status: 201, description: 'Post created', type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Must be an active member to post' })
  async create(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser('sub') authorId: string,
    @Body() dto: CreatePostDto,
    @Req() req: Request,
  ): Promise<PostResponseDto> {
    return this.postsService.create(communityId, authorId, dto, req.ip, req.headers['user-agent']);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List and paginate posts in a community' })
  @ApiResponse({ status: 200, description: 'Paginated list of posts' })
  async findAll(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() query: PostQueryDto,
    @Req() req: Request,
  ): Promise<{
    data: PostResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const user = req.user;
    return this.postsService.findAll(communityId, query, user?.sub, user?.roles ?? []);
  }

  @Get(':postId')
  @Public()
  @ApiOperation({ summary: 'Get single post by ID' })
  @ApiResponse({ status: 200, description: 'Post details', type: PostResponseDto })
  @ApiNotFoundResponse({ description: 'Post not found' })
  async findOne(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Req() req: Request,
  ): Promise<PostResponseDto> {
    const user = req.user;
    return this.postsService.findOne(communityId, postId, user?.sub, user?.roles ?? []);
  }

  @Patch(':postId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a post (Author or Admin)' })
  @ApiResponse({ status: 200, description: 'Post updated', type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only author or admin can update' })
  async update(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    return this.postsService.update(communityId, postId, user.sub, user.roles, dto);
  }

  @Delete(':postId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a post (Author, Moderator, Owner, or Admin)' })
  @ApiResponse({ status: 200, description: 'Post deleted' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async delete(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.postsService.delete(
      communityId,
      postId,
      user.sub,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':postId/pin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Pin a post to top of feed (Moderator, Owner, or Admin)' })
  @ApiResponse({ status: 200, description: 'Post pinned', type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires moderation privileges' })
  async pin(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<PostResponseDto> {
    return this.postsService.pin(
      communityId,
      postId,
      user.sub,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':postId/unpin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unpin a post (Moderator, Owner, or Admin)' })
  @ApiResponse({ status: 200, description: 'Post unpinned', type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires moderation privileges' })
  async unpin(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<PostResponseDto> {
    return this.postsService.unpin(
      communityId,
      postId,
      user.sub,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
