export interface PushNotificationPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushNotificationResult {
  success: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  isTokenInvalid?: boolean;
}

export interface PushProvider {
  sendPush(payload: PushNotificationPayload): Promise<PushNotificationResult>;
}

export const PUSH_PROVIDER = 'PUSH_PROVIDER';
