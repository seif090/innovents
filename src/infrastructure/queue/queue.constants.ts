export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  NOTIFICATIONS: 'notifications-queue',
  REMINDERS: 'reminders-queue',
  ANALYTICS: 'analytics-queue',
  CLEANUP: 'cleanup-queue',
  PAYMENTS: 'payments-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
