import { Injectable, Logger } from '@nestjs/common';
import {
  PushProvider,
  PushNotificationPayload,
  PushNotificationResult,
} from './push-provider.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MockPushService implements PushProvider {
  private readonly logger = new Logger(MockPushService.name);

  async sendPush(payload: PushNotificationPayload): Promise<PushNotificationResult> {
    // Check for simulated failure scenarios in testing/staging
    if (payload.token.startsWith('invalid_') || payload.token.startsWith('unregistered_')) {
      this.logger.warn(
        `Simulated unregistered/invalid push token: ${payload.token.slice(0, 10)}...`,
      );
      return {
        success: false,
        isTokenInvalid: true,
        errorCode: 'UNREGISTERED',
        errorMessage: 'Device token has expired or is invalid',
      };
    }

    if (payload.token.startsWith('transient_fail_')) {
      this.logger.warn(`Simulated transient network timeout for token`);
      return {
        success: false,
        isTokenInvalid: false,
        errorCode: 'UNAVAILABLE',
        errorMessage: 'Push service temporarily unavailable (timeout)',
      };
    }

    const providerMessageId = `mock-fcm-${uuidv4()}`;
    this.logger.debug(
      `Mock push notification dispatched successfully. ProviderMessageId: ${providerMessageId}`,
    );

    return {
      success: true,
      providerMessageId,
    };
  }
}
