import { EventEmitter } from 'events';
import winston from 'winston';
import { ProcessingQueue } from '../utils/queueManager';
import {
  AudioChunk,
  TranscriptionResult,
  DiarizationResult,
  VectorResult,
  ProcessingResult,
  MergedResult,
  MergedTranscriptionSegment,
  SessionState,
  SessionMetrics,
  SessionStatus,
  StatusUpdate,
  OrchestratorConfig,
  QueueItem,
  PipelineEventName,
  TranscriptionService,
  DiarizationService,
  EmbeddingService,
  StatusUpdateCallback,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from '../types/pipeline';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'transcription-orchestrator' },
  transports: [new winston.transports.Console()],
});

export class TranscriptionOrchestrator extends EventEmitter {
  private sessions = new Map<string, SessionState>();
  private readonly config: OrchestratorConfig;
  private readonly transcriptionQueue: ProcessingQueue<AudioChunk>;
  private readonly diarizationQueue: ProcessingQueue<AudioChunk>;
  private readonly embeddingQueue: ProcessingQueue<MergedResult>;
  private transcriptionService?: TranscriptionService;
  private diarizationService?: DiarizationService;
  private embeddingService?: EmbeddingService;
  private statusCallbacks = new Map<string, StatusUpdateCallback[]>();
  private sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private processingTimers = new Map<string, ReturnType<typeof setInterval>>();
  private started = false;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    super();
    this.setMaxListeners(0);
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };

    this.transcriptionQueue = new ProcessingQueue<AudioChunk>(
      'transcription',
      this.config.transcriptionQueue
    );
    this.diarizationQueue = new ProcessingQueue<AudioChunk>(
      'diarization',
      this.config.diarizationQueue
    );
    this.embeddingQueue = new ProcessingQueue<MergedResult>(
      'embedding',
      this.config.embeddingQueue
    );

    this.setupEventHandlers();
    this.setupQueueHandlers();
  }

  // --- Service registration ---

  registerTranscriptionService(service: TranscriptionService): void {
    this.transcriptionService = service;
    logger.info('Transcription service registered');
  }

  registerDiarizationService(service: DiarizationService): void {
    this.diarizationService = service;
    logger.info('Diarization service registered');
  }

  registerEmbeddingService(service: EmbeddingService): void {
    this.embeddingService = service;
    logger.info('Embedding service registered');
  }

  // --- Lifecycle ---

  start(): void {
    if (this.started) return;
    this.started = true;

    this.startQueueProcessing('transcription');
    if (this.config.enableDiarization) {
      this.startQueueProcessing('diarization');
    }
    if (this.config.enableEmbeddings) {
      this.startQueueProcessing('embedding');
    }

    logger.info('Transcription orchestrator started', {
      enableDiarization: this.config.enableDiarization,
      enableEmbeddings: this.config.enableEmbeddings,
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    for (const timer of this.processingTimers.values()) {
      clearInterval(timer);
    }
    this.processingTimers.clear();

    for (const timer of this.sessionTimers.values()) {
      clearTimeout(timer);
    }
    this.sessionTimers.clear();

    logger.info('Transcription orchestrator stopped');
  }

  // --- Session management ---

  createSession(sessionId: string): SessionState {
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(`Maximum sessions (${this.config.maxSessions}) reached`);
    }

    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const now = Date.now();
    const session: SessionState = {
      id: sessionId,
      status: 'active',
      audioChunkIds: [],
      pendingResults: new Map(),
      metrics: this.createInitialMetrics(now),
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    this.resetSessionTimeout(sessionId);

    this.emitPipelineEvent('session.created', sessionId, { sessionId });
    logger.info('Session created', { sessionId });

    return session;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    return this.sessions.get(sessionId)?.metrics;
  }

  async completeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'completed';
    session.updatedAt = Date.now();

    this.cleanupSession(sessionId);

    this.emitPipelineEvent('session.completed', sessionId, {
      metrics: this.serializeMetrics(session.metrics),
    });
    logger.info('Session completed', { sessionId, metrics: this.serializeMetrics(session.metrics) });
  }

  getActiveSessions(): string[] {
    const active: string[] = [];
    for (const [id, session] of this.sessions) {
      if (session.status === 'active') {
        active.push(id);
      }
    }
    return active;
  }

  // --- Audio processing ---

  async processAudioChunk(chunk: AudioChunk): Promise<void> {
    const session = this.sessions.get(chunk.sessionId);
    if (!session) {
      throw new Error(`Session ${chunk.sessionId} not found`);
    }
    if (session.status !== 'active') {
      throw new Error(`Session ${chunk.sessionId} is not active (status: ${session.status})`);
    }

    session.audioChunkIds.push(chunk.id);
    session.metrics.chunksReceived++;
    session.metrics.lastActivityAt = Date.now();
    session.updatedAt = Date.now();

    this.resetSessionTimeout(chunk.sessionId);
    this.emitPipelineEvent('audio.chunk.received', chunk.sessionId, {
      chunkId: chunk.id,
      sequenceNumber: chunk.sequenceNumber,
    });

    // Initialize pending result
    session.pendingResults.set(chunk.id, {
      chunkId: chunk.id,
      sessionId: chunk.sessionId,
      merged: false,
    });

    // Enqueue for transcription
    const transcriptionItem: QueueItem<AudioChunk> = {
      id: `trans-${chunk.id}`,
      sessionId: chunk.sessionId,
      priority: 1,
      timestamp: Date.now(),
      data: chunk,
      retryCount: 0,
      maxRetries: this.config.transcriptionQueue.maxRetries,
    };

    const enqueued = this.transcriptionQueue.enqueue(transcriptionItem);
    if (!enqueued) {
      session.metrics.chunksFailed++;
      this.emitPipelineEvent('pipeline.backpressure', chunk.sessionId, {
        queue: 'transcription',
        chunkId: chunk.id,
      });
      this.sendStatusUpdate(chunk.sessionId, 'error', {
        message: 'Transcription queue full, chunk dropped',
        chunkId: chunk.id,
      });
      return;
    }

    // Enqueue for diarization if enabled
    if (this.config.enableDiarization) {
      const diarizationItem: QueueItem<AudioChunk> = {
        id: `diar-${chunk.id}`,
        sessionId: chunk.sessionId,
        priority: 2,
        timestamp: Date.now(),
        data: chunk,
        retryCount: 0,
        maxRetries: this.config.diarizationQueue.maxRetries,
      };
      this.diarizationQueue.enqueue(diarizationItem);
    }

    this.emitPipelineEvent('audio.chunk.queued', chunk.sessionId, { chunkId: chunk.id });
    session.metrics.queueDepth = this.transcriptionQueue.getSize();
  }

  // --- Status updates ---

  onStatusUpdate(sessionId: string, callback: StatusUpdateCallback): void {
    const callbacks = this.statusCallbacks.get(sessionId) || [];
    callbacks.push(callback);
    this.statusCallbacks.set(sessionId, callbacks);
  }

  removeStatusCallbacks(sessionId: string): void {
    this.statusCallbacks.delete(sessionId);
  }

  // --- Internal: event setup ---

  private setupEventHandlers(): void {
    this.on('audio.chunk.received', (data) => {
      logger.debug('Audio chunk received', data);
    });

    this.on('_internal.transcription.done', (data: { sessionId: string; result: TranscriptionResult }) => {
      this.handleTranscriptionResult(data.sessionId, data.result);
    });

    this.on('_internal.diarization.done', (data: { sessionId: string; result: DiarizationResult }) => {
      this.handleDiarizationResult(data.sessionId, data.result);
    });

    this.on('pipeline.error', (data: { sessionId: string; component: string; error: Error; recoverable: boolean }) => {
      this.handlePipelineError(data);
    });
  }

  private setupQueueHandlers(): void {
    for (const queue of [this.transcriptionQueue, this.diarizationQueue, this.embeddingQueue]) {
      queue.on('backpressure', (data) => {
        logger.warn('Queue backpressure', data);
        if (data.level === 'critical') {
          this.emitPipelineEvent('pipeline.backpressure', '', {
            queue: data.queueName,
            level: data.level,
            size: data.size,
          });
        }
      });

      queue.on('failed', (data) => {
        logger.error('Queue item permanently failed', data);
      });
    }
  }

  // --- Internal: queue processing ---

  private startQueueProcessing(queueName: 'transcription' | 'diarization' | 'embedding'): void {
    const interval = setInterval(() => {
      if (!this.started) return;
      this.processNextInQueue(queueName);
    }, 50);

    this.processingTimers.set(queueName, interval);
  }

  private processNextInQueue(queueName: 'transcription' | 'diarization' | 'embedding'): void {
    switch (queueName) {
      case 'transcription':
        this.processTranscriptionQueue();
        break;
      case 'diarization':
        this.processDiarizationQueue();
        break;
      case 'embedding':
        this.processEmbeddingQueue();
        break;
    }
  }

  private async processTranscriptionQueue(): Promise<void> {
    if (!this.transcriptionService) return;

    const item = this.transcriptionQueue.dequeue();
    if (!item) return;

    const startTime = Date.now();
    this.emitPipelineEvent('transcription.started', item.sessionId, { chunkId: item.data.id });

    try {
      const result = await this.transcriptionService.transcribe(item.data);
      this.transcriptionQueue.complete(item.id);

      const processingTime = Date.now() - startTime;
      this.updateProcessingMetrics(item.sessionId, processingTime);

      this.emit('_internal.transcription.done', { sessionId: item.sessionId, result });
    } catch (error) {
      const retried = this.transcriptionQueue.fail(item.id, item);
      this.emit('pipeline.error', {
        sessionId: item.sessionId,
        component: 'transcription',
        error,
        recoverable: retried,
      });

      if (!retried) {
        this.emitPipelineEvent('transcription.error', item.sessionId, {
          chunkId: item.data.id,
          error: (error as Error).message,
        });
      }
    }
  }

  private async processDiarizationQueue(): Promise<void> {
    if (!this.diarizationService) return;

    const item = this.diarizationQueue.dequeue();
    if (!item) return;

    this.emitPipelineEvent('diarization.started', item.sessionId, { chunkId: item.data.id });

    try {
      const result = await this.diarizationService.diarize(item.data);
      this.diarizationQueue.complete(item.id);

      this.emit('_internal.diarization.done', { sessionId: item.sessionId, result });
    } catch (error) {
      const retried = this.diarizationQueue.fail(item.id, item);
      this.emit('pipeline.error', {
        sessionId: item.sessionId,
        component: 'diarization',
        error,
        recoverable: retried,
      });

      if (!retried) {
        this.emitPipelineEvent('diarization.error', item.sessionId, {
          chunkId: item.data.id,
          error: (error as Error).message,
        });
      }
    }
  }

  private async processEmbeddingQueue(): Promise<void> {
    if (!this.embeddingService) return;

    const item = this.embeddingQueue.dequeue();
    if (!item) return;

    this.emitPipelineEvent('embedding.started', item.sessionId, { chunkId: item.data.chunkId });

    try {
      const result = await this.embeddingService.generateEmbedding(item.data.fullText, {
        sessionId: item.data.sessionId,
        chunkId: item.data.chunkId,
        speakers: item.data.speakers,
        startTime: item.data.startTime,
        endTime: item.data.endTime,
      });
      this.embeddingQueue.complete(item.id);

      this.handleEmbeddingResult(item.sessionId, item.data.chunkId, result);
    } catch (error) {
      const retried = this.embeddingQueue.fail(item.id, item);
      this.emit('pipeline.error', {
        sessionId: item.sessionId,
        component: 'embedding',
        error,
        recoverable: retried,
      });

      if (!retried) {
        this.emitPipelineEvent('embedding.error', item.sessionId, {
          chunkId: item.data.chunkId,
          error: (error as Error).message,
        });
      }
    }
  }

  // --- Internal: result coordination ---

  private handleTranscriptionResult(sessionId: string, result: TranscriptionResult): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pending = session.pendingResults.get(result.chunkId);
    if (!pending) return;

    pending.transcription = result;
    session.metrics.transcriptionsCompleted++;
    session.updatedAt = Date.now();

    this.emitPipelineEvent('transcription.completed', sessionId, {
      chunkId: result.chunkId,
      text: result.text,
      confidence: result.confidence,
    });

    this.sendStatusUpdate(sessionId, 'result', {
      type: 'transcription',
      chunkId: result.chunkId,
      text: result.text,
      confidence: result.confidence,
    });

    this.tryMergeResults(sessionId, result.chunkId);
  }

  private handleDiarizationResult(sessionId: string, result: DiarizationResult): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pending = session.pendingResults.get(result.chunkId);
    if (!pending) return;

    pending.diarization = result;
    session.metrics.diarizationsCompleted++;
    session.updatedAt = Date.now();

    this.emitPipelineEvent('diarization.completed', sessionId, {
      chunkId: result.chunkId,
      speakers: result.speakers,
    });

    this.tryMergeResults(sessionId, result.chunkId);
  }

  private handleEmbeddingResult(sessionId: string, chunkId: string, result: VectorResult): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pending = session.pendingResults.get(chunkId);
    if (pending) {
      pending.embedding = result;
    }

    session.metrics.embeddingsCompleted++;
    session.updatedAt = Date.now();

    this.emitPipelineEvent('embedding.completed', sessionId, {
      chunkId,
      embeddingId: result.embeddingId,
      stored: result.stored,
    });

    session.metrics.chunksProcessed++;

    this.sendStatusUpdate(sessionId, 'progress', {
      chunksProcessed: session.metrics.chunksProcessed,
      chunksReceived: session.metrics.chunksReceived,
    });
  }

  private tryMergeResults(sessionId: string, chunkId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pending = session.pendingResults.get(chunkId);
    if (!pending || pending.merged) return;

    const hasTranscription = !!pending.transcription;
    const hasDiarization = !!pending.diarization || !this.config.enableDiarization;

    if (!hasTranscription || !hasDiarization) return;

    const merged = this.mergeResults(pending);
    pending.merged = true;
    pending.mergedAt = Date.now();

    this.emitPipelineEvent('results.merged', sessionId, {
      chunkId,
      segments: merged.segments.length,
      speakers: merged.speakers,
    });

    // If embeddings not enabled, mark as fully processed
    if (!this.config.enableEmbeddings) {
      session.metrics.chunksProcessed++;
      this.sendStatusUpdate(sessionId, 'progress', {
        chunksProcessed: session.metrics.chunksProcessed,
        chunksReceived: session.metrics.chunksReceived,
      });
      return;
    }

    // Queue for embedding generation
    const embeddingItem: QueueItem<MergedResult> = {
      id: `embed-${chunkId}`,
      sessionId,
      priority: 3,
      timestamp: Date.now(),
      data: merged,
      retryCount: 0,
      maxRetries: this.config.embeddingQueue.maxRetries,
    };
    this.embeddingQueue.enqueue(embeddingItem);
  }

  mergeResults(pending: ProcessingResult): MergedResult {
    const transcription = pending.transcription!;
    const diarization = pending.diarization;

    if (!diarization) {
      return {
        chunkId: pending.chunkId,
        sessionId: pending.sessionId,
        segments: [
          {
            text: transcription.text,
            speakerId: 'unknown',
            startTime: transcription.startTime,
            endTime: transcription.endTime,
            confidence: transcription.confidence,
          },
        ],
        fullText: transcription.text,
        speakers: ['unknown'],
        startTime: transcription.startTime,
        endTime: transcription.endTime,
      };
    }

    const segments: MergedTranscriptionSegment[] = diarization.segments.map((seg) => {
      const words = transcription.words?.filter(
        (w) => w.startTime >= seg.startTime && w.endTime <= seg.endTime
      ) || [];

      const text = words.length > 0
        ? words.map((w) => w.word).join(' ')
        : transcription.text;

      const avgConfidence = words.length > 0
        ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
        : transcription.confidence;

      return {
        text,
        speakerId: seg.speakerId,
        startTime: seg.startTime,
        endTime: seg.endTime,
        confidence: Math.min(avgConfidence, seg.confidence),
      };
    });

    return {
      chunkId: pending.chunkId,
      sessionId: pending.sessionId,
      segments,
      fullText: segments.map((s) => `[${s.speakerId}]: ${s.text}`).join(' '),
      speakers: diarization.speakers,
      startTime: transcription.startTime,
      endTime: transcription.endTime,
    };
  }

  // --- Internal: error handling ---

  private handlePipelineError(data: {
    sessionId: string;
    component: string;
    error: Error;
    recoverable: boolean;
  }): void {
    const { sessionId, component, error, recoverable } = data;
    logger.error('Pipeline error', {
      sessionId,
      component,
      error: error.message,
      recoverable,
    });

    const session = this.sessions.get(sessionId);
    if (session) {
      session.metrics.chunksFailed++;
      session.updatedAt = Date.now();
    }

    this.sendStatusUpdate(sessionId, 'error', {
      component,
      message: error.message,
      recoverable,
    });

    if (!recoverable && session) {
      session.status = 'error';
      this.emitPipelineEvent('session.error', sessionId, {
        component,
        error: error.message,
      });
    }
  }

  // --- Internal: session management ---

  private resetSessionTimeout(sessionId: string): void {
    const existing = this.sessionTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session && session.status === 'active') {
        logger.warn('Session timed out', { sessionId });
        this.completeSession(sessionId).catch((err) => {
          logger.error('Error completing timed-out session', { sessionId, error: (err as Error).message });
        });
      }
    }, this.config.sessionTimeoutMs);

    this.sessionTimers.set(sessionId, timer);
  }

  private cleanupSession(sessionId: string): void {
    const timer = this.sessionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete(sessionId);
    }

    this.transcriptionQueue.clearSession(sessionId);
    this.diarizationQueue.clearSession(sessionId);
    this.embeddingQueue.clearSession(sessionId);
    this.statusCallbacks.delete(sessionId);

    this.emitPipelineEvent('session.cleanup', sessionId, { sessionId });
  }

  // --- Internal: metrics ---

  private createInitialMetrics(now: number): SessionMetrics {
    return {
      chunksReceived: 0,
      chunksProcessed: 0,
      chunksFailed: 0,
      transcriptionsCompleted: 0,
      diarizationsCompleted: 0,
      embeddingsCompleted: 0,
      averageProcessingTimeMs: 0,
      totalProcessingTimeMs: 0,
      queueDepth: 0,
      backpressureEvents: 0,
      startedAt: now,
      lastActivityAt: now,
    };
  }

  private updateProcessingMetrics(sessionId: string, processingTimeMs: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.metrics.totalProcessingTimeMs += processingTimeMs;
    const totalCompleted = session.metrics.transcriptionsCompleted + 1;
    session.metrics.averageProcessingTimeMs =
      session.metrics.totalProcessingTimeMs / totalCompleted;
  }

  private serializeMetrics(metrics: SessionMetrics): Record<string, unknown> {
    return {
      chunksReceived: metrics.chunksReceived,
      chunksProcessed: metrics.chunksProcessed,
      chunksFailed: metrics.chunksFailed,
      transcriptionsCompleted: metrics.transcriptionsCompleted,
      diarizationsCompleted: metrics.diarizationsCompleted,
      embeddingsCompleted: metrics.embeddingsCompleted,
      averageProcessingTimeMs: metrics.averageProcessingTimeMs,
      totalProcessingTimeMs: metrics.totalProcessingTimeMs,
      queueDepth: metrics.queueDepth,
      backpressureEvents: metrics.backpressureEvents,
      startedAt: metrics.startedAt,
      lastActivityAt: metrics.lastActivityAt,
    };
  }

  // --- Internal: events & status ---

  private emitPipelineEvent(
    name: PipelineEventName,
    sessionId: string,
    data: Record<string, unknown>
  ): void {
    this.emit(name, { sessionId, timestamp: Date.now(), ...data });
  }

  private sendStatusUpdate(
    sessionId: string,
    type: StatusUpdate['type'],
    data: Record<string, unknown>
  ): void {
    const update: StatusUpdate = {
      sessionId,
      type,
      timestamp: Date.now(),
      data,
    };

    this.emitPipelineEvent('status.update', sessionId, { update });

    const callbacks = this.statusCallbacks.get(sessionId);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(update);
        } catch (err) {
          logger.error('Status callback error', { sessionId, error: (err as Error).message });
        }
      }
    }
  }

  // --- Public: queue stats ---

  getQueueStats(): Record<string, ReturnType<ProcessingQueue['getStats']>> {
    return {
      transcription: this.transcriptionQueue.getStats(),
      diarization: this.diarizationQueue.getStats(),
      embedding: this.embeddingQueue.getStats(),
    };
  }

  isStarted(): boolean {
    return this.started;
  }
}

export const transcriptionOrchestratorService = {
  createOrchestrator(config?: Partial<OrchestratorConfig>): TranscriptionOrchestrator {
    return new TranscriptionOrchestrator(config);
  },
};
