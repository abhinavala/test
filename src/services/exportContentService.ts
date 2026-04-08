/**
 * Meeting Content Aggregation Service
 *
 * Aggregates all meeting data components (metadata, summary, action items,
 * transcript) into the structured ExportContent format. Integrates with
 * the transcription engine, action item extraction, and session management.
 *
 * Features:
 * - Graceful degradation when components are unavailable
 * - In-memory caching to avoid redundant data fetching
 * - Consistent speaker identification across transcript and action items
 * - Hooks for the export history system
 */

import type {
  ExportContent,
  ExportFormat,
  MeetingMetadata,
  ActionItem,
  TranscriptSegment,
} from "../types/exportContent.js";
import type { RawMeetingData } from "../utils/exportUtils.js";
import { extractMeetingData } from "../utils/exportUtils.js";
import {
  aggregateTranscriptBySpeaker,
  deduplicateActionItems,
  AggregationCache,
} from "../utils/contentAggregator.js";

/** Data source providers for fetching meeting components. */
export interface DataSourceProviders {
  /** Fetch meeting metadata from the session management system. */
  fetchMetadata?(sessionId: string): Promise<MeetingMetadata | null>;
  /** Fetch AI-generated summary for the meeting. */
  fetchSummary?(sessionId: string): Promise<string | null>;
  /** Fetch action items with assignee information. */
  fetchActionItems?(sessionId: string): Promise<ActionItem[]>;
  /** Fetch speaker-attributed transcript segments. */
  fetchTranscript?(sessionId: string): Promise<TranscriptSegment[]>;
}

/** Options for aggregating export content. */
export interface AggregateOptions {
  /** Output format (default: 'markdown'). */
  format?: ExportFormat;
  /** Use cached data if available (default: true). */
  useCache?: boolean;
  /** Cache TTL in milliseconds (default: 60000). */
  cacheTtlMs?: number;
  /** Override providers for dependency injection. */
  providers?: DataSourceProviders;
}

/** Options for content aggregation pipeline configuration. */
export interface ContentAggregationOptions {
  /** Output format (default: 'markdown'). */
  format?: ExportFormat;
  /** Use cached data if available (default: true). */
  useCache?: boolean;
  /** Cache TTL in milliseconds (default: 60000). */
  cacheTtlMs?: number;
  /** Override providers for dependency injection. */
  providers?: DataSourceProviders;
  /** Normalize speaker names across transcript and action items (default: true). */
  normalizeSpeakers?: boolean;
  /** Deduplicate action items by id (default: true). */
  deduplicateActions?: boolean;
}

/** Result of an aggregation operation with diagnostic info. */
export interface AggregationResult {
  content: ExportContent;
  /** Which components were successfully fetched. */
  componentsLoaded: {
    metadata: boolean;
    summary: boolean;
    actionItems: boolean;
    transcript: boolean;
  };
  /** Warnings about missing or degraded components. */
  warnings: string[];
  /** Time taken to aggregate in milliseconds. */
  aggregationTimeMs: number;
}

/** Hook called when export content is generated, for the export history system. */
export type ExportHistoryHook = (
  sessionId: string,
  content: ExportContent,
) => void | Promise<void>;

// Module-level cache shared across calls
const contentCache = new AggregationCache(60_000);

// Registered export history hooks
const historyHooks: ExportHistoryHook[] = [];

/**
 * Register a hook to be called when export content is generated.
 * Hooks are called asynchronously and errors are logged but not propagated.
 */
export function onExportGenerated(hook: ExportHistoryHook): void {
  historyHooks.push(hook);
}

/**
 * Remove all registered export history hooks.
 */
export function clearExportHooks(): void {
  historyHooks.length = 0;
}

/**
 * Clear the aggregation cache.
 */
export function clearCache(): void {
  contentCache.clear();
}

/**
 * Aggregate all meeting data components into a complete ExportContent object.
 *
 * Fetches metadata, summary, action items, and transcript from their
 * respective data sources, normalizes the data, and assembles it into
 * the ExportContent format. Handles missing data gracefully — if a
 * component is unavailable, it is omitted or replaced with defaults.
 *
 * @param sessionId - The meeting session identifier.
 * @param options - Aggregation options including format, caching, and providers.
 * @returns AggregationResult with the assembled content and diagnostics.
 */
export async function aggregateExportContent(
  sessionId: string,
  options: AggregateOptions = {},
): Promise<AggregationResult> {
  const startTime = Date.now();
  const {
    format = "markdown",
    useCache = true,
    cacheTtlMs = 60_000,
    providers = {},
  } = options;

  // Check cache
  const cacheKey = `export:${sessionId}:${format}`;
  if (useCache) {
    const cached = contentCache.get<AggregationResult>(cacheKey);
    if (cached) return cached;
  }

  const warnings: string[] = [];
  const componentsLoaded = {
    metadata: false,
    summary: false,
    actionItems: false,
    transcript: false,
  };

  // Fetch all components concurrently for performance
  const [metadataResult, summaryResult, actionItemsResult, transcriptResult] =
    await Promise.allSettled([
      fetchMetadataSafe(sessionId, providers, warnings),
      fetchSummarySafe(sessionId, providers, warnings),
      fetchActionItemsSafe(sessionId, providers, warnings),
      fetchTranscriptSafe(sessionId, providers, warnings),
    ]);

  // Extract results with graceful fallbacks
  const metadata =
    metadataResult.status === "fulfilled" && metadataResult.value
      ? metadataResult.value
      : defaultMetadata(sessionId);
  componentsLoaded.metadata =
    metadataResult.status === "fulfilled" && metadataResult.value !== null;

  const summary =
    summaryResult.status === "fulfilled" ? summaryResult.value : undefined;
  componentsLoaded.summary =
    summaryResult.status === "fulfilled" && summaryResult.value !== null;

  const rawActionItems =
    actionItemsResult.status === "fulfilled"
      ? actionItemsResult.value
      : [];
  componentsLoaded.actionItems =
    actionItemsResult.status === "fulfilled" && rawActionItems.length > 0;

  const rawTranscript =
    transcriptResult.status === "fulfilled"
      ? transcriptResult.value
      : [];
  componentsLoaded.transcript =
    transcriptResult.status === "fulfilled" && rawTranscript.length > 0;

  // Deduplicate action items and sort transcript by speaker
  const actionItems = deduplicateActionItems(rawActionItems);
  const transcript = aggregateTranscriptBySpeaker(rawTranscript);

  const content: ExportContent = {
    sessionId,
    metadata,
    summary: summary ?? undefined,
    actionItems,
    transcript,
    format,
    generatedAt: new Date().toISOString(),
  };

  const result: AggregationResult = {
    content,
    componentsLoaded,
    warnings,
    aggregationTimeMs: Date.now() - startTime,
  };

  // Cache the result
  if (useCache) {
    contentCache.set(cacheKey, result, cacheTtlMs);
  }

  // Fire export history hooks (non-blocking)
  void notifyHooks(sessionId, content);

  return result;
}

