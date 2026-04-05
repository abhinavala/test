import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma";
import type { ParticipantEngagementScore } from "../types/engagement.js";

function resolveDatabaseUrl(): string {
  const raw = process.env.SQLITE_URL || "file:./prisma/dev.db";
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const relativePath = raw.replace("file:", "");
    return "file:" + path.resolve(process.cwd(), relativePath);
  }
  return raw;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter }) as InstanceType<typeof PrismaClient>;

/**
 * Create a new engagement score record for a participant in a session.
 */
export async function createEngagementScore(
  data: Omit<ParticipantEngagementScore, "id" | "calculatedAt">
): Promise<ParticipantEngagementScore> {
  const record = await prisma.participantEngagementScore.create({
    data: {
      sessionId: data.sessionId,
      participantId: data.participantId,
      score: data.score,
      talkTimeRatio: data.talkTimeRatio,
      questionCount: data.questionCount,
      responseRate: data.responseRate,
      sentimentScore: data.sentimentScore,
    },
  });

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
 * Retrieve all engagement scores for a given session.
 * Returns an empty array if no scores exist.
 */
export async function getEngagementScoresBySession(
  sessionId: string
): Promise<ParticipantEngagementScore[]> {
  const records = await prisma.participantEngagementScore.findMany({
    where: { sessionId },
  });

  return records.map((record) => ({
    id: record.id,
    sessionId: record.sessionId,
    participantId: record.participantId,
    score: record.score,
    talkTimeRatio: record.talkTimeRatio,
    questionCount: record.questionCount,
    responseRate: record.responseRate,
    sentimentScore: record.sentimentScore,
    calculatedAt: record.calculatedAt,
  }));
}

/**
 * Retrieve engagement score for a specific participant in a session.
 * Returns null if no score exists.
 */
export async function getEngagementScore(
  sessionId: string,
  participantId: string
): Promise<ParticipantEngagementScore | null> {
  const record = await prisma.participantEngagementScore.findUnique({
    where: {
      sessionId_participantId: { sessionId, participantId },
    },
  });

  if (!record) {
    return null;
  }

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
 * Disconnect the Prisma client (useful for cleanup in tests).
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
