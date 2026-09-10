import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  afterInit(_server: Server): void {
    this.logger.log('✅ Realtime WebSocket Gateway initialized');
  }

  handleConnection(client: Socket): void {
    // Auth extension point: in Sprint 5, token extraction and JWT validation
    const token = client.handshake.auth?.token || client.handshake.headers?.authorization;
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`Client connected: ${client.id}, hasAuth: ${!!token}`);
    }
  }

  handleDisconnect(client: Socket): void {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`Client disconnected: ${client.id}`);
    }
  }
}
