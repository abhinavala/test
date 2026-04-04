import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma";
import { SummaryGenerationError } from "../types/errors.js";
import type { MeetingSessionSummary } from "../types/meeting-summary.js";
import type {
  SummaryGenerationOptions,
  SummaryGenerationResult,
  SummaryGenerationProgress,
} from "../types/summary-generation.js";
import type { ExtractionContext } from "../types/ai-summary.js";
import type { TranscriptSegment } from "../types/transcript.js";
import type { ActionItem } from "../types/exportContent.js";
import { extractSummaryComponents } from "./aiSummaryService.js";
import {
  acquireLock,
  releaseLock,
  isLocked,
} from "../utils/summaryLocking.js";

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

const GENERATION_TIMEOUT_MS = 60_000;

const backgroundProgress = new Map<string, SummaryGenerationProgress>();

/**
 * Retrieve an existing summary for a meeting session without triggering generation.
 */
export async function getSummary(
  meetingSessionId: string,
): Promise<MeetingSessionSummary | null> {
  const record = await prisma.meetingSessionSummary.findUnique({
    where: { meetingSessionId },
    include: {
      keyDecisions: true,
      openQuestions: true,
      nextSteps: true,
    },
  });

  if (!record) return null;

  return mapRecordToSummary(record);
}

/**
 * Generate a meeting summary for the given session.
 * Handles deduplication, locking, AI extraction, and database persistence.
 */
export async function generateSummary(
  meetingSessionId: string,
  options: SummaryGenerationOptions = {},
): Promise<SummaryGenerationResult> {
  const startTime = Date.now();
  const {
    forceRegenerate = false,
    includeTranscript = true,
    includeActionItems = true,
    backgroundProcessing = false,
  } = options;

  // Check for existing summary unless forcing regeneration
  if (!forceRegenerate) {
    const existing = await getSummary(meetingSessionId);
    if (existing) {
      return {
        summary: existing,
        wasRegenerated: false,
        processingTime: Date.now() - startTime,
      };
    }
  }

  if (backgroundProcessing) {
    return startBackgroundGeneration(meetingSessionId, options, startTime);
  }

  return executeGeneration(
    meetingSessionId,
    {
      includeTranscript,
      includeActionItems,
      forceRegenerate,
      transcriptSegments: options.transcriptSegments,
      actionItems: options.actionItems,
    },
    startTime,
  );
}

/**
 * Get progress for a background summary generation task.
 */
export function getGenerationProgress(
  meetingSessionId: string,
): SummaryGenerationProgress | null {
  return backgroundProgress.get(meetingSessionId) ?? null;
}

async function startBackgroundGeneration(
  meetingSessionId: string,
  options: SummaryGenerationOptions,
  startTime: number,
): Promise<SummaryGenerationResult> {
  const progress: SummaryGenerationProgress = {
    meetingSessionId,
    status: "pending",
    progress: 0,
    startedAt: new Date(),
  };
  backgroundProgress.set(meetingSessionId, progress);

  // Fire and forget — caller gets a pending result
  void runBackgroundGeneration(meetingSessionId, options, progress);

  // Return immediately with a placeholder indicating background processing
  const existing = await getSummary(meetingSessionId);
  if (existing) {
    return {
      summary: existing,
      wasRegenerated: false,
      processingTime: Date.now() - startTime,
    };
  }

  // Return a minimal placeholder for background processing
  return {
    summary: {
      id: "",
      meetingSessionId,
      keyDecisions: [],
      openQuestions: [],
      nextSteps: [],
      generatedAt: new Date(),
      generatedBy: "pending",
    },
    wasRegenerated: false,
    processingTime: Date.now() - startTime,
  };
}

async function runBackgroundGeneration(
  meetingSessionId: string,
  options: SummaryGenerationOptions,
  progress: SummaryGenerationProgress,
): Promise<void> {
  try {
    progress.status = "processing";
    progress.progress = 10;

    await executeGeneration(
      meetingSessionId,
      {
        includeTranscript: options.includeTranscript ?? true,
        includeActionItems: options.includeActionItems ?? true,
        forceRegenerate: options.forceRegenerate ?? false,
        transcriptSegments: options.transcriptSegments,
        actionItems: options.actionItems,
      },
      Date.now(),
    );

    progress.status = "completed";
    progress.progress = 100;
    progress.completedAt = new Date();
  } catch (error) {
    progress.status = "failed";
    progress.error =
      error instanceof Error ? error.message : String(error);
    progress.completedAt = new Date();
  }
}

