/**
 * Content aggregation utilities for grouping and organizing meeting data.
 *
 * Provides functions for grouping transcript segments by speaker,
 * normalizing speaker identities, and caching aggregated results.
 */

import type { TranscriptSegment, ActionItem } from "../types/exportContent.js";

/** A group of transcript segments from the same speaker in chronological order. */
export interface SpeakerGroup {
  speakerName: string;
  speakerId?: string;
  segments: TranscriptSegment[];
}

/** Options for transcript aggregation. */
export interface AggregationOptions {
  /** Normalize speaker names to handle inconsistencies (default: true). */
  normalizeSpeakers?: boolean;
  /** Sort segments chronologically within each group (default: true). */
  sortByTimestamp?: boolean;
}

/** Cache entry for aggregated content. */
interface CacheEntry<T> {
  value: T;
  createdAt: number;
  ttl: number;
}

/**
 * Simple in-memory TTL cache for aggregated content.
 * Prevents redundant re-aggregation of the same data.
 */
export class AggregationCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtl: number;

  constructor(defaultTtlMs: number = 60_000) {
    this.defaultTtl = defaultTtlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      ttl: ttlMs ?? this.defaultTtl,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Normalize a speaker name for consistent identity matching.
 * Trims whitespace and collapses multiple spaces.
 */
export function normalizeSpeakerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Build a speaker identity map that resolves variant names to a canonical form.
 * Uses speakerId when available, otherwise falls back to normalized name.
 */
export function buildSpeakerMap(
  segments: TranscriptSegment[],
): Map<string, string> {
  const idToName = new Map<string, string>();
  const nameMap = new Map<string, string>();

  for (const seg of segments) {
    const normalized = normalizeSpeakerName(seg.speakerName);
    if (seg.speakerId) {
      // First occurrence of a speakerId wins as the canonical name
      if (!idToName.has(seg.speakerId)) {
        idToName.set(seg.speakerId, normalized);
      }
      nameMap.set(seg.speakerName, idToName.get(seg.speakerId)!);
    } else {
      nameMap.set(seg.speakerName, normalized);
    }
  }

  return nameMap;
}

/**
 * Aggregate transcript segments by speaker with chronological ordering.
 *
 * Groups segments so that consecutive segments from the same speaker
 * are kept together, while maintaining overall chronological order.
 * Returns a flat array sorted by timestamp with consistent speaker names.
 */
export function aggregateTranscriptBySpeaker(
  segments: TranscriptSegment[],
  options: AggregationOptions = {},
): TranscriptSegment[] {
  const { normalizeSpeakers = true, sortByTimestamp = true } = options;

  if (segments.length === 0) return [];

  const speakerMap = normalizeSpeakers ? buildSpeakerMap(segments) : null;

  const normalized = segments.map((seg) => ({
    ...seg,
    speakerName: speakerMap
      ? speakerMap.get(seg.speakerName) ?? seg.speakerName
      : seg.speakerName,
  }));

  if (sortByTimestamp) {
    normalized.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  return normalized;
}

/**
 * Group transcript segments into contiguous speaker blocks.
 * Useful for rendering transcript in a "speaker turn" format.
 */
export function groupBySpeaker(
  segments: TranscriptSegment[],
): SpeakerGroup[] {
  if (segments.length === 0) return [];

  const groups: SpeakerGroup[] = [];
  let current: SpeakerGroup | null = null;

  for (const seg of segments) {
    if (!current || current.speakerName !== seg.speakerName) {
      current = {
        speakerName: seg.speakerName,
        speakerId: seg.speakerId,
        segments: [seg],
      };
      groups.push(current);
    } else {
      current.segments.push(seg);
    }
  }

  return groups;
}

/**
 * Deduplicate action items by id, keeping the first occurrence.
 */
export function deduplicateActionItems(items: ActionItem[]): ActionItem[] {
  const seen = new Set<string>();
  const result: ActionItem[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}
