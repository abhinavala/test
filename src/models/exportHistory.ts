import crypto from "crypto";
import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma";
import {
  ExportFormat,
  ExportRecord,
  ExportRequest,
  MAX_CONTENT_SIZE,
} from "../types/export";

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
 * Generate a SHA-256 content hash for deduplication.
 */
export function generateContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new export record. Throws if a record with the same
 * sessionId+format combination already exists.
 */
export async function createExport(request: ExportRequest): Promise<ExportRecord> {
  if (request.content.length > MAX_CONTENT_SIZE) {
    throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
  }

  const contentHash = generateContentHash(request.content);

  const record = await prisma.exportHistory.create({
    data: {
      sessionId: request.sessionId,
      format: request.format,
      content: request.content,
      contentHash,
    },
  });

  return toExportRecord(record);
}

/**
 * Find an existing export by sessionId and format.
 * Returns null if not found.
 */
export async function findExport(
  sessionId: string,
  format: ExportFormat
): Promise<ExportRecord | null> {
  const record = await prisma.exportHistory.findUnique({
    where: {
      sessionId_format: { sessionId, format },
    },
  });

  return record ? toExportRecord(record) : null;
}

/**
 * Find or create an export using upsert for cache-first approach.
 */
export async function findOrCreateExport(
  request: ExportRequest
): Promise<ExportRecord> {
  if (request.content.length > MAX_CONTENT_SIZE) {
    throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
  }

  const contentHash = generateContentHash(request.content);

  const record = await prisma.exportHistory.upsert({
    where: {
      sessionId_format: {
        sessionId: request.sessionId,
        format: request.format,
      },
    },
    update: {
      content: request.content,
      contentHash,
    },
    create: {
      sessionId: request.sessionId,
      format: request.format,
      content: request.content,
      contentHash,
    },
  });

  return toExportRecord(record);
}

/**
 * Check if an export with the given content already exists (deduplication).
 */
export async function isDuplicate(
  sessionId: string,
  format: ExportFormat,
  content: string
): Promise<boolean> {
  const hash = generateContentHash(content);
  const existing = await prisma.exportHistory.findUnique({
    where: { sessionId_format: { sessionId, format } },
    select: { contentHash: true },
  });
  return existing?.contentHash === hash;
}

/**
 * Get export history for a session, ordered by createdAt descending.
 */
export async function getExportHistory(
  sessionId: string
): Promise<ExportRecord[]> {
  const records = await prisma.exportHistory.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });

  return records.map(toExportRecord);
}

/**
 * Get a single export by ID.
 */
export async function getExportById(id: string): Promise<ExportRecord | null> {
  const record = await prisma.exportHistory.findUnique({
    where: { id },
  });

  return record ? toExportRecord(record) : null;
}

/**
 * Map a Prisma record to our ExportRecord interface.
 */
function toExportRecord(record: {
  id: string;
  sessionId: string;
  format: string;
  content: string;
  contentHash: string;
  createdAt: Date;
}): ExportRecord {
  return {
    id: record.id,
    sessionId: record.sessionId,
    format: record.format as ExportFormat,
    content: record.content,
    contentHash: record.contentHash,
    createdAt: record.createdAt,
  };
}

/**
 * Disconnect the Prisma client (useful for cleanup in tests).
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