async function executeGeneration(
  meetingSessionId: string,
  opts: {
    includeTranscript: boolean;
    includeActionItems: boolean;
    forceRegenerate: boolean;
    transcriptSegments?: TranscriptSegment[];
    actionItems?: ActionItem[];
  },
  startTime: number,
): Promise<SummaryGenerationResult> {
  // Acquire lock to prevent concurrent generation
  if (!acquireLock(meetingSessionId)) {
    throw new SummaryGenerationError(
      "Summary generation already in progress for this session",
      "INVALID_SESSION_STATE",
      meetingSessionId,
    );
  }

  try {
    // Delete existing summary if forcing regeneration
    if (opts.forceRegenerate) {
      await prisma.meetingSessionSummary.deleteMany({
        where: { meetingSessionId },
      });
    }

    // Use provided data or retrieve from data pipeline
    const transcriptSegments = opts.transcriptSegments
      ?? (opts.includeTranscript ? await getTranscriptSegments(meetingSessionId) : []);
    const actionItems = opts.actionItems
      ?? (opts.includeActionItems ? await getActionItems(meetingSessionId) : []);

    // Validate sufficient data
    if (transcriptSegments.length === 0 && actionItems.length === 0) {
      throw new SummaryGenerationError(
        "No transcript or action item data available for this meeting session",
        "INSUFFICIENT_DATA",
        meetingSessionId,
      );
    }

    // Build extraction context
    const context: ExtractionContext = {
      meetingSessionId,
      transcriptSegments,
      actionItems,
    };

    // Call AI service with timeout
    const extractionResult = await withTimeout(
      extractSummaryComponents(context),
      GENERATION_TIMEOUT_MS,
      meetingSessionId,
    );

    // Persist to database in a transaction
    const record = await prisma.meetingSessionSummary.create({
      data: {
        meetingSessionId,
        generatedBy: "ai-summary-service",
        keyDecisions: {
          create: extractionResult.keyDecisions.map((d) => ({
            description: d.description,
            participants: JSON.stringify(d.participants),
            madeAt: d.madeAt ? new Date(d.madeAt) : null,
            context: d.context ?? null,
          })),
        },
        openQuestions: {
          create: extractionResult.openQuestions.map((q) => ({
            question: q.question,
            ownerId: q.ownerId ?? null,
            raisedBy: q.raisedBy ?? null,
            context: q.context ?? null,
          })),
        },
        nextSteps: {
          create: extractionResult.nextSteps.map((s) => ({
            description: s.description,
            assigneeId: s.assigneeId ?? null,
            assigneeName: s.assigneeName ?? null,
            priority: s.priority,
            dueDate: s.dueDate ? new Date(s.dueDate) : null,
          })),
        },
      },
      include: {
        keyDecisions: true,
        openQuestions: true,
        nextSteps: true,
      },
    });

    const summary = mapRecordToSummary(record);

    return {
      summary,
      wasRegenerated: opts.forceRegenerate,
      processingTime: Date.now() - startTime,
    };
  } finally {
    releaseLock(meetingSessionId);
  }
}

async function getTranscriptSegments(
  meetingSessionId: string,
): Promise<TranscriptSegment[]> {
  // Transcript segments are provided by the caller's data pipeline.
  // In a real system these would come from a transcripts table.
  // For now, return empty — the AI service validates minimum data.
  return [];
}

async function getActionItems(
  meetingSessionId: string,
): Promise<ActionItem[]> {
  // Action items are provided by the caller's data pipeline.
  // For now, return empty — the AI service validates minimum data.
  return [];
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  meetingSessionId: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new SummaryGenerationError(
          `Summary generation timed out after ${timeoutMs}ms`,
          "GENERATION_TIMEOUT",
          meetingSessionId,
        ),
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRecordToSummary(record: any): MeetingSessionSummary {
  return {
    id: record.id,
    meetingSessionId: record.meetingSessionId,
    generatedAt: record.generatedAt,
    generatedBy: record.generatedBy,
    keyDecisions: record.keyDecisions.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => ({
        id: d.id,
        description: d.description,
        participants: JSON.parse(d.participants) as string[],
        madeAt: d.madeAt ? d.madeAt.toISOString() : undefined,
        context: d.context ?? undefined,
      }),
    ),
    openQuestions: record.openQuestions.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => ({
        id: q.id,
        question: q.question,
        ownerId: q.ownerId ?? undefined,
        raisedBy: q.raisedBy ?? undefined,
        context: q.context ?? undefined,
      }),
    ),
    nextSteps: record.nextSteps.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => ({
        id: s.id,
        description: s.description,
        assigneeId: s.assigneeId ?? undefined,
        assigneeName: s.assigneeName ?? undefined,
        priority: s.priority,
        dueDate: s.dueDate ? s.dueDate.toISOString() : undefined,
      }),
    ),
  };
}

/**
 * Disconnect the Prisma client (useful for cleanup in tests).
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export const summaryGenerationService = {
  generateSummary,
  getSummary,
  getGenerationProgress,
  disconnect,
};
