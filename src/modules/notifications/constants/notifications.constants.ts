import { NotificationType } from '@prisma/client';

export const NOTIFICATION_LIMITS = {
  TITLE_MIN_LENGTH: 3,
  TITLE_MAX_LENGTH: 255,
  BODY_MIN_LENGTH: 1,
  BODY_MAX_LENGTH: 5000,
  DEVICE_TOKEN_MIN_LENGTH: 10,
  DEVICE_TOKEN_MAX_LENGTH: 4096,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_STALE_PROCESSING_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  DEFAULT_MAX_OUTBOX_ATTEMPTS: 5,
} as const;

/**
 * Security & Transactional notification types that CANNOT be disabled by user preferences.
 */
export const NOTIFICATION_SECURITY_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>(
  [
    NotificationType.SECURITY_EMAIL_VERIFICATION,
    NotificationType.SECURITY_PASSWORD_RESET,
    NotificationType.ACCOUNT_SUSPENDED,
    NotificationType.ACCOUNT_REJECTED,
    NotificationType.ACCOUNT_APPROVED,
    NotificationType.ORGANIZER_INVITATION_CREATED,
    NotificationType.ORGANIZER_INVITATION_ACCEPTED,
    NotificationType.RFQ_SENT,
    NotificationType.RFQ_QUOTED,
    NotificationType.RFQ_ACCEPTED,
    NotificationType.RFQ_REJECTED,
    NotificationType.RFQ_CANCELLED,
    NotificationType.C2B_BOOKING_REQUESTED,
    NotificationType.C2B_BOOKING_STATUS_CHANGED,
    NotificationType.SPONSOR_AD_APPROVED,
    NotificationType.SPONSOR_AD_REJECTED,
  ],
);

/**
 * Default notification preferences per type and channel.
 */
export interface DefaultPreference {
  inApp: boolean;
  push: boolean;
  email: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<NotificationType, DefaultPreference> = {
  [NotificationType.EVENT_PUBLISHED]: { inApp: true, push: false, email: false },
  [NotificationType.EVENT_CANCELLED]: { inApp: true, push: true, email: true },
  [NotificationType.SESSION_REMINDER]: { inApp: true, push: true, email: false },
  [NotificationType.COMMUNITY_POST_MENTION]: { inApp: true, push: true, email: false },
  [NotificationType.COMMUNITY_POST_REPLY]: { inApp: true, push: true, email: false },
  [NotificationType.COMMUNITY_MEETUP_CREATED]: { inApp: true, push: false, email: false },
  [NotificationType.COMMUNITY_MEETUP_REMINDER]: { inApp: true, push: true, email: false },
  [NotificationType.COMMUNITY_MEMBER_ACTION]: { inApp: true, push: false, email: false },
  [NotificationType.COMMUNITY_MODERATION_ACTION]: { inApp: true, push: true, email: true },
  [NotificationType.CHAT_MESSAGE]: { inApp: true, push: true, email: false },
  [NotificationType.SECURITY_EMAIL_VERIFICATION]: { inApp: true, push: true, email: true },
  [NotificationType.SECURITY_PASSWORD_RESET]: { inApp: true, push: true, email: true },
  [NotificationType.ACCOUNT_APPROVED]: { inApp: true, push: true, email: true },
  [NotificationType.ACCOUNT_REJECTED]: { inApp: true, push: true, email: true },
  [NotificationType.ACCOUNT_SUSPENDED]: { inApp: true, push: true, email: true },
  [NotificationType.ORGANIZER_INVITATION_CREATED]: { inApp: true, push: true, email: true },
  [NotificationType.ORGANIZER_INVITATION_ACCEPTED]: { inApp: true, push: true, email: true },
  [NotificationType.RFQ_SENT]: { inApp: true, push: true, email: true },
  [NotificationType.RFQ_VIEWED]: { inApp: true, push: false, email: false },
  [NotificationType.RFQ_CLARIFICATION_REQUESTED]: { inApp: true, push: true, email: true },
  [NotificationType.RFQ_QUOTED]: { inApp: true, push: true, email: true },
  [NotificationType.RFQ_ACCEPTED]: { inApp: true, push: true, email: true },
  [NotificationType.RFQ_REJECTED]: { inApp: true, push: true, email: true },
  [NotificationType.RFQ_CANCELLED]: { inApp: true, push: true, email: true },
  [NotificationType.RFQ_EXPIRED]: { inApp: true, push: true, email: false },
  [NotificationType.C2B_BOOKING_REQUESTED]: { inApp: true, push: true, email: true },
  [NotificationType.C2B_BOOKING_STATUS_CHANGED]: { inApp: true, push: true, email: true },
  [NotificationType.SPONSOR_AD_SUBMITTED]: { inApp: true, push: false, email: true },
  [NotificationType.SPONSOR_AD_APPROVED]: { inApp: true, push: true, email: true },
  [NotificationType.SPONSOR_AD_REJECTED]: { inApp: true, push: true, email: true },
  [NotificationType.COUPON_REDEEMED]: { inApp: true, push: false, email: true },
};

export const NOTIFICATION_OUTBOX_EVENTS = {
  NOTIFICATION_CREATED: 'NOTIFICATION_CREATED',
  NOTIFICATION_DELIVERED: 'NOTIFICATION_DELIVERED',
  NOTIFICATION_FAILED: 'NOTIFICATION_FAILED',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  NOTIFICATION_ALL_READ: 'NOTIFICATION_ALL_READ',
  DEVICE_REGISTERED: 'DEVICE_REGISTERED',
  DEVICE_REVOKED: 'DEVICE_REVOKED',
  PREFERENCE_UPDATED: 'NOTIFICATION_PREFERENCE_UPDATED',
} as const;

export const NOTIFICATION_AUDIT_ACTIONS = {
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  NOTIFICATION_ALL_READ: 'NOTIFICATION_ALL_READ',
  DEVICE_REGISTER: 'DEVICE_REGISTER',
  DEVICE_REVOKE: 'DEVICE_REVOKE',
  PREFERENCE_UPDATE: 'NOTIFICATION_PREFERENCE_UPDATE',
} as const;

export const NOTIFICATION_SOCKET_EVENTS = {
  NOTIFICATION_CREATED: 'notification.created',
  UNREAD_COUNT_UPDATED: 'notification.unread_count',
} as const;
