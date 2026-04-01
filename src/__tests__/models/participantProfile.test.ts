import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParticipantRepository } from '../../models/participantProfile';
import {
  RoleType,
  EmailFrequency,
  NotificationType,
  PrivacyContext,
} from '../../types/participant';

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrismaMock() {
  const participant = {
    create: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };

  const participantRole = {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };

  const communicationPreference = {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  };

  const meetingInteraction = {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };

  return {
    participant,
    participantRole,
    communicationPreference,
    meetingInteraction,
  } as unknown as import('@prisma/client').PrismaClient;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseParticipant = {
  id: 'p1',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  isGuest: false,
  privacySettings: {
    limitDataVisibility: false,
    allowHistoryAccess: true,
    shareContactInfo: true,
  },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const baseRole = {
  id: 'r1',
  participantId: 'p1',
  roleType: 'ENGINEER',
  department: 'Platform',
  startDate: new Date('2024-01-01'),
  endDate: null,
  isActive: true,
};

const basePreference = {
  id: 'pref1',
  participantId: 'p1',
  emailFrequency: 'DAILY',
  notificationTypes: ['MEETING_INVITE'],
  settings: {},
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const baseInteraction = {
  id: 'i1',
  participantId: 'p1',
  meetingId: 'm1',
  joinedAt: new Date('2024-06-01T09:00:00Z'),
  leftAt: new Date('2024-06-01T10:00:00Z'),
  durationMinutes: 60,
  createdAt: new Date('2024-06-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ParticipantRepository', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let repo: ParticipantRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    repo = new ParticipantRepository(prisma as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  // --- create ---------------------------------------------------------------

  describe('create', () => {
    it('creates a participant with defaults', async () => {
      (prisma.participant.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseParticipant);

      const result = await repo.create({ email: 'alice@example.com' });

      expect(prisma.participant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'alice@example.com', isGuest: false }),
        }),
      );
      expect(result.email).toBe('alice@example.com');
    });

    it('creates a guest participant', async () => {
      const guestRaw = { ...baseParticipant, isGuest: true };
      (prisma.participant.create as ReturnType<typeof vi.fn>).mockResolvedValue(guestRaw);

      const result = await repo.create({ email: 'guest@example.com', isGuest: true });

      expect(result.isGuest).toBe(true);
    });

    it('merges partial privacy settings with defaults', async () => {
      (prisma.participant.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseParticipant);

      await repo.create({
        email: 'alice@example.com',
        privacySettings: { limitDataVisibility: true },
      });

      const callArg = (prisma.participant.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.data.privacySettings.limitDataVisibility).toBe(true);
      expect(callArg.data.privacySettings.shareContactInfo).toBe(true);
    });
  });

  // --- findById -------------------------------------------------------------

  describe('findById', () => {
    it('returns a participant when found', async () => {
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseParticipant);

      const result = await repo.findById('p1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('p1');
    });

    it('returns null when not found', async () => {
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await repo.findById('unknown');

      expect(result).toBeNull();
    });
  });

  // --- findByEmail ----------------------------------------------------------

  describe('findByEmail', () => {
    it('returns participant by email', async () => {
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseParticipant);

      const result = await repo.findByEmail('alice@example.com');

      expect(result?.email).toBe('alice@example.com');
    });
  });

  // --- update ---------------------------------------------------------------

  describe('update', () => {
    it('merges privacy settings on update', async () => {
      (prisma.participant.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(baseParticipant);
      (prisma.participant.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...baseParticipant,
        firstName: 'Alicia',
      });

      const result = await repo.update('p1', {
        firstName: 'Alicia',
        privacySettings: { limitDataVisibility: true },
      });

      expect(result.firstName).toBe('Alicia');
      const updateCall = (prisma.participant.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data.privacySettings.limitDataVisibility).toBe(true);
      expect(updateCall.data.privacySettings.shareContactInfo).toBe(true);
    });
  });

  // --- findMany -------------------------------------------------------------

  describe('findMany', () => {
    it('excludes guests by default', async () => {
      (prisma.participant.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ...baseParticipant, roles: [baseRole], preferences: basePreference },
      ]);
      (prisma.participant.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await repo.findMany();

      const whereArg = (prisma.participant.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(whereArg.isGuest).toBe(false);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('filters by department when provided', async () => {
      (prisma.participant.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.participant.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await repo.findMany({ department: 'Platform' });

      const whereArg = (prisma.participant.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(whereArg.roles.some.department).toBe('Platform');
    });

    it('applies pagination correctly', async () => {
      (prisma.participant.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.participant.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await repo.findMany({ page: 2, pageSize: 10 });

      const callArg = (prisma.participant.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.skip).toBe(10);
      expect(callArg.take).toBe(10);
    });
  });

  // --- getProfileForViewer (privacy) ----------------------------------------

  describe('getProfileForViewer', () => {
    const participantWithAll = {
      ...baseParticipant,
      roles: [baseRole],
      preferences: basePreference,
      interactions: [baseInteraction],
    };

    it('hides personal info when canViewPersonalInfo is false', async () => {
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(participantWithAll);

      const context: PrivacyContext = {
        viewerId: 'viewer1',
        canViewPersonalInfo: false,
        canViewHistory: false,
      };

      const result = await repo.getProfileForViewer('p1', context);

      expect(result?.email).toBeUndefined();
      expect(result?.firstName).toBeUndefined();
      expect(result?.id).toBe('p1');
    });

    it('shows personal info when canViewPersonalInfo is true and privacy allows', async () => {
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(participantWithAll);

      const context: PrivacyContext = {
        viewerId: 'viewer1',
        canViewPersonalInfo: true,
        canViewHistory: true,
      };

      const result = await repo.getProfileForViewer('p1', context);

      expect(result?.email).toBe('alice@example.com');
      expect(result?.firstName).toBe('Alice');
    });

    it('hides contact info when shareContactInfo is false', async () => {
      const restrictedParticipant = {
        ...participantWithAll,
        privacySettings: {
          limitDataVisibility: false,
          allowHistoryAccess: true,
          shareContactInfo: false,
        },
      };
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(restrictedParticipant);

      const context: PrivacyContext = {
        viewerId: 'viewer1',
        canViewPersonalInfo: true,
        canViewHistory: true,
      };

      const result = await repo.getProfileForViewer('p1', context);

      expect(result?.email).toBeUndefined();
      expect(result?.firstName).toBe('Alice');
    });

    it('hides interaction history when allowHistoryAccess is false', async () => {
      const noHistoryParticipant = {
        ...participantWithAll,
        privacySettings: {
          limitDataVisibility: false,
          allowHistoryAccess: false,
          shareContactInfo: true,
        },
      };
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(noHistoryParticipant);

      const context: PrivacyContext = {
        viewerId: 'viewer1',
        canViewPersonalInfo: true,
        canViewHistory: true,
      };

      const result = await repo.getProfileForViewer('p1', context);

      expect(result?.interactions).toHaveLength(0);
    });

    it('returns null when participant not found', async () => {
      (prisma.participant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const context: PrivacyContext = {
        viewerId: 'viewer1',
        canViewPersonalInfo: true,
        canViewHistory: true,
      };

      const result = await repo.getProfileForViewer('unknown', context);

      expect(result).toBeNull();
    });
  });

  // --- role management ------------------------------------------------------

  describe('addRole', () => {
    it('creates a new active role', async () => {
      (prisma.participantRole.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseRole);

      const result = await repo.addRole({
        participantId: 'p1',
        roleType: RoleType.ENGINEER,
        department: 'Platform',
      });

      expect(result.roleType).toBe(RoleType.ENGINEER);
      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivateRole', () => {
    it('sets isActive to false and records endDate', async () => {
      (prisma.participantRole.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...baseRole,
        isActive: false,
        endDate: new Date('2024-12-31'),
      });

      const result = await repo.deactivateRole('r1', new Date('2024-12-31'));

      expect(result.isActive).toBe(false);
      expect(result.endDate).toEqual(new Date('2024-12-31'));
    });
  });

  describe('getRoleHistory', () => {
    it('returns all roles ordered by start date', async () => {
      const oldRole = {
        ...baseRole,
        id: 'r0',
        roleType: 'MANAGER',
        isActive: false,
        endDate: new Date('2023-12-31'),
      };
      (prisma.participantRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        baseRole,
        oldRole,
      ]);

      const result = await repo.getRoleHistory('p1');

      expect(result).toHaveLength(2);
    });
  });

  // --- communication preferences --------------------------------------------

  describe('upsertPreferences', () => {
    it('creates preferences when none exist', async () => {
      (prisma.communicationPreference.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(basePreference);

      const result = await repo.upsertPreferences('p1', {
        emailFrequency: EmailFrequency.WEEKLY,
        notificationTypes: [NotificationType.MEETING_SUMMARY],
      });

      expect(result.participantId).toBe('p1');
    });

    it('upsert uses correct default email frequency', async () => {
      (prisma.communicationPreference.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(basePreference);

      await repo.upsertPreferences('p1', {});

      const upsertArg = (prisma.communicationPreference.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upsertArg.create.emailFrequency).toBe(EmailFrequency.DAILY);
    });
  });

  // --- meeting interactions --------------------------------------------------

  describe('recordInteraction', () => {
    it('records a new interaction', async () => {
      (prisma.meetingInteraction.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseInteraction);

      const result = await repo.recordInteraction('p1', 'm1', new Date('2024-06-01T09:00:00Z'));

      expect(result.meetingId).toBe('m1');
      expect(result.participantId).toBe('p1');
    });
  });

  describe('closeInteraction', () => {
    it('calculates duration in minutes', async () => {
      const joinedAt = new Date('2024-06-01T09:00:00Z');
      const leftAt = new Date('2024-06-01T10:30:00Z');

      (prisma.meetingInteraction.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...baseInteraction,
        joinedAt,
        leftAt: null,
        durationMinutes: null,
      });
      (prisma.meetingInteraction.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...baseInteraction,
        joinedAt,
        leftAt,
        durationMinutes: 90,
      });

      const result = await repo.closeInteraction('i1', leftAt);

      expect(result.durationMinutes).toBe(90);
      const updateArg = (prisma.meetingInteraction.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateArg.data.durationMinutes).toBe(90);
    });
  });

  describe('getInteractionHistory', () => {
    it('returns interactions with default limit', async () => {
      (prisma.meetingInteraction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([baseInteraction]);

      const result = await repo.getInteractionHistory('p1');

      expect(result).toHaveLength(1);
      const callArg = (prisma.meetingInteraction.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.take).toBe(50);
    });
  });

  // --- multi-role participant ------------------------------------------------

  describe('multiple roles support', () => {
    it('returns all active roles when participant has multiple', async () => {
      const engineerRole = { ...baseRole, id: 'r1', roleType: 'ENGINEER' };
      const managerRole = { ...baseRole, id: 'r2', roleType: 'MANAGER' };

      (prisma.participantRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        engineerRole,
        managerRole,
      ]);

      const result = await repo.getActiveRoles('p1');

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.roleType)).toContain(RoleType.ENGINEER);
      expect(result.map((r) => r.roleType)).toContain(RoleType.MANAGER);
    });
  });
});
