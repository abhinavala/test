// Enums

export enum RoleType {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  ENGINEER = 'ENGINEER',
  DESIGNER = 'DESIGNER',
  PRODUCT = 'PRODUCT',
  SALES = 'SALES',
  MARKETING = 'MARKETING',
  SUPPORT = 'SUPPORT',
  GUEST = 'GUEST',
  OTHER = 'OTHER',
}

export enum EmailFrequency {
  IMMEDIATE = 'IMMEDIATE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  NEVER = 'NEVER',
}

export enum NotificationType {
  MEETING_INVITE = 'MEETING_INVITE',
  MEETING_REMINDER = 'MEETING_REMINDER',
  MEETING_SUMMARY = 'MEETING_SUMMARY',
  ACTION_ITEM = 'ACTION_ITEM',
  MENTION = 'MENTION',
}

// Core data interfaces

export interface Participant {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isGuest: boolean;
  privacySettings: PrivacySettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantRole {
  id: string;
  participantId: string;
  roleType: RoleType;
  department: string | null;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
}

export interface CommunicationPreference {
  id: string;
  participantId: string;
  emailFrequency: EmailFrequency;
  notificationTypes: NotificationType[];
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingInteraction {
  id: string;
  participantId: string;
  meetingId: string;
  joinedAt: Date;
  leftAt: Date | null;
  durationMinutes: number | null;
  createdAt: Date;
}

export interface PrivacySettings {
  limitDataVisibility: boolean;
  allowHistoryAccess: boolean;
  shareContactInfo: boolean;
}

// Composite types for queries

export interface ParticipantWithRoles extends Participant {
  roles: ParticipantRole[];
  preferences: CommunicationPreference | null;
}

export interface ParticipantWithInteractions extends Participant {
  roles: ParticipantRole[];
  interactions: MeetingInteraction[];
}

export interface ParticipantProfile extends Participant {
  roles: ParticipantRole[];
  preferences: CommunicationPreference | null;
  interactions: MeetingInteraction[];
}

// Input/output types

export interface CreateParticipantInput {
  email: string;
  firstName?: string;
  lastName?: string;
  isGuest?: boolean;
  privacySettings?: Partial<PrivacySettings>;
}

export interface UpdateParticipantInput {
  firstName?: string;
  lastName?: string;
  privacySettings?: Partial<PrivacySettings>;
}

export interface CreateRoleInput {
  participantId: string;
  roleType: RoleType;
  department?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface UpdatePreferencesInput {
  emailFrequency?: EmailFrequency;
  notificationTypes?: NotificationType[];
  settings?: Record<string, unknown>;
}

// Privacy context for data access control

export interface PrivacyContext {
  viewerId: string;
  canViewPersonalInfo: boolean;
  canViewHistory: boolean;
}

// Paginated results

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FindParticipantsOptions {
  page?: number;
  pageSize?: number;
  includeGuests?: boolean;
  department?: string;
  roleType?: RoleType;
}
