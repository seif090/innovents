import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { ChatMessageResponseDto } from '../dto/chat-message-response.dto';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';

@Injectable()
export class CommunityChatService {
  private readonly logger = new Logger(CommunityChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  /**
   * Save a chat message.
   * Sender must be an ACTIVE member of the community.
   */
  async saveMessage(
    communityId: string,
    senderId: string,
    dto: SendChatMessageDto,
  ): Promise<ChatMessageResponseDto> {
    const { member } = await this.authService.assertActiveMember(senderId, communityId);

    const message = await this.prisma.communityChatMessage.create({
      data: {
        communityId,
        senderId,
        content: dto.content,
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    this.logger.debug(`Saved chat message ${message.id} in community ${communityId}`);

    return {
      id: message.id,
      communityId: message.communityId,
      senderId: message.senderId,
      content: message.content,
      createdAt: message.createdAt,
      sender: {
        id: message.sender.id,
        email: message.sender.email,
        role: member.role,
      },
    };
  }

  /**
   * Fetch recent chat history.
   * User must be an ACTIVE member of the community.
   */
  async getRecentMessages(
    communityId: string,
    userId: string,
    limit: number = 50,
  ): Promise<ChatMessageResponseDto[]> {
    await this.authService.assertActiveMember(userId, communityId);

    const messages = await this.prisma.communityChatMessage.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      include: {
        sender: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Invert to chronological order
    const chronological = messages.reverse();

    // Batch load sender member roles
    const senderIds = Array.from(new Set(chronological.map((m) => m.senderId)));
    const memberships = await this.prisma.communityMember.findMany({
      where: {
        communityId,
        userId: { in: senderIds },
      },
      select: { userId: true, role: true },
    });
    const roleMap = new Map(memberships.map((m) => [m.userId, m.role]));

    return chronological.map((msg) => ({
      id: msg.id,
      communityId: msg.communityId,
      senderId: msg.senderId,
      content: msg.content,
      createdAt: msg.createdAt,
      sender: {
        id: msg.sender.id,
        email: msg.sender.email,
        role: roleMap.get(msg.senderId) ?? null,
      },
    }));
  }
}
