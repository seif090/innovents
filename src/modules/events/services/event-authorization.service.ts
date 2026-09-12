import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Event, EventStatus, EventVisibility } from '@prisma/client';

@Injectable()
export class EventAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asserts that a user has management authorization over a specific event.
   * Authorized managers:
   * - ADMIN: Universal system management override.
   * - EVENT_OWNER: The specific creator/owner of the event.
   * - ORGANIZER: An organizer explicitly assigned to the event in event_organizers.
   *
   * Returns the Event record for downstream usage to eliminate duplicate DB reads.
   */
  async assertCanManageEvent(userId: string, userRoles: string[], eventId: string): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // 1. Admin universal override
    if (userRoles.includes('ADMIN')) {
      return event;
    }

    // 2. Event Owner check
    if (event.ownerId === userId) {
      return event;
    }

    // 3. Assigned Organizer check
    if (userRoles.includes('ORGANIZER')) {
      const assignment = await this.prisma.eventOrganizer.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
      });

      if (assignment) {
        return event;
      }
    }

    throw new ForbiddenException('You do not have permission to manage this event');
  }

  /**
   * Asserts whether a user is authorized to view an event.
   * Non-public/draft events return 404 to unauthenticated or unauthorized users to prevent enumeration.
   */
  async assertCanViewEvent(
    eventId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Publicly accessible if published/ongoing/completed and PUBLIC visibility
    const isPublicEligible =
      event.visibility === EventVisibility.PUBLIC &&
      (event.status === EventStatus.PUBLISHED ||
        event.status === EventStatus.ONGOING ||
        event.status === EventStatus.COMPLETED);

    if (isPublicEligible) {
      return event;
    }

    // Private or Draft/Cancelled events require authorized manager access
    if (!userId) {
      throw new NotFoundException('Event not found');
    }

    if (userRoles.includes('ADMIN') || event.ownerId === userId) {
      return event;
    }

    if (userRoles.includes('ORGANIZER')) {
      const assignment = await this.prisma.eventOrganizer.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
      });

      if (assignment) {
        return event;
      }
    }

    throw new NotFoundException('Event not found');
  }

  /**
   * Asserts that a user is authorized to create or revoke organizer invitations for an event.
   * Only ADMIN or the specific EVENT_OWNER is permitted. Assigned ORGANIZERs cannot invite other organizers.
   */
  async assertCanInviteOrganizer(
    userId: string,
    userRoles: string[],
    eventId: string,
  ): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (userRoles.includes('ADMIN') || event.ownerId === userId) {
      return event;
    }

    throw new ForbiddenException('Only the event owner or an administrator can invite organizers');
  }
}
