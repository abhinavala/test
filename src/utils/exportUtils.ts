/**
 * Utility functions for processing meeting data into structured export content.
 *
 * All functions are pure (no side effects) and handle edge cases like
 * missing fields, empty arrays, and malformed data gracefully.
 */

import crypto from "crypto";
import type {
  MeetingMetadata,
  ActionItem,
  TranscriptSegment,
  ExportFormat,
  ExportMetadata,
} from "../types/exportContent.js";

/** Raw meeting input that may have missing or partial fields. */
export interface RawMeetingData {
  id?: string;
  meetingId?: string;
  title?: string;
  date?: string;
  duration?: number;
  participants?: string[];
  organizer?: string;
  summary?: string;
  actionItems?: RawActionItem[];
  transcript?: RawTranscriptSegment[];
}

/** Raw action item that may have missing fields. */
export interface RawActionItem {
  id?: string;
  description?: string;
  assigneeName?: string;
  assigneeId?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
}

/** Raw transcript segment that may have missing fields. */
export interface RawTranscriptSegment {
  speakerName?: string;
  speakerId?: string;
  timestamp?: string;
  text?: string;
  confidence?: number;
}

/** Structured meeting data after extraction. */
export interface MeetingData {
  metadata: MeetingMetadata;
  summary: string;
  actionItems: ActionItem[];
  transcript: TranscriptSegment[];
}

/**
 * Extract and normalize meeting data from a raw input object.
 * Missing or invalid fields are replaced with sensible defaults.
 */
export function extractMeetingData(raw: RawMeetingData | null | undefined): MeetingData {
  if (!raw) {
    return {
      metadata: { meetingId: "", title: "Untitled Meeting", date: new Date(0).toISOString() },
      summary: "",
      actionItems: [],
      transcript: [],
    };
  }

  const metadata: MeetingMetadata = {
    meetingId: raw.meetingId || raw.id || "",
    title: raw.title || "Untitled Meeting",
    date: raw.date || new Date(0).toISOString(),
  };

  if (raw.duration !== undefined && raw.duration !== null) {
    metadata.duration = raw.duration;
  }
  if (raw.participants && raw.participants.length > 0) {
    metadata.participants = raw.participants;
  }
  if (raw.organizer) {
    metadata.organizer = raw.organizer;
  }

  return {
    metadata,
    summary: raw.summary || "",
    actionItems: (raw.actionItems || []).map(parseActionItem),
    transcript: (raw.transcript || []).map(parseTranscriptSegment),
  };
}

/**
 * Parse a raw action item into a validated ActionItem.
 */
function parseActionItem(raw: RawActionItem): ActionItem {
  const item: ActionItem = {
    id: raw.id || crypto.randomUUID(),
    description: raw.description || "",
    status: isValidStatus(raw.status) ? raw.status : "open",
  };

  if (raw.assigneeName) item.assigneeName = raw.assigneeName;
  if (raw.assigneeId) item.assigneeId = raw.assigneeId;
  if (raw.dueDate) item.dueDate = raw.dueDate;
  if (raw.priority && isValidPriority(raw.priority)) item.priority = raw.priority;

  return item;
}

function isValidStatus(s: unknown): s is "open" | "in-progress" | "completed" {
  return s === "open" || s === "in-progress" || s === "completed";
}

function isValidPriority(p: unknown): p is "low" | "medium" | "high" {
  return p === "low" || p === "medium" || p === "high";
}

/**
 * Parse a raw transcript segment into a validated TranscriptSegment.
 */
function parseTranscriptSegment(raw: RawTranscriptSegment): TranscriptSegment {
  const segment: TranscriptSegment = {
    speakerName: raw.speakerName || "Unknown Speaker",
    timestamp: raw.timestamp || new Date(0).toISOString(),
    text: raw.text || "",
  };

  if (raw.speakerId) segment.speakerId = raw.speakerId;
  if (raw.confidence !== undefined && raw.confidence !== null) {
    segment.confidence = Math.max(0, Math.min(1, raw.confidence));
  }

  return segment;
}

/**
 * Generate a SHA-256 content hash from a string.
 * The input is deterministic — identical inputs always produce identical hashes.
 */
export function generateContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Normalize an object for deterministic hashing by sorting keys recursively.
 * This ensures that objects with the same data but different key order
 * produce the same hash.
 */
export function normalizeForHashing(data: unknown): unknown {
  if (data === null || data === undefined) return null;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(normalizeForHashing);
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(data as Record<string, unknown>).sort()) {
    sorted[key] = normalizeForHashing((data as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Generate a deterministic hash for meeting data, independent of key order.
 */
export function generateMeetingDataHash(meetingData: MeetingData): string {
  const normalized = normalizeForHashing(meetingData);
  return generateContentHash(JSON.stringify(normalized));
}

/**
 * Format an ISO-8601 timestamp into a human-readable date string.
 */
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toISOString();
}

/**
 * Extract unique speaker names from transcript segments.
 */
export function extractSpeakers(transcript: TranscriptSegment[]): string[] {
  const seen = new Set<string>();
  const speakers: string[] = [];
  for (const segment of transcript) {
    if (!seen.has(segment.speakerName)) {
      seen.add(segment.speakerName);
      speakers.push(segment.speakerName);
    }
  }
  return speakers;
}

/**
 * Build ExportMetadata for a given session and format.
 */
export function buildExportMetadata(
  sessionId: string,
  format: ExportFormat,
  version: string = "1.0.0"
): ExportMetadata {
  return {
    sessionId,
    format,
    generatedAt: new Date().toISOString(),
    version,
  };
}
