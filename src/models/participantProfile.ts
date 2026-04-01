import { PrismaClient, Prisma } from '@prisma/client';
import {
  Participant,
  ParticipantRole,
  CommunicationPreference,
  MeetingInteraction,
  ParticipantWithRoles,
  ParticipantWithInteractions,
  ParticipantProfile,
  CreateParticipantInput,
  UpdateParticipantInput,
  CreateRoleInput,
  UpdatePreferencesInput,
  FindParticipantsOptions,
  PaginatedResult,
  PrivacyContext,
  PrivacySettings,
  RoleType,
  EmailFrequency,
  NotificationType,
} from '../types/participant';

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  limitDataVisibility: false,
  allowHistoryAccess: true,
  shareContactInfo: true,
};

const DEFAULT_PAGE_SIZE = 20;

export class ParticipantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateParticipantInput): Promise<Participant> {
    const privacySettings: PrivacySettings = {
      ...DEFAULT_PRIVACY_SETTINGS,
      ...input.privacySettings,
    };

    const participant = await this.prisma.participant.create({
      data: {
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        isGuest: input.isGuest ?? false,
        privacySettings: privacySettings as unknown as Prisma.JsonObject,
      },
    });

    return this.mapParticipant(participant);
  }

  async findById(id: string): Promise<Participant | null> {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
    });

    return participant ? this.mapParticipant(participant) : null;
  }

  async findByEmail(email: string): Promise<Participant | null> {
    const participant = await this.prisma.participant.findUnique({
      where: { email },
    });

    return participant ? this.mapParticipant(participant) : null;
  }

  async update(id: string, input: UpdateParticipantInput): Promise<Participant> {
    const existing = await this.prisma.participant.findUniqueOrThrow({ where: { id } });
    const currentPrivacy = existing.privacySettings as unknown as PrivacySettings;

    const updatedPrivacy: PrivacySettings = input.privacySettings
      ? { ...currentPrivacy, ...input.privacySettings }
      : currentPrivacy;

    const participant = await this.prisma.participant.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        privacySettings: updatedPrivacy as unknown as Prisma.JsonObject,
      },
    });

    return this.mapParticipant(participant);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.participant.delete({ where: { id } });
  }

  async findMany(options: FindParticipantsOptions = {}): Promise<PaginatedResult<ParticipantWithRoles>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ParticipantWhereInput = {};

    if (!options.includeGuests) {
      where.isGuest = false;
    }

    if (options.department || options.roleType) {
      where.roles = {
        some: {
          isActive: true,
          ...(options.department && { department: options.department }),
          ...(options.roleType && { roleType: options.roleType }),
        },
      };
    }

    const [participants, total] = await Promise.all([
      this.prisma.participant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: { where: { isActive: true } },
          preferences: true,
        },
      }),
      this.prisma.participant.count({ where }),
    ]);

    return {
      data: participants.map((p) => this.mapParticipantWithRoles(p)),
      total,
      page,
      pageSize,
    };
  }

  async findWithProfile(id: string): Promise<ParticipantProfile | null> {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: {
        roles: { orderBy: { startDate: 'desc' } },
        preferences: true,
        interactions: { orderBy: { joinedAt: 'desc' }, take: 50 },
      },
    });

    return participant ? this.mapParticipantProfile(participant) : null;
  }

  async getProfileForViewer(id: string, context: PrivacyContext): Promise<Partial<ParticipantProfile> | null> {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: {
        roles: { where: { isActive: true } },
        preferences: context.canViewPersonalInfo,
        interactions: context.canViewHistory,
      },
    });

    if (!participant) return null;

    const privacy = participant.privacySettings as unknown as PrivacySettings;

    const canViewPersonal = context.canViewPersonalInfo && !privacy.limitDataVisibility;
    const canViewHistory = context.canViewHistory && privacy.allowHistoryAccess;

    return {
      id: participant.id,
      email: canViewPersonal && privacy.shareContactInfo ? participant.email : undefined,
      firstName: canViewPersonal ? participant.firstName ?? undefined : undefined,
      lastName: canViewPersonal ? participant.lastName ?? undefined : undefined,
      isGuest: participant.isGuest,
      privacySettings: privacy,
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
      roles: participant.roles.map(this.mapRole),
      preferences: canViewPersonal && participant.preferences
        ? this.mapPreference(participant.preferences)
        : null,
      interactions: canViewHistory && Array.isArray(participant.interactions)
        ? participant.interactions.map(this.mapInteraction)
        : [],
    };
  }

  // Role management

  async addRole(input: CreateRoleInput): Promise<ParticipantRole> {
    const role = await this.prisma.participantRole.create({
      data: {
        participantId: input.participantId,
        roleType: input.roleType,
        department: input.department ?? null,
        startDate: input.startDate ?? new Date(),
        endDate: input.endDate ?? null,
        isActive: true,
      },
    });

    return this.mapRole(role);
  }

  async deactivateRole(roleId: string, endDate: Date = new Date()): Promise<ParticipantRole> {
    const role = await this.prisma.participantRole.update({
      where: { id: roleId },
      data: { isActive: false, endDate },
    });

    return this.mapRole(role);
  }

  async getActiveRoles(participantId: string): Promise<ParticipantRole[]> {
    const roles = await this.prisma.participantRole.findMany({
      where: { participantId, isActive: true },
      orderBy: { startDate: 'desc' },
    });

    return roles.map(this.mapRole);
  }

  async getRoleHistory(participantId: string): Promise<ParticipantRole[]> {
    const roles = await this.prisma.participantRole.findMany({
      where: { participantId },
      orderBy: { startDate: 'desc' },
    });

    return roles.map(this.mapRole);
  }

  // Communication preferences

  async upsertPreferences(
    participantId: string,
    input: UpdatePreferencesInput,
  ): Promise<CommunicationPreference> {
    const pref = await this.prisma.communicationPreference.upsert({
      where: { participantId },
      update: {
        ...(input.emailFrequency !== undefined && { emailFrequency: input.emailFrequency }),
        ...(input.notificationTypes !== undefined && { notificationTypes: input.notificationTypes }),
        ...(input.settings !== undefined && { settings: input.settings as Prisma.JsonObject }),
      },
      create: {
        participantId,
        emailFrequency: input.emailFrequency ?? EmailFrequency.DAILY,
        notificationTypes: input.notificationTypes ?? [NotificationType.MEETING_INVITE],
        settings: (input.settings ?? {}) as Prisma.JsonObject,
      },
    });

    return this.mapPreference(pref);
  }

  async getPreferences(participantId: string): Promise<CommunicationPreference | null> {
    const pref = await this.prisma.communicationPreference.findUnique({
      where: { participantId },
    });

    return pref ? this.mapPreference(pref) : null;
  }

  // Meeting interactions

  async recordInteraction(
    participantId: string,
    meetingId: string,
    joinedAt: Date,
  ): Promise<MeetingInteraction> {
    const interaction = await this.prisma.meetingInteraction.create({
      data: { participantId, meetingId, joinedAt },
    });

    return this.mapInteraction(interaction);
  }

  async closeInteraction(interactionId: string, leftAt: Date = new Date()): Promise<MeetingInteraction> {
    const interaction = await this.prisma.meetingInteraction.findUniqueOrThrow({
      where: { id: interactionId },
    });

    const durationMinutes = Math.round(
      (leftAt.getTime() - interaction.joinedAt.getTime()) / 60000,
    );

    const updated = await this.prisma.meetingInteraction.update({
      where: { id: interactionId },
      data: { leftAt, durationMinutes },
    });

    return this.mapInteraction(updated);
  }

  async getInteractionHistory(
    participantId: string,
    limit = 50,
  ): Promise<MeetingInteraction[]> {
    const interactions = await this.prisma.meetingInteraction.findMany({
      where: { participantId },
      orderBy: { joinedAt: 'desc' },
      take: limit,
    });

    return interactions.map(this.mapInteraction);
  }

  // Private mappers

  private mapParticipant(raw: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isGuest: boolean;
    privacySettings: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): Participant {
    return {
      id: raw.id,
      email: raw.email,
      firstName: raw.firstName,
      lastName: raw.lastName,
      isGuest: raw.isGuest,
      privacySettings: (raw.privacySettings as unknown as PrivacySettings) ?? DEFAULT_PRIVACY_SETTINGS,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapRole(raw: {
    id: string;
    participantId: string;
    roleType: string;
    department: string | null;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
  }): ParticipantRole {
    return {
      id: raw.id,
      participantId: raw.participantId,
      roleType: raw.roleType as RoleType,
      department: raw.department,
      startDate: raw.startDate,
      endDate: raw.endDate,
      isActive: raw.isActive,
    };
  }

  private mapPreference(raw: {
    id: string;
    participantId: string;
    emailFrequency: string;
    notificationTypes: string[];
    settings: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): CommunicationPreference {
    return {
      id: raw.id,
      participantId: raw.participantId,
      emailFrequency: raw.emailFrequency as EmailFrequency,
      notificationTypes: raw.notificationTypes as NotificationType[],
      settings: (raw.settings as Record<string, unknown>) ?? {},
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapInteraction(raw: {
    id: string;
    participantId: string;
    meetingId: string;
    joinedAt: Date;
    leftAt: Date | null;
    durationMinutes: number | null;
    createdAt: Date;
  }): MeetingInteraction {
    return {
      id: raw.id,
      participantId: raw.participantId,
      meetingId: raw.meetingId,
      joinedAt: raw.joinedAt,
      leftAt: raw.leftAt,
      durationMinutes: raw.durationMinutes,
      createdAt: raw.createdAt,
    };
  }

  private mapParticipantWithRoles(raw: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isGuest: boolean;
    privacySettings: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{
      id: string;
      participantId: string;
      roleType: string;
      department: string | null;
      startDate: Date;
      endDate: Date | null;
      isActive: boolean;
    }>;
    preferences: {
      id: string;
      participantId: string;
      emailFrequency: string;
      notificationTypes: string[];
      settings: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
    } | null;
  }): ParticipantWithRoles {
    return {
      ...this.mapParticipant(raw),
      roles: raw.roles.map(this.mapRole),
      preferences: raw.preferences ? this.mapPreference(raw.preferences) : null,
    };
  }

  private mapParticipantProfile(raw: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isGuest: boolean;
    privacySettings: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{
      id: string;
      participantId: string;
      roleType: string;
      department: string | null;
      startDate: Date;
      endDate: Date | null;
      isActive: boolean;
    }>;
    preferences: {
      id: string;
      participantId: string;
      emailFrequency: string;
      notificationTypes: string[];
      settings: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
    } | null;
    interactions: Array<{
      id: string;
      participantId: string;
      meetingId: string;
      joinedAt: Date;
      leftAt: Date | null;
      durationMinutes: number | null;
      createdAt: Date;
    }>;
  }): ParticipantProfile {
    return {
      ...this.mapParticipant(raw),
      roles: raw.roles.map(this.mapRole),
      preferences: raw.preferences ? this.mapPreference(raw.preferences) : null,
      interactions: raw.interactions.map(this.mapInteraction),
    };
  }
}