/**
 * Aggregate export content from a raw meeting data object.
 * Useful when all data is already available locally (e.g., from a database record).
 */
export function aggregateFromRawData(
  sessionId: string,
  rawData: RawMeetingData,
  format: ExportFormat = "markdown",
): ExportContent {
  const meetingData = extractMeetingData(rawData);

  return {
    sessionId,
    metadata: meetingData.metadata,
    summary: meetingData.summary || undefined,
    actionItems: deduplicateActionItems(meetingData.actionItems),
    transcript: aggregateTranscriptBySpeaker(meetingData.transcript),
    format,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Fetch meeting metadata from the session management system.
 * Returns default metadata if the provider fails or is not configured.
 *
 * @param sessionId - The meeting session identifier.
 * @param providers - Data source providers for fetching.
 * @returns Meeting metadata or a default fallback.
 */
export async function fetchMeetingMetadata(
  sessionId: string,
  providers: DataSourceProviders = {},
): Promise<MeetingMetadata> {
  if (!providers.fetchMetadata) return defaultMetadata(sessionId);
  try {
    const metadata = await providers.fetchMetadata(sessionId);
    return metadata ?? defaultMetadata(sessionId);
  } catch {
    return defaultMetadata(sessionId);
  }
}

/**
 * Resolve action item assignees by cross-referencing with transcript speakers.
 * Ensures consistent speaker identification between action items and transcript.
 * If an action item has an assigneeName that matches a transcript speaker
 * (after normalization), the assigneeId is filled in from the transcript data.
 *
 * @param actionItems - Action items to resolve.
 * @param transcript - Transcript segments for cross-referencing.
 * @returns Action items with resolved assignee information.
 */
export function resolveActionItemAssignees(
  actionItems: ActionItem[],
  transcript: TranscriptSegment[],
): ActionItem[] {
  // Build a map of normalized speaker name -> speakerId from transcript
  const speakerIdMap = new Map<string, string>();
  for (const seg of transcript) {
    if (seg.speakerId) {
      const normalized = seg.speakerName.trim().replace(/\s+/g, " ").toLowerCase();
      if (!speakerIdMap.has(normalized)) {
        speakerIdMap.set(normalized, seg.speakerId);
      }
    }
  }

  return actionItems.map((item) => {
    if (item.assigneeId || !item.assigneeName) return item;
    const normalized = item.assigneeName.trim().replace(/\s+/g, " ").toLowerCase();
    const speakerId = speakerIdMap.get(normalized);
    if (speakerId) {
      return { ...item, assigneeId: speakerId };
    }
    return item;
  });
}

// --- Internal helpers ---

async function fetchMetadataSafe(
  sessionId: string,
  providers: DataSourceProviders,
  warnings: string[],
): Promise<MeetingMetadata | null> {
  if (!providers.fetchMetadata) return null;
  try {
    return await providers.fetchMetadata(sessionId);
  } catch (err) {
    warnings.push(
      `Failed to fetch metadata: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function fetchSummarySafe(
  sessionId: string,
  providers: DataSourceProviders,
  warnings: string[],
): Promise<string | null> {
  if (!providers.fetchSummary) return null;
  try {
    return await providers.fetchSummary(sessionId);
  } catch (err) {
    warnings.push(
      `Failed to fetch summary: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function fetchActionItemsSafe(
  sessionId: string,
  providers: DataSourceProviders,
  warnings: string[],
): Promise<ActionItem[]> {
  if (!providers.fetchActionItems) return [];
  try {
    return await providers.fetchActionItems(sessionId);
  } catch (err) {
    warnings.push(
      `Failed to fetch action items: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

async function fetchTranscriptSafe(
  sessionId: string,
  providers: DataSourceProviders,
  warnings: string[],
): Promise<TranscriptSegment[]> {
  if (!providers.fetchTranscript) return [];
  try {
    return await providers.fetchTranscript(sessionId);
  } catch (err) {
    warnings.push(
      `Failed to fetch transcript: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

function defaultMetadata(sessionId: string): MeetingMetadata {
  return {
    meetingId: sessionId,
    title: "Untitled Meeting",
    date: new Date().toISOString(),
  };
}

async function notifyHooks(
  sessionId: string,
  content: ExportContent,
): Promise<void> {
  for (const hook of historyHooks) {
    try {
      await hook(sessionId, content);
    } catch {
      // Hook errors are swallowed to avoid breaking the aggregation flow
    }
  }
}
