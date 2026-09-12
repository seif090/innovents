/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, C2bBookingStatus } from '@prisma/client';
import { CreateC2bBookingDto } from '../dto/create-c2b-booking.dto';
import { UpdateC2bBookingStatusDto } from '../dto/update-c2b-booking-status.dto';
import { C2bBookingResponseDto, PaginatedC2bBookingsDto } from '../dto/c2b-booking-response.dto';

@Injectable()
export class C2bBookingsService {
  private readonly logger = new Logger(C2bBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Attendee creates a booking or contact request with transaction-safe capacity check
   */
  async createBooking(
    attendeeId: string,
    dto: CreateC2bBookingDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<C2bBookingResponseDto> {
    const now = new Date();

    // Fetch service and related event and provider
    const service = await this.prisma.c2bService.findFirst({
      where: {
        id: dto.serviceId,
        deletedAt: null,
      },
      include: {
        event: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (!service.isAvailable) {
      throw new BadRequestException('Service is currently not available for bookings');
    }

    if (service.expiresAt <= now) {
      throw new BadRequestException('Service offering has expired');
    }

    if (service.event.endsAt <= now) {
      throw new BadRequestException('Associated event has ended');
    }

    if (service.provider.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Service provider is not active');
    }

    // Atomic Capacity & Booking Creation in Transaction
    const booking = await this.prisma.$transaction(async (tx) => {
      // If service has a maxBookings capacity, enforce it atomically using conditional UPDATE
      if (service.maxBookings !== null) {
        const updateResult = await tx.$executeRaw`
          UPDATE c2b_services
          SET booking_count = booking_count + 1
          WHERE id = ${dto.serviceId}::uuid
            AND is_available = true
            AND expires_at > NOW()
            AND deleted_at IS NULL
            AND (max_bookings IS NULL OR booking_count < max_bookings)
        `;

        if (updateResult === 0) {
          throw new ConflictException('Booking capacity for this service has been reached');
        }
      } else {
        await tx.$executeRaw`
          UPDATE c2b_services
          SET booking_count = booking_count + 1
          WHERE id = ${dto.serviceId}::uuid
        `;
      }

      const newBooking = await tx.c2bBooking.create({
        data: {
          serviceId: dto.serviceId,
          attendeeId,
          providerId: service.providerId,
          eventId: service.eventId,
          status: C2bBookingStatus.PENDING,
          notes: dto.notes,
          contactMethod: dto.contactMethod || service.contactMethod,
          contactValue: dto.contactValue,
          requestedDate: dto.requestedDate ? new Date(dto.requestedDate) : null,
        },
        include: {
          service: true,
          provider: { include: { providerProfile: true } },
          attendee: true,
        },
      });

      // Enqueue outbox notification to provider
      await this.outboxService.enqueue(
        {
          eventType: 'C2B_BOOKING_REQUESTED',
          aggregateType: 'c2b_booking',
          aggregateId: newBooking.id,
          payload: {
            bookingId: newBooking.id,
            providerId: service.providerId,
            attendeeId,
            serviceName: service.name,
            requestedDate: newBooking.requestedDate?.toISOString(),
          },
        },
        tx,
      );

      return newBooking;
    });

    await this.auditService.log({
      actorUserId: attendeeId,
      action: 'C2B_BOOKING_CREATED',
      resourceType: 'c2b_booking',
      resourceId: booking.id,
      ipAddress,
      userAgent,
      metadata: {
        serviceId: dto.serviceId,
        providerId: service.providerId,
      },
    });

    this.logger.log(
      `Booking ${booking.id} created for attendee ${attendeeId} on service ${dto.serviceId}`,
    );
    return this.mapToDto(booking);
  }

  /**
   * Provider responds / updates booking status
   */
  async updateBookingStatus(
    providerId: string,
    bookingId: string,
    dto: UpdateC2bBookingStatusDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<C2bBookingResponseDto> {
    const booking = await this.prisma.c2bBooking.findFirst({
      where: { id: bookingId },
      include: {
        service: true,
        provider: { include: { providerProfile: true } },
        attendee: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking request not found');
    }

    if (booking.providerId !== providerId) {
      throw new ForbiddenException('You are not authorized to manage this booking');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      // If rejected or cancelled from an active status, decrement bookingCount
      if (
        (dto.status === C2bBookingStatus.REJECTED || dto.status === C2bBookingStatus.CANCELLED) &&
        booking.status !== C2bBookingStatus.REJECTED &&
        booking.status !== C2bBookingStatus.CANCELLED
      ) {
        await tx.$executeRaw`
          UPDATE c2b_services
          SET booking_count = GREATEST(0, booking_count - 1)
          WHERE id = ${booking.serviceId}::uuid
        `;
      }

      const res = await tx.c2bBooking.update({
        where: { id: bookingId },
        data: {
          status: dto.status,
          providerNotes: dto.providerNotes,
          ...(dto.status === C2bBookingStatus.CONFIRMED && { confirmedAt: now }),
          ...(dto.status === C2bBookingStatus.CANCELLED && { cancelledAt: now }),
          ...(dto.status === C2bBookingStatus.COMPLETED && { completedAt: now }),
        },
        include: {
          service: true,
          provider: { include: { providerProfile: true } },
          attendee: true,
        },
      });

      // Outbox notification to attendee
      await this.outboxService.enqueue(
        {
          eventType: 'C2B_BOOKING_STATUS_CHANGED',
          aggregateType: 'c2b_booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            attendeeId: booking.attendeeId,
            status: dto.status,
            serviceName: booking.service.name,
            providerNotes: dto.providerNotes,
          },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: providerId,
      action: 'C2B_BOOKING_STATUS_UPDATED',
      resourceType: 'c2b_booking',
      resourceId: bookingId,
      ipAddress,
      userAgent,
      metadata: { newStatus: dto.status, notes: dto.providerNotes },
    });

    return this.mapToDto(updated);
  }

  /**
   * Attendee cancels their own booking
   */
  async cancelBooking(
    attendeeId: string,
    bookingId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<C2bBookingResponseDto> {
    const booking = await this.prisma.c2bBooking.findFirst({
      where: { id: bookingId },
      include: {
        service: true,
        provider: { include: { providerProfile: true } },
        attendee: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking request not found');
    }

    if (booking.attendeeId !== attendeeId) {
      throw new ForbiddenException('You are not authorized to cancel this booking');
    }

    if (booking.status === C2bBookingStatus.CANCELLED) {
      return this.mapToDto(booking);
    }

    if (booking.status === C2bBookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed booking');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE c2b_services
        SET booking_count = GREATEST(0, booking_count - 1)
        WHERE id = ${booking.serviceId}::uuid
      `;

      const res = await tx.c2bBooking.update({
        where: { id: bookingId },
        data: {
          status: C2bBookingStatus.CANCELLED,
          cancelledAt: now,
        },
        include: {
          service: true,
          provider: { include: { providerProfile: true } },
          attendee: true,
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'C2B_BOOKING_STATUS_CHANGED',
          aggregateType: 'c2b_booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            attendeeId: booking.attendeeId,
            status: C2bBookingStatus.CANCELLED,
            serviceName: booking.service.name,
          },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: attendeeId,
      action: 'C2B_BOOKING_CANCELLED',
      resourceType: 'c2b_booking',
      resourceId: bookingId,
      ipAddress,
      userAgent,
    });

    return this.mapToDto(updated);
  }

  /**
   * Attendee lists their own bookings
   */
  async getAttendeeBookings(
    attendeeId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedC2bBookingsDto> {
    const skip = (page - 1) * pageSize;
    const where = { attendeeId };

    const [total, bookings] = await Promise.all([
      this.prisma.c2bBooking.count({ where }),
      this.prisma.c2bBooking.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          service: true,
          provider: { include: { providerProfile: true } },
          attendee: true,
        },
      }),
    ]);

    return {
      items: bookings.map((b) => this.mapToDto(b)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Provider lists received booking requests
   */
  async getProviderBookings(
    providerId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedC2bBookingsDto> {
    const skip = (page - 1) * pageSize;
    const where = { providerId };

    const [total, bookings] = await Promise.all([
      this.prisma.c2bBooking.count({ where }),
      this.prisma.c2bBooking.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          service: true,
          provider: { include: { providerProfile: true } },
          attendee: true,
        },
      }),
    ]);

    return {
      items: bookings.map((b) => this.mapToDto(b)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Get single booking by ID with ownership enforcement
   */
  async getBookingById(userId: string, bookingId: string): Promise<C2bBookingResponseDto> {
    const booking = await this.prisma.c2bBooking.findFirst({
      where: { id: bookingId },
      include: {
        service: true,
        provider: { include: { providerProfile: true } },
        attendee: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking request not found');
    }

    if (booking.attendeeId !== userId && booking.providerId !== userId) {
      throw new ForbiddenException('You are not authorized to view this booking request');
    }

    return this.mapToDto(booking);
  }

  private mapToDto(booking: any): C2bBookingResponseDto {
    return {
      id: booking.id,
      serviceId: booking.serviceId,
      attendeeId: booking.attendeeId,
      providerId: booking.providerId,
      eventId: booking.eventId,
      status: booking.status,
      notes: booking.notes,
      providerNotes: booking.providerNotes,
      contactMethod: booking.contactMethod,
      contactValue: booking.contactValue,
      requestedDate: booking.requestedDate,
      confirmedAt: booking.confirmedAt,
      cancelledAt: booking.cancelledAt,
      completedAt: booking.completedAt,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      service: booking.service
        ? {
            name: booking.service.name,
            category: booking.service.category,
            price: booking.service.price ? Number(booking.service.price) : null,
            currency: booking.service.currency,
          }
        : undefined,
      provider: booking.provider?.providerProfile
        ? {
            businessName: booking.provider.providerProfile.businessName,
            contactEmail: booking.provider.providerProfile.contactEmail,
            contactPhone: booking.provider.providerProfile.contactPhone,
          }
        : undefined,
      attendee: booking.attendee
        ? {
            email: booking.attendee.email,
            phone: booking.attendee.phone,
          }
        : undefined,
    };
  }
}
