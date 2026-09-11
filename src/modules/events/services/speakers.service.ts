import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EventAuthorizationService } from './event-authorization.service';
import {
  CreateSpeakerDto,
  UpdateSpeakerDto,
  SpeakerResponseDto,
} from '../dto/speaker-response.dto';
import { EVENT_EVENTS, EVENT_RESOURCE_TYPE } from '../constants/events.constants';
import { Speaker } from '@prisma/client';

@Injectable()
export class SpeakersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventAuthService: EventAuthorizationService,
  ) {}

  /**
   * Creates a new speaker for an event
   */
  async create(
    eventId: string,
    userId: string,
    userRoles: string[],
    dto: CreateSpeakerDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SpeakerResponseDto> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const speaker = await this.prisma.speaker.create({
      data: {
        eventId,
        fullName: dto.fullName.trim(),
        jobTitle: dto.jobTitle.trim(),
        company: dto.company.trim(),
        bio: dto.bio?.trim() || null,
        photoUrl: dto.photoUrl?.trim() || null,
        linkedinUrl: dto.linkedinUrl?.trim() || null,
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.SPEAKER_CREATED,
      resourceType: EVENT_RESOURCE_TYPE.SPEAKER,
      resourceId: speaker.id,
      metadata: { eventId, fullName: speaker.fullName },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(speaker);
  }

  /**
   * Lists all speakers for an event
   */
  async findAll(
    eventId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<SpeakerResponseDto[]> {
    await this.eventAuthService.assertCanViewEvent(eventId, userId, userRoles);

    const speakers = await this.prisma.speaker.findMany({
      where: { eventId },
      orderBy: { fullName: 'asc' },
    });

    return speakers.map((s) => this.mapToResponse(s));
  }

  /**
   * Retrieves single speaker by ID
   */
  async findById(
    eventId: string,
    speakerId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<SpeakerResponseDto> {
    await this.eventAuthService.assertCanViewEvent(eventId, userId, userRoles);

    const speaker = await this.prisma.speaker.findFirst({
      where: { id: speakerId, eventId },
    });

    if (!speaker) {
      throw new NotFoundException('Speaker not found in this event');
    }

    return this.mapToResponse(speaker);
  }

  /**
   * Updates an existing speaker
   */
  async update(
    eventId: string,
    speakerId: string,
    userId: string,
    userRoles: string[],
    dto: UpdateSpeakerDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SpeakerResponseDto> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const speaker = await this.prisma.speaker.findFirst({
      where: { id: speakerId, eventId },
    });

    if (!speaker) {
      throw new NotFoundException('Speaker not found in this event');
    }

    const updated = await this.prisma.speaker.update({
      where: { id: speakerId },
      data: {
        fullName: dto.fullName?.trim(),
        jobTitle: dto.jobTitle?.trim(),
        company: dto.company?.trim(),
        bio: dto.bio !== undefined ? dto.bio?.trim() || null : undefined,
        photoUrl: dto.photoUrl !== undefined ? dto.photoUrl?.trim() || null : undefined,
        linkedinUrl: dto.linkedinUrl !== undefined ? dto.linkedinUrl?.trim() || null : undefined,
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.SPEAKER_UPDATED,
      resourceType: EVENT_RESOURCE_TYPE.SPEAKER,
      resourceId: speakerId,
      metadata: { eventId, modifiedFields: Object.keys(dto) },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Deletes a speaker (enforcing User Feedback Rule 3: block if assigned to sessions)
   */
  async delete(
    eventId: string,
    speakerId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const speaker = await this.prisma.speaker.findFirst({
      where: { id: speakerId, eventId },
    });

    if (!speaker) {
      throw new NotFoundException('Speaker not found in this event');
    }

    // User Feedback Rule 3: Cannot delete speaker assigned to existing sessions
    const assignedSessionsCount = await this.prisma.sessionSpeaker.count({
      where: {
        speakerId,
        session: { deletedAt: null },
      },
    });

    if (assignedSessionsCount > 0) {
      throw new ConflictException(
        `Cannot delete speaker: speaker is assigned to ${assignedSessionsCount} session(s). Unassign speaker first.`,
      );
    }

    await this.prisma.speaker.delete({
      where: { id: speakerId },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.SPEAKER_DELETED,
      resourceType: EVENT_RESOURCE_TYPE.SPEAKER,
      resourceId: speakerId,
      metadata: { eventId, fullName: speaker.fullName },
      ipAddress,
      userAgent,
    });
  }

  private mapToResponse(speaker: Speaker): SpeakerResponseDto {
    return {
      id: speaker.id,
      eventId: speaker.eventId,
      fullName: speaker.fullName,
      jobTitle: speaker.jobTitle,
      company: speaker.company,
      bio: speaker.bio,
      photoUrl: speaker.photoUrl,
      linkedinUrl: speaker.linkedinUrl,
      createdAt: speaker.createdAt.toISOString(),
      updatedAt: speaker.updatedAt.toISOString(),
    };
  }
}
