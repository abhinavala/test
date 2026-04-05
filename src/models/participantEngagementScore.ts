import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma";
import type { ParticipantEngagementScore } from "../types/engagement";

function resolveDatabaseUrl(): string {
  const raw = process.env.SQLITE_URL || "file:./prisma/dev.db";
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const relativePath = raw.replace("file:", "");
    return "file:" + path.resolve(process.cwd(), relativePath);
  }
  return raw;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter }) as InstanceType<
  typeof PrismaClient
>;

export type EngagementCalculationErrorCode =
  | "CONSTRAINT_VIOLATION"
  | "DATABASE_ERROR"
  | "VALIDATION_ERROR";

export class EngagementCalculationError extends Error {
  readonly code: EngagementCalculationErrorCode;
  readonly sessionId?: string;

  constructor(
    message: string,
    code: EngagementCalculationErrorCode,
    sessionId?: string
  ) {
    super(message);
    this.name = "EngagementCalculationError";
    this.code = code;
    this.sessionId = sessionId;
  }
}

type EngagementScoreInput = Omit<
  ParticipantEngagementScore,
  "id" | "calculatedAt"
>;

function toEngagementScore(record: {
  id: string;
  sessionId: string;
  participantId: string;
  score: number;
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
  calculatedAt: Date;
}): ParticipantEngagementScore {
  return {
    id: record.id,
    sessionId: record.sessionId,
    participantId: record.participantId,
    score: record.score,
    talkTimeRatio: record.talkTimeRatio,
    questionCount: record.questionCount,
    responseRate: record.responseRate,
    sentimentScore: record.sentimentScore,
    calculatedAt: record.calculatedAt,
  };
}

/**
 * Save a single engagement score. Uses upsert to handle
 * duplicate session-participant pairs gracefully.
 */
export async function saveEngagementScore(
  input: EngagementScoreInput
): Promise<ParticipantEngagementScore> {
  const record = await prisma.participantEngagementScore.upsert({
    where: {
      sessionId_participantId: {
        sessionId: input.sessionId,
        participantId: input.participantId,
      },
    },
    update: {
      score: input.score,
      talkTimeRatio: input.talkTimeRatio,
      questionCount: input.questionCount,
      responseRate: input.responseRate,
      sentimentScore: input.sentimentScore,
    },
    create: {
      sessionId: input.sessionId,
      participantId: input.participantId,
      score: input.score,
      talkTimeRatio: input.talkTimeRatio,
      questionCount: input.questionCount,
      responseRate: input.responseRate,
      sentimentScore: input.sentimentScore,
    },
  });

  return toEngagementScore(record);
}

/**
 * Bulk save engagement scores for a session. Creates all records
 * in a transaction. Throws EngagementCalculationError with code
 * 'CONSTRAINT_VIOLATION' if duplicate session-participant pairs
 * are found within the input.
 */
export async function bulkSaveEngagementScores(
  scores: EngagementScoreInput[]
): Promise<ParticipantEngagementScore[]> {
  const seen = new Set<string>();
  for (const score of scores) {
    const key = `${score.sessionId}:${score.participantId}`;
    if (seen.has(key)) {
      throw new EngagementCalculationError(
        `Duplicate session-participant pair: sessionId=${score.sessionId}, participantId=${score.participantId}`,
        "CONSTRAINT_VIOLATION",
        score.sessionId
      );
    }
    seen.add(key);
  }

  const results = await prisma.$transaction(
    scores.map((input) =>
      prisma.participantEngagementScore.upsert({
        where: {
          sessionId_participantId: {
            sessionId: input.sessionId,
            participantId: input.participantId,
          },
        },
        update: {
          score: input.score,
          talkTimeRatio: input.talkTimeRatio,
          questionCount: input.questionCount,
          responseRate: input.responseRate,
          sentimentScore: input.sentimentScore,
        },
        create: {
          sessionId: input.sessionId,
          participantId: input.participantId,
          score: input.score,
          talkTimeRatio: input.talkTimeRatio,
          questionCount: input.questionCount,
          responseRate: input.responseRate,
          sentimentScore: input.sentimentScore,
        },
      })
    )
  );

  return results.map(toEngagementScore);
}

/**
 * Get all engagement scores for a session, ordered by score descending.
 */
export async function getEngagementScoresBySession(
  sessionId: string
): Promise<ParticipantEngagementScore[]> {
  const records = await prisma.participantEngagementScore.findMany({
    where: { sessionId },
    orderBy: { score: "desc" },
  });

  return records.map(toEngagementScore);
}

/**
 * Get a single engagement score by ID.
 */
export async function getEngagementScore(
  id: string
): Promise<ParticipantEngagementScore | null> {
  const record = await prisma.participantEngagementScore.findUnique({
    where: { id },
  });

  return record ? toEngagementScore(record) : null;
}

/**
 * Get a single engagement score by session and participant.
 */
export async function getEngagementScoreByParticipant(
  sessionId: string,
  participantId: string
): Promise<ParticipantEngagementScore | null> {
  const record = await prisma.participantEngagementScore.findUnique({
    where: {
      sessionId_participantId: { sessionId, participantId },
    },
  });

  return record ? toEngagementScore(record) : null;
}

/**
 * Delete all engagement scores for a session.
 */
export async function deleteEngagementScoresBySession(
  sessionId: string
): Promise<number> {
  const result = await prisma.participantEngagementScore.deleteMany({
    where: { sessionId },
  });
  return result.count;
}

/**
 * Disconnect the Prisma client (useful for cleanup in tests).
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
