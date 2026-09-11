import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDeliveryService } from './notification-delivery.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationGateway } from '../gateways/notification.gateway';
import { PUSH_PROVIDER } from '../providers/push/push-provider.interface';
import { EMAIL_PROVIDER } from '../../../infrastructure/email/email.interface';
import { EmailTemplateService } from '../providers/email/email-template.service';
import { UserDeviceService } from './user-device.service';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';

describe('NotificationDeliveryService', () => {
  let service: NotificationDeliveryService;
  let prisma: {
    notification: { update: jest.Mock };
    notificationDeliveryAttempt: { create: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let gateway: { sendToUser: jest.Mock };
  let pushProvider: { sendPush: jest.Mock };
  let emailProvider: { sendEmail: jest.Mock };
  let emailTemplateService: { render: jest.Mock };
  let userDeviceService: {
    getActiveDecryptedTokens: jest.Mock;
    deactivateToken: jest.Mock;
  };

  const sampleNotification = {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.SESSION_REMINDER,
    channel: NotificationChannel.IN_APP,
    title: 'Upcoming Session',
    body: 'Starts in 15 minutes',
    data: { sessionId: 'sess-1' },
    status: NotificationStatus.PENDING,
    readAt: null,
    deliveredAt: null,
    failedAt: null,
    idempotencyKey: 'idemp-1',
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      notification: { update: jest.fn().mockResolvedValue({}) },
      notificationDeliveryAttempt: { create: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn() },
    };
    gateway = { sendToUser: jest.fn().mockReturnValue(true) };
    pushProvider = { sendPush: jest.fn() };
    emailProvider = { sendEmail: jest.fn() };
    emailTemplateService = {
      render: jest.fn().mockReturnValue({
        subject: 'Subj',
        html: '<p>HTML</p>',
        text: 'Text',
      }),
    };
    userDeviceService = {
      getActiveDecryptedTokens: jest.fn(),
      deactivateToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationGateway, useValue: gateway },
        { provide: PUSH_PROVIDER, useValue: pushProvider },
        { provide: EMAIL_PROVIDER, useValue: emailProvider },
        { provide: EmailTemplateService, useValue: emailTemplateService },
        { provide: UserDeviceService, useValue: userDeviceService },
      ],
    }).compile();

    service = module.get<NotificationDeliveryService>(NotificationDeliveryService);
  });

  it('should deliver In-App notification via Socket.IO gateway and record attempt', async () => {
    const result = await service.deliver(sampleNotification);

    expect(result.success).toBe(true);
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      'user-1',
      'notification.created',
      expect.objectContaining({ id: 'notif-1' }),
    );
    expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notificationId: 'notif-1',
          channel: NotificationChannel.IN_APP,
        }),
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: expect.objectContaining({ status: NotificationStatus.DELIVERED }),
    });
  });

  it('should deliver Push notification via PushProvider and deactivate invalid tokens', async () => {
    userDeviceService.getActiveDecryptedTokens.mockResolvedValue([
      { id: 'dev-1', token: 'invalid_token_123', tokenHash: 'hash-1' },
    ]);
    pushProvider.sendPush.mockResolvedValue({
      success: false,
      isTokenInvalid: true,
      errorCode: 'UNREGISTERED',
      errorMessage: 'Token expired',
    });

    const pushNotif = { ...sampleNotification, channel: NotificationChannel.PUSH };
    const result = await service.deliver(pushNotif);

    expect(result.success).toBe(false);
    expect(userDeviceService.deactivateToken).toHaveBeenCalledWith('hash-1');
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: expect.objectContaining({ status: NotificationStatus.FAILED }),
    });
  });

  it('should deliver Email notification via EmailProvider and record attempt', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'user@innovent.app' });
    emailProvider.sendEmail.mockResolvedValue(true);

    const emailNotif = { ...sampleNotification, channel: NotificationChannel.EMAIL };
    const result = await service.deliver(emailNotif);

    expect(result.success).toBe(true);
    expect(emailProvider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@innovent.app' }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: expect.objectContaining({ status: NotificationStatus.DELIVERED }),
    });
  });
});
