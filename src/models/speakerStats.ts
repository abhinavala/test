import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma";
import type { SpeakerStats, SessionSpeakerStats } from "../types/speaker-stats.js";

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
 * Save speaker stats for a session. Upserts: creates if new, updates if exists.
 */
export async function saveSpeakerStats(
  sessionId: string,
  stats: SpeakerStats[]
): Promise<void> {
  const statsJson = JSON.stringify(stats);

  await prisma.speakerStatsRecord.upsert({
    where: { sessionId },
    update: {
      stats: statsJson,
      updatedAt: new Date(),
    },
    create: {
      sessionId,
      stats: statsJson,
    },
  });
}

/**
 * Retrieve speaker stats for a session.
 * Returns null if the session has no stats recorded.
 */
export async function getSpeakerStats(
  sessionId: string
): Promise<SessionSpeakerStats | null> {
  const record = await prisma.speakerStatsRecord.findUnique({
    where: { sessionId },
  });

  if (!record) {
    return null;
  }

  const stats = JSON.parse(record.stats) as SpeakerStats[];

  return {
    sessionId: record.sessionId,
    stats,
  };
}

/**
 * Disconnect the Prisma client (useful for cleanup in tests).
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
