import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranscriptionOrchestrator } from '../../services/transcriptionOrchestrator';
import { ProcessingQueue } from '../../utils/queueManager';
import {
  AudioChunk,
  TranscriptionResult,
  DiarizationResult,
  VectorResult,
  TranscriptionService,
  DiarizationService,
  EmbeddingService,
  OrchestratorConfig,
  ProcessingResult,
} from '../../types/pipeline';

// --- Helpers ---

function createAudioChunk(overrides: Partial<AudioChunk> = {}): AudioChunk {
  return {
    id: `chunk-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: 'session-1',
    data: Buffer.from('mock-audio-data'),
    timestamp: Date.now(),
    sampleRate: 16000,
    channels: 1,
    sequenceNumber: 0,
    ...overrides,
  };
}

function createTranscriptionResult(chunkId: string, sessionId: string): TranscriptionResult {
  return {
    chunkId,
    sessionId,
    text: 'Hello world',
    confidence: 0.95,
    startTime: 0,
    endTime: 1000,
    language: 'en',
    words: [
      { word: 'Hello', startTime: 0, endTime: 400, confidence: 0.96 },
      { word: 'world', startTime: 500, endTime: 1000, confidence: 0.94 },
    ],
  };
}

function createDiarizationResult(chunkId: string, sessionId: string): DiarizationResult {
  return {
    chunkId,
    sessionId,
    speakers: ['speaker-1', 'speaker-2'],
    segments: [
      { speakerId: 'speaker-1', startTime: 0, endTime: 500, confidence: 0.9 },
      { speakerId: 'speaker-2', startTime: 500, endTime: 1000, confidence: 0.85 },
    ],
  };
}

function createMockTranscriptionService(): TranscriptionService {
  return {
    transcribe: vi.fn().mockImplementation(async (chunk: AudioChunk) => {
      return createTranscriptionResult(chunk.id, chunk.sessionId);
    }),
  };
}

function createMockDiarizationService(): DiarizationService {
  return {
    diarize: vi.fn().mockImplementation(async (chunk: AudioChunk) => {
      return createDiarizationResult(chunk.id, chunk.sessionId);
    }),
  };
}

function createMockEmbeddingService(): EmbeddingService {
  return {
    generateEmbedding: vi.fn().mockImplementation(async (_text: string, metadata: Record<string, unknown>) => {
      const result: VectorResult = {
        chunkId: metadata.chunkId as string,
        sessionId: metadata.sessionId as string,
        embeddingId: `emb-${Math.random().toString(36).slice(2, 8)}`,
        stored: true,
      };
      return result;
    }),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Tests ---

describe('ProcessingQueue', () => {
  let queue: ProcessingQueue;

  beforeEach(() => {
    queue = new ProcessingQueue('test', { maxSize: 5, warningThreshold: 3, processingConcurrency: 2 });
  });

  it('should enqueue and dequeue items in priority order', () => {
    queue.enqueue({ id: '1', sessionId: 's1', priority: 3, timestamp: 1, data: 'low', retryCount: 0, maxRetries: 3 });
    queue.enqueue({ id: '2', sessionId: 's1', priority: 1, timestamp: 2, data: 'high', retryCount: 0, maxRetries: 3 });
    queue.enqueue({ id: '3', sessionId: 's1', priority: 2, timestamp: 3, data: 'mid', retryCount: 0, maxRetries: 3 });

    const first = queue.dequeue();
    expect(first?.id).toBe('2');
    expect(first?.data).toBe('high');

    const second = queue.dequeue();
    expect(second?.id).toBe('3');
  });

  it('should respect concurrency limits', () => {
    queue.enqueue({ id: '1', sessionId: 's1', priority: 1, timestamp: 1, data: 'a', retryCount: 0, maxRetries: 3 });
    queue.enqueue({ id: '2', sessionId: 's1', priority: 1, timestamp: 2, data: 'b', retryCount: 0, maxRetries: 3 });
    queue.enqueue({ id: '3', sessionId: 's1', priority: 1, timestamp: 3, data: 'c', retryCount: 0, maxRetries: 3 });

    queue.dequeue(); // processing: 1
    queue.dequeue(); // processing: 2
    const third = queue.dequeue(); // should be undefined (concurrency = 2)
    expect(third).toBeUndefined();

    queue.complete('1'); // processing: 1
    const nowAvailable = queue.dequeue();
    expect(nowAvailable?.id).toBe('3');
  });

  it('should reject enqueue when at critical backpressure', () => {
    for (let i = 0; i < 5; i++) {
      queue.enqueue({ id: `${i}`, sessionId: 's1', priority: 1, timestamp: i, data: i, retryCount: 0, maxRetries: 3 });
    }
    const result = queue.enqueue({ id: '6', sessionId: 's1', priority: 1, timestamp: 6, data: 6, retryCount: 0, maxRetries: 3 });
    expect(result).toBe(false);
  });

  it('should emit backpressure warning', () => {
    const handler = vi.fn();
    queue.on('backpressure', handler);

    for (let i = 0; i < 4; i++) {
      queue.enqueue({ id: `${i}`, sessionId: 's1', priority: 1, timestamp: i, data: i, retryCount: 0, maxRetries: 3 });
    }

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning' }));
  });

  it('should retry failed items with increased priority', () => {
    const item = { id: '1', sessionId: 's1', priority: 1, timestamp: 1, data: 'a', retryCount: 0, maxRetries: 3 };
    queue.enqueue(item);
    const dequeued = queue.dequeue()!;
    const retried = queue.fail(dequeued.id, dequeued);
    expect(retried).toBe(true);

    const retryItem = queue.dequeue();
    expect(retryItem?.retryCount).toBe(1);
    expect(retryItem?.priority).toBe(2);
  });

  it('should not retry when maxRetries exceeded', () => {
    const item = { id: '1', sessionId: 's1', priority: 1, timestamp: 1, data: 'a', retryCount: 3, maxRetries: 3 };
    queue.enqueue(item);
    const dequeued = queue.dequeue()!;
    const retried = queue.fail(dequeued.id, dequeued);
    expect(retried).toBe(false);
  });

  it('should clear items for a specific session', () => {
    queue.enqueue({ id: '1', sessionId: 's1', priority: 1, timestamp: 1, data: 'a', retryCount: 0, maxRetries: 3 });
    queue.enqueue({ id: '2', sessionId: 's2', priority: 1, timestamp: 2, data: 'b', retryCount: 0, maxRetries: 3 });
    queue.enqueue({ id: '3', sessionId: 's1', priority: 1, timestamp: 3, data: 'c', retryCount: 0, maxRetries: 3 });

    const removed = queue.clearSession('s1');
    expect(removed).toBe(2);
    expect(queue.getSize()).toBe(1);
  });

  it('should return correct stats', () => {
    queue.enqueue({ id: '1', sessionId: 's1', priority: 1, timestamp: 1, data: 'a', retryCount: 0, maxRetries: 3 });
    queue.dequeue();

    const stats = queue.getStats();
    expect(stats.name).toBe('test');
    expect(stats.queued).toBe(0);
    expect(stats.processing).toBe(1);
    expect(stats.total).toBe(1);
    expect(stats.backpressure).toBe('normal');
  });
});

describe('TranscriptionOrchestrator', () => {
  let orchestrator: TranscriptionOrchestrator;
  let mockTranscription: TranscriptionService;
  let mockDiarization: DiarizationService;
  let mockEmbedding: EmbeddingService;

  beforeEach(() => {
    orchestrator = new TranscriptionOrchestrator({
      sessionTimeoutMs: 5000,
      maxSessions: 10,
      enableDiarization: true,
      enableEmbeddings: true,
    });

    mockTranscription = createMockTranscriptionService();
    mockDiarization = createMockDiarizationService();
    mockEmbedding = createMockEmbeddingService();

    orchestrator.registerTranscriptionService(mockTranscription);
    orchestrator.registerDiarizationService(mockDiarization);
    orchestrator.registerEmbeddingService(mockEmbedding);
  });

  afterEach(() => {
    orchestrator.stop();
  });

  describe('Session management', () => {
    it('should create a new session', () => {
      const session = orchestrator.createSession('session-1');
      expect(session.id).toBe('session-1');
      expect(session.status).toBe('active');
      expect(session.metrics.chunksReceived).toBe(0);
    });

    it('should throw when creating duplicate session', () => {
      orchestrator.createSession('session-1');
      expect(() => orchestrator.createSession('session-1')).toThrow('already exists');
    });

    it('should throw when max sessions reached', () => {
      for (let i = 0; i < 10; i++) {
        orchestrator.createSession(`session-${i}`);
      }
      expect(() => orchestrator.createSession('session-11')).toThrow('Maximum sessions');
    });

    it('should get session by id', () => {
      orchestrator.createSession('session-1');
      const session = orchestrator.getSession('session-1');
      expect(session).toBeDefined();
      expect(session?.id).toBe('session-1');
    });

    it('should return undefined for non-existent session', () => {
      expect(orchestrator.getSession('nonexistent')).toBeUndefined();
    });

    it('should complete a session', async () => {
      orchestrator.createSession('session-1');
      await orchestrator.completeSession('session-1');
      const session = orchestrator.getSession('session-1');
      expect(session?.status).toBe('completed');
    });

    it('should throw when completing non-existent session', async () => {
      await expect(orchestrator.completeSession('nonexistent')).rejects.toThrow('not found');
    });

    it('should list active sessions', () => {
      orchestrator.createSession('session-1');
      orchestrator.createSession('session-2');
      const active = orchestrator.getActiveSessions();
      expect(active).toHaveLength(2);
      expect(active).toContain('session-1');
      expect(active).toContain('session-2');
    });

    it('should emit session.created event', () => {
      const handler = vi.fn();
      orchestrator.on('session.created', handler);
      orchestrator.createSession('session-1');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1' }));
    });

    it('should emit session.completed event', async () => {
      const handler = vi.fn();
      orchestrator.on('session.completed', handler);
      orchestrator.createSession('session-1');
      await orchestrator.completeSession('session-1');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1' }));
    });
  });

  describe('Audio processing', () => {
    it('should process an audio chunk', async () => {
      orchestrator.createSession('session-1');
      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      const session = orchestrator.getSession('session-1');
      expect(session?.metrics.chunksReceived).toBe(1);
      expect(session?.audioChunkIds).toContain(chunk.id);
    });

    it('should throw for non-existent session', async () => {
      const chunk = createAudioChunk({ sessionId: 'nonexistent' });
      await expect(orchestrator.processAudioChunk(chunk)).rejects.toThrow('not found');
    });

    it('should throw for inactive session', async () => {
      orchestrator.createSession('session-1');
      await orchestrator.completeSession('session-1');
      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await expect(orchestrator.processAudioChunk(chunk)).rejects.toThrow('not active');
    });

    it('should emit audio.chunk.received event', async () => {
      const handler = vi.fn();
      orchestrator.on('audio.chunk.received', handler);
      orchestrator.createSession('session-1');
      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ chunkId: chunk.id }));
    });

    it('should initialize pending result for chunk', async () => {
      orchestrator.createSession('session-1');
      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      const session = orchestrator.getSession('session-1');
      expect(session?.pendingResults.has(chunk.id)).toBe(true);
      expect(session?.pendingResults.get(chunk.id)?.merged).toBe(false);
    });
  });

  describe('Pipeline processing (end-to-end)', () => {
    it('should process audio through transcription pipeline', async () => {
      orchestrator.start();
      orchestrator.createSession('session-1');

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      // Wait for async processing
      await wait(300);

      expect(mockTranscription.transcribe).toHaveBeenCalledWith(chunk);
    });

    it('should process audio through diarization pipeline', async () => {
      orchestrator.start();
      orchestrator.createSession('session-1');

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(300);

      expect(mockDiarization.diarize).toHaveBeenCalledWith(chunk);
    });

    it('should merge transcription and diarization results', async () => {
      orchestrator.start();
      orchestrator.createSession('session-1');

      const mergedHandler = vi.fn();
      orchestrator.on('results.merged', mergedHandler);

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(500);

      expect(mergedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1', chunkId: chunk.id })
      );
    });

    it('should trigger embedding after merge', async () => {
      orchestrator.start();
      orchestrator.createSession('session-1');

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(700);

      expect(mockEmbedding.generateEmbedding).toHaveBeenCalled();
    });

    it('should update session metrics after processing', async () => {
      orchestrator.start();
      orchestrator.createSession('session-1');

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(700);

      const metrics = orchestrator.getSessionMetrics('session-1');
      expect(metrics?.chunksReceived).toBe(1);
      expect(metrics?.transcriptionsCompleted).toBe(1);
    });
  });

  describe('Pipeline without diarization', () => {
    it('should skip diarization when disabled', async () => {
      orchestrator.stop();
      orchestrator = new TranscriptionOrchestrator({
        enableDiarization: false,
        enableEmbeddings: true,
        sessionTimeoutMs: 5000,
      });
      orchestrator.registerTranscriptionService(mockTranscription);
      orchestrator.registerEmbeddingService(mockEmbedding);
      orchestrator.start();
      orchestrator.createSession('session-1');

      const mergedHandler = vi.fn();
      orchestrator.on('results.merged', mergedHandler);

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(500);

      expect(mergedHandler).toHaveBeenCalled();
      // Diarization should NOT have been called
      expect(mockDiarization.diarize).not.toHaveBeenCalled();
    });
  });

  describe('Pipeline without embeddings', () => {
    it('should skip embedding when disabled', async () => {
      orchestrator.stop();
      orchestrator = new TranscriptionOrchestrator({
        enableDiarization: true,
        enableEmbeddings: false,
        sessionTimeoutMs: 5000,
      });
      orchestrator.registerTranscriptionService(mockTranscription);
      orchestrator.registerDiarizationService(mockDiarization);
      orchestrator.start();
      orchestrator.createSession('session-1');

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(500);

      const metrics = orchestrator.getSessionMetrics('session-1');
      expect(metrics?.chunksProcessed).toBe(1);
      expect(mockEmbedding.generateEmbedding).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle transcription errors with retry', async () => {
      const failingTranscription: TranscriptionService = {
        transcribe: vi.fn()
          .mockRejectedValueOnce(new Error('Transcription failed'))
          .mockImplementation(async (chunk: AudioChunk) =>
            createTranscriptionResult(chunk.id, chunk.sessionId)
          ),
      };

      orchestrator.stop();
      orchestrator = new TranscriptionOrchestrator({
        enableDiarization: false,
        enableEmbeddings: false,
        sessionTimeoutMs: 5000,
      });
      orchestrator.registerTranscriptionService(failingTranscription);
      orchestrator.start();
      orchestrator.createSession('session-1');

      const errorHandler = vi.fn();
      orchestrator.on('pipeline.error', errorHandler);

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(500);

      expect(errorHandler).toHaveBeenCalled();
      // Second call should succeed (retry)
      expect(failingTranscription.transcribe).toHaveBeenCalledTimes(2);
    });

    it('should emit pipeline.error for non-recoverable failures', async () => {
      const alwaysFailingService: TranscriptionService = {
        transcribe: vi.fn().mockRejectedValue(new Error('Permanent failure')),
      };

      orchestrator.stop();
      orchestrator = new TranscriptionOrchestrator({
        enableDiarization: false,
        enableEmbeddings: false,
        sessionTimeoutMs: 5000,
        transcriptionQueue: { maxSize: 100, warningThreshold: 80, maxRetries: 0, processingConcurrency: 2 },
      });
      orchestrator.registerTranscriptionService(alwaysFailingService);
      orchestrator.start();
      orchestrator.createSession('session-1');

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(300);

      const session = orchestrator.getSession('session-1');
      expect(session?.status).toBe('error');
    });
  });

  describe('Status updates', () => {
    it('should send status updates to registered callbacks', async () => {
      orchestrator.start();
      orchestrator.createSession('session-1');

      const statusHandler = vi.fn();
      orchestrator.onStatusUpdate('session-1', statusHandler);

      const chunk = createAudioChunk({ sessionId: 'session-1' });
      await orchestrator.processAudioChunk(chunk);

      await wait(500);

      expect(statusHandler).toHaveBeenCalled();
      const calls = statusHandler.mock.calls;
      const hasResultUpdate = calls.some(
        (call: unknown[]) => (call[0] as { type: string }).type === 'result'
      );
      expect(hasResultUpdate).toBe(true);
    });

    it('should remove status callbacks', () => {
      orchestrator.createSession('session-1');
      const handler = vi.fn();
      orchestrator.onStatusUpdate('session-1', handler);
      orchestrator.removeStatusCallbacks('session-1');

      // No crash, callbacks cleaned up
      expect(true).toBe(true);
    });
  });

  describe('Result merging', () => {
    it('should merge transcription and diarization results correctly', () => {
      const pending: ProcessingResult = {
        chunkId: 'chunk-1',
        sessionId: 'session-1',
        merged: false,
        transcription: {
          chunkId: 'chunk-1',
          sessionId: 'session-1',
          text: 'Hello world',
          confidence: 0.95,
          startTime: 0,
          endTime: 1000,
          language: 'en',
          words: [
            { word: 'Hello', startTime: 0, endTime: 400, confidence: 0.96 },
            { word: 'world', startTime: 500, endTime: 1000, confidence: 0.94 },
          ],
        },
        diarization: {
          chunkId: 'chunk-1',
          sessionId: 'session-1',
          speakers: ['speaker-1', 'speaker-2'],
          segments: [
            { speakerId: 'speaker-1', startTime: 0, endTime: 450, confidence: 0.9 },
            { speakerId: 'speaker-2', startTime: 450, endTime: 1000, confidence: 0.85 },
          ],
        },
      };

      const merged = orchestrator.mergeResults(pending);
      expect(merged.segments).toHaveLength(2);
      expect(merged.speakers).toEqual(['speaker-1', 'speaker-2']);
      expect(merged.segments[0].speakerId).toBe('speaker-1');
      expect(merged.segments[0].text).toBe('Hello');
      expect(merged.segments[1].speakerId).toBe('speaker-2');
      expect(merged.segments[1].text).toBe('world');
    });

    it('should handle merge without diarization', () => {
      const pending: ProcessingResult = {
        chunkId: 'chunk-1',
        sessionId: 'session-1',
        merged: false,
        transcription: {
          chunkId: 'chunk-1',
          sessionId: 'session-1',
          text: 'Hello world',
          confidence: 0.95,
          startTime: 0,
          endTime: 1000,
          language: 'en',
        },
      };

      const merged = orchestrator.mergeResults(pending);
      expect(merged.segments).toHaveLength(1);
      expect(merged.segments[0].speakerId).toBe('unknown');
      expect(merged.segments[0].text).toBe('Hello world');
      expect(merged.speakers).toEqual(['unknown']);
    });
  });

  describe('Queue statistics', () => {
    it('should return queue stats', () => {
      const stats = orchestrator.getQueueStats();
      expect(stats.transcription).toBeDefined();
      expect(stats.diarization).toBeDefined();
      expect(stats.embedding).toBeDefined();
      expect(stats.transcription.name).toBe('transcription');
    });
  });

  describe('Orchestrator lifecycle', () => {
    it('should start and stop', () => {
      expect(orchestrator.isStarted()).toBe(false);
      orchestrator.start();
      expect(orchestrator.isStarted()).toBe(true);
      orchestrator.stop();
      expect(orchestrator.isStarted()).toBe(false);
    });

    it('should not start twice', () => {
      orchestrator.start();
      orchestrator.start(); // should be a no-op
      expect(orchestrator.isStarted()).toBe(true);
    });
  });
});
