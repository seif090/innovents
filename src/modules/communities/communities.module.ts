import { CommunitySponsorshipExpirationService } from './services/community-sponsorship-expiration.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';

import { CommunitiesController } from './controllers/communities.controller';
import { CommunityMembersController } from './controllers/community-members.controller';
import { CommunityPostsController } from './controllers/community-posts.controller';
import { CommunityRepliesController } from './controllers/community-replies.controller';
import { CommunityLikesController } from './controllers/community-likes.controller';
import { CommunityMeetupsController } from './controllers/community-meetups.controller';
import { CommunityChatController } from './controllers/community-chat.controller';

import { CommunityAuthorizationService } from './services/community-authorization.service';
import { CommunitiesService } from './services/communities.service';
import { CommunityMembersService } from './services/community-members.service';
import { CommunityPostsService } from './services/community-posts.service';
import { CommunityRepliesService } from './services/community-replies.service';
import { CommunityLikesService } from './services/community-likes.service';
import { CommunityMeetupsService } from './services/community-meetups.service';
import { CommunityChatService } from './services/community-chat.service';
import { CommunityGateway } from './gateways/community.gateway';

@Module({
  imports: [AuthModule, AuditModule, OutboxModule],
  controllers: [
    CommunitiesController,
    CommunityMembersController,
    CommunityPostsController,
    CommunityRepliesController,
    CommunityLikesController,
    CommunityMeetupsController,
    CommunityChatController,
  ],
  providers: [
    CommunityAuthorizationService,
    CommunitiesService,
    CommunityMembersService,
    CommunityPostsService,
    CommunityRepliesService,
    CommunityLikesService,
    CommunityMeetupsService,
    CommunitySponsorshipExpirationService,
    CommunitySponsorshipExpirationService,
    CommunityChatService,
    CommunityGateway,
  ],
  exports: [
    CommunityAuthorizationService,
    CommunitiesService,
    CommunityMembersService,
    CommunityPostsService,
    CommunityRepliesService,
    CommunityLikesService,
    CommunityMeetupsService,
    CommunityChatService,
  ],
})
export class CommunitiesModule {}
