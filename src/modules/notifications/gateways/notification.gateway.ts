import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../../auth/services/token.service';
import { PrismaService } from '../../../database/prisma.service';
import { AccountStatus } from '@prisma/client';

export interface AuthenticatedNotificationSocket extends Socket {
  data: {
    userId?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(_server: Server): void {
    this.logger.log('✅ Notification WebSocket Gateway initialized on /notifications');
  }

  async handleConnection(client: AuthenticatedNotificationSocket): Promise<void> {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization
          ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : null);

      if (!rawToken) {
        this.logger.warn(`Connection rejected for socket ${client.id}: Missing JWT token`);
        client.disconnect(true);
        return;
      }

      const payload = await this.tokenService.verifyAccessToken(rawToken);
      const userId = payload.sub;

      // Verify account status
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true, deletedAt: true },
      });

      if (!user || user.deletedAt || user.status !== AccountStatus.ACTIVE) {
        this.logger.warn(
          `Connection rejected for socket ${client.id}: User ${userId} is inactive or suspended`,
        );
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      const userRoom = `user:${userId}`;
      await client.join(userRoom);
      this.logger.debug(`Socket ${client.id} joined notification room ${userRoom}`);
    } catch (error) {
      this.logger.warn(`Socket ${client.id} failed handshake authentication: ${error}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedNotificationSocket): void {
    this.logger.debug(`Socket disconnected from /notifications: ${client.id}`);
  }

  /**
   * Broadcasts a notification strictly to a specific user's private room
   */
  sendToUser(userId: string, event: string, payload: unknown): boolean {
    if (!this.server) {
      this.logger.warn(`Socket.IO server not initialized; skipped sending to user:${userId}`);
      return false;
    }
    const userRoom = `user:${userId}`;
    this.server.to(userRoom).emit(event, payload);
    return true;
  }

  /**
   * Checks whether the user is actively connected to the notifications gateway
   */
  async isUserConnected(userId: string): Promise<boolean> {
    if (!this.server) return false;
    const userRoom = `user:${userId}`;
    const sockets = await this.server.in(userRoom).fetchSockets();
    return sockets.length > 0;
  }
}
