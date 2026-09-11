import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../../auth/services/token.service';
import { CommunityChatService } from '../services/community-chat.service';
import { CommunityAuthorizationService } from '../services/community-authorization.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/communities',
})
export class CommunityGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CommunityGateway.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly chatService: CommunityChatService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  afterInit(_server: Server): void {
    this.logger.log('✅ Community WebSocket Gateway initialized on /communities');
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization
          ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : null);

      if (rawToken) {
        const payload = await this.tokenService.verifyAccessToken(rawToken);
        client.data.userId = payload.sub;
        this.logger.debug(`Client ${client.id} authenticated as user ${payload.sub}`);
      }
    } catch {
      this.logger.warn(`Client ${client.id} failed handshake authentication`);
      // Allow unauthenticated connection but operations will be guarded
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_community')
  async handleJoinCommunity(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { communityId: string },
  ): Promise<{ success: boolean; communityId?: string; error?: string }> {
    const userId = client.data.userId;
    if (!userId) {
      return { success: false, error: 'Unauthorized: Valid JWT required' };
    }

    try {
      // Must be an active member of this community
      await this.authService.assertActiveMember(userId, data.communityId);

      const roomName = `community:${data.communityId}`;
      await client.join(roomName);
      this.logger.debug(`User ${userId} joined socket room ${roomName}`);

      return { success: true, communityId: data.communityId };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Forbidden';
      return { success: false, error: errorMessage };
    }
  }

  @SubscribeMessage('leave_community')
  async handleLeaveCommunity(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { communityId: string },
  ): Promise<{ success: boolean }> {
    const roomName = `community:${data.communityId}`;
    await client.leave(roomName);
    return { success: true };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { communityId: string; content: string },
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const userId = client.data.userId;
    if (!userId) {
      return { success: false, error: 'Unauthorized: Valid JWT required' };
    }

    try {
      const saved = await this.chatService.saveMessage(data.communityId, userId, {
        content: data.content,
      });

      // Broadcast to room
      const roomName = `community:${data.communityId}`;
      this.server.to(roomName).emit('chat_message', saved);

      return { success: true, data: saved };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      return { success: false, error: errorMessage };
    }
  }
}
