// Pipeline type definitions for the real-time transcription orchestration service

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';
export type BackpressureLevel = 'normal' | 'warning' | 'critical';
export type PipelineEventName =
  | 'audio.chunk.received'
  | 'audio.chunk.queued'
  | 'transcription.started'
  | 'transcription.completed'
  | 'transcription.error'
  | 'diarization.started'
  | 'diarization.completed'
  | 'diarization.error'
  | 'results.merged'
  | 'embedding.started'
  | 'embedding.completed'
  | 'embedding.error'
  | 'pipeline.error'
  | 'pipeline.backpressure'
  | 'session.created'
  | 'session.completed'
  | 'session.error'
  | 'session.cleanup'
  | 'status.update';

export interface AudioChunk {
  id: string;
  sessionId: string;
  data: Buffer;
  timestamp: number;
  sampleRate: number;
  channels: number;
  sequenceNumber: number;
}

export interface TranscriptionResult {
  chunkId: string;
  sessionId: string;
  text: string;
  confidence: number;
  startTime: number;
  endTime: number;
  language: string;
  words?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface SpeakerSegment {
  speakerId: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface DiarizationResult {
  chunkId: string;
  sessionId: string;
  speakers: string[];
  segments: SpeakerSegment[];
}

export interface VectorResult {
  chunkId: string;
  sessionId: string;
  embeddingId: string;
  stored: boolean;
}

export interface ProcessingResult {
  chunkId: string;
  sessionId: string;
  transcription?: TranscriptionResult;
  diarization?: DiarizationResult;
  embedding?: VectorResult;
  merged: boolean;
  mergedAt?: number;
}

export interface MergedTranscriptionSegment {
  text: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface MergedResult {
  chunkId: string;
  sessionId: string;
  segments: MergedTranscriptionSegment[];
  fullText: string;
  speakers: string[];
  startTime: number;
  endTime: number;
}

export interface SessionMetrics {
  chunksReceived: number;
  chunksProcessed: number;
  chunksFailed: number;
  transcriptionsCompleted: number;
  diarizationsCompleted: number;
  embeddingsCompleted: number;
  averageProcessingTimeMs: number;
  totalProcessingTimeMs: number;
  queueDepth: number;
  backpressureEvents: number;
  startedAt: number;
  lastActivityAt: number;
}

export interface SessionState {
  id: string;
  status: SessionStatus;
  audioChunkIds: string[];
  pendingResults: Map<string, ProcessingResult>;
  metrics: SessionMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface QueueItem<T = unknown> {
  id: string;
  sessionId: string;
  priority: number; // 1=highest, 3=lowest
  timestamp: number;
  data: T;
  retryCount: number;
  maxRetries: number;
}

export interface QueueConfig {
  maxSize: number;
  warningThreshold: number;
  maxRetries: number;
  processingConcurrency: number;
}

export interface OrchestratorConfig {
  transcriptionQueue: QueueConfig;
  diarizationQueue: QueueConfig;
  embeddingQueue: QueueConfig;
  sessionTimeoutMs: number;
  maxSessions: number;
  enableDiarization: boolean;
  enableEmbeddings: boolean;
}

export interface StatusUpdate {
  sessionId: string;
  type: 'progress' | 'result' | 'error' | 'metrics';
  timestamp: number;
  data: Record<string, unknown>;
}

export interface PipelineEvent {
  name: PipelineEventName;
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface TranscriptionService {
  transcribe(chunk: AudioChunk): Promise<TranscriptionResult>;
}

export interface DiarizationService {
  diarize(chunk: AudioChunk): Promise<DiarizationResult>;
}

export interface EmbeddingService {
  generateEmbedding(text: string, metadata: Record<string, unknown>): Promise<VectorResult>;
}

export interface StatusUpdateCallback {
  (update: StatusUpdate): void;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxSize: 100,
  warningThreshold: 80,
  maxRetries: 3,
  processingConcurrency: 2,
};

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  transcriptionQueue: { ...DEFAULT_QUEUE_CONFIG },
  diarizationQueue: { ...DEFAULT_QUEUE_CONFIG },
  embeddingQueue: { ...DEFAULT_QUEUE_CONFIG, processingConcurrency: 4 },
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  maxSessions: 50,
  enableDiarization: true,
  enableEmbeddings: true,
};
