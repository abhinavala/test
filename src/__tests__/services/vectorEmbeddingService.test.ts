import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EmbeddingPipeline,
  toPgVector,
  fromPgVector,
  chunk,
  validateEmbedding,
  cosineSimilarity,
} from '../../utils/embeddingUtils.js';
import {
  EMBEDDING_DIMENSION,
  type TranscriptSegment,
  type SemanticSearchOptions,
  type BatchEmbedResult,
  type CreateTranscriptSegmentInput,
  type VectorEmbedding,
  type SemanticSearchResult,
  type EmbeddingConfig,
} from '../../types/embedding.js';
import { VectorEmbeddingService, generateEmbedding, batchGenerateEmbeddings } from '../../services/vectorEmbeddingService.js';

// --- Utility function tests ---

describe('embeddingUtils', () => {
  describe('toPgVector', () => {
    it('should format a number array as a pgvector string', () => {
      const embedding = [0.1, 0.2, 0.3];
      expect(toPgVector(embedding)).toBe('[0.1,0.2,0.3]');
    });

    it('should handle empty arrays', () => {
      expect(toPgVector([])).toBe('[]');
    });

    it('should handle negative numbers', () => {
      expect(toPgVector([-0.5, 0.5])).toBe('[-0.5,0.5]');
    });
  });

  describe('fromPgVector', () => {
    it('should parse a pgvector string into a number array', () => {
      const result = fromPgVector('[0.1,0.2,0.3]');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should roundtrip with toPgVector', () => {
      const original = [0.123, -0.456, 0.789];
      const roundtripped = fromPgVector(toPgVector(original));
      expect(roundtripped).toEqual(original);
    });
  });

  describe('chunk', () => {
    it('should split an array into chunks of the given size', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(chunk(arr, 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle an array smaller than chunk size', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });

    it('should return empty array for empty input', () => {
      expect(chunk([], 3)).toEqual([]);
    });

    it('should handle exact chunk size', () => {
      expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    });
  });

  describe('validateEmbedding', () => {
    it('should return true for a valid embedding', () => {
      const embedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
      expect(validateEmbedding(embedding)).toBe(true);
    });

    it('should return false for wrong dimension', () => {
      const embedding = [0.1, 0.2];
      expect(validateEmbedding(embedding)).toBe(false);
    });

    it('should return false if any value is NaN', () => {
      const embedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
      embedding[0] = NaN;
      expect(validateEmbedding(embedding)).toBe(false);
    });

    it('should return false if any value is Infinity', () => {
      const embedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
      embedding[0] = Infinity;
      expect(validateEmbedding(embedding)).toBe(false);
    });

    it('should validate against a custom dimension', () => {
      expect(validateEmbedding([0.1, 0.2, 0.3], 3)).toBe(true);
      expect(validateEmbedding([0.1, 0.2, 0.3], 4)).toBe(false);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical normalized vectors', () => {
      const v = [0.5, 0.5, 0.5, 0.5];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it('should throw for mismatched dimensions', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('dimension mismatch');
    });

    it('should return 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });
  });
});

// --- Type definition tests ---

describe('embedding types', () => {
  it('should have EMBEDDING_DIMENSION set to 384', () => {
    expect(EMBEDDING_DIMENSION).toBe(384);
  });

  it('should define VectorEmbedding interface correctly', () => {
    const ve: VectorEmbedding = {
      id: 'emb-1',
      segmentId: 'seg-1',
      embedding: [0.1, 0.2],
      modelName: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
    };
    expect(ve.id).toBe('emb-1');
    expect(ve.segmentId).toBe('seg-1');
    expect(ve.dimensions).toBe(384);
  });

  it('should define SemanticSearchResult interface correctly', () => {
    const ssr: SemanticSearchResult = {
      segment: {
        id: 'seg-1',
        meetingId: 'meeting-1',
        segmentText: 'test',
        startTime: '00:00:00',
        endTime: '00:00:10',
      },
      similarity: 0.95,
      rank: 1,
    };
    expect(ssr.similarity).toBe(0.95);
    expect(ssr.rank).toBe(1);
  });

  it('should define EmbeddingConfig interface correctly', () => {
    const config: EmbeddingConfig = {
      modelName: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      quantized: true,
      modelPath: './models/',
    };
    expect(config.modelName).toBe('Xenova/all-MiniLM-L6-v2');
    expect(config.dimensions).toBe(384);
  });
});

// --- Service tests with mocked dependencies ---

describe('VectorEmbeddingService', () => {
  let service: VectorEmbeddingService;
  let mockPool: any;
  let mockEmbedder: any;

  const fakeEmbedding = new Array(EMBEDDING_DIMENSION).fill(0.01);

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };

    // Create service with mock pool
    service = new VectorEmbeddingService(mockPool);

    // Access private embedder and mock it
    mockEmbedder = {
      init: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue([fakeEmbedding]),
      embedSingle: vi.fn().mockResolvedValue(fakeEmbedding),
    };
    (service as any).embedder = mockEmbedder;
  });

  describe('initSchema', () => {
    it('should create pgvector extension and table', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await service.initSchema();

      expect(mockPool.query).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS vector');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS transcripts')
      );
    });

    it('should create indexes', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await service.initSchema();

      // Should attempt to create meeting_id index and text search index
      const calls = mockPool.query.mock.calls.map((c: any) => c[0]);
      expect(calls.some((q: string) => q.includes('idx_transcripts_meeting_time'))).toBe(true);
      expect(calls.some((q: string) => q.includes('idx_transcripts_text_search'))).toBe(true);
    });
  });

  describe('storeSegment', () => {
    it('should store a segment with its embedding', async () => {
      const input: CreateTranscriptSegmentInput = {
        meetingId: '550e8400-e29b-41d4-a716-446655440000',
        segmentText: 'We need to discuss the Q4 roadmap',
        startTime: '00:05:00',
        endTime: '00:05:30',
        speakerId: 'speaker-1',
      };

      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'some-uuid',
          meeting_id: input.meetingId,
          segment_text: input.segmentText,
          start_time: input.startTime,
          end_time: input.endTime,
          speaker_id: input.speakerId,
          embedding: null,
          created_at: new Date(),
        }],
      });

      const result = await service.storeSegment(input);
      expect(result.meetingId).toBe(input.meetingId);
      expect(result.segmentText).toBe(input.segmentText);
      expect(mockEmbedder.embedSingle).toHaveBeenCalledWith(input.segmentText);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transcripts'),
        expect.arrayContaining([input.meetingId, input.segmentText])
      );
    });

    it('should store without embedding on embedder failure (fallback)', async () => {
      mockEmbedder.embedSingle.mockRejectedValue(new Error('Model unavailable'));

      const input: CreateTranscriptSegmentInput = {
        meetingId: '550e8400-e29b-41d4-a716-446655440000',
        segmentText: 'Test segment',
        startTime: '00:00:00',
        endTime: '00:00:10',
      };

      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'some-uuid',
          meeting_id: input.meetingId,
          segment_text: input.segmentText,
          start_time: input.startTime,
          end_time: input.endTime,
          speaker_id: null,
          embedding: null,
          created_at: new Date(),
        }],
      });

      const result = await service.storeSegment(input);
      expect(result.segmentText).toBe(input.segmentText);
      // Should still insert, just without embedding
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('storeSegments', () => {
    it('should store multiple segments in batch', async () => {
      const inputs: CreateTranscriptSegmentInput[] = [
        {
          meetingId: '550e8400-e29b-41d4-a716-446655440000',
          segmentText: 'First segment',
          startTime: '00:00:00',
          endTime: '00:00:10',
        },
        {
          meetingId: '550e8400-e29b-41d4-a716-446655440000',
          segmentText: 'Second segment',
          startTime: '00:00:10',
          endTime: '00:00:20',
        },
      ];

      mockEmbedder.embed.mockResolvedValue([fakeEmbedding, fakeEmbedding]);
      mockPool.query.mockResolvedValue({
        rows: inputs.map((input, i) => ({
          id: `uuid-${i}`,
          meeting_id: input.meetingId,
          segment_text: input.segmentText,
          start_time: input.startTime,
          end_time: input.endTime,
          speaker_id: null,
          embedding: null,
          created_at: new Date(),
        })),
      });

      const result = await service.storeSegments(inputs);
      expect(result).toHaveLength(2);
      expect(mockEmbedder.embed).toHaveBeenCalledWith(['First segment', 'Second segment']);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.storeSegments([]);
      expect(result).toEqual([]);
    });
  });

  describe('semanticSearch', () => {
    it('should perform similarity search with default options', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'uuid-1',
          meeting_id: 'meeting-1',
          segment_text: 'Roadmap discussion for Q4',
          start_time: '00:05:00',
          end_time: '00:05:30',
          speaker_id: 'speaker-1',
          embedding: null,
          created_at: new Date(),
          similarity: '0.85',
          rank: '1',
        }],
      });

      const results = await service.semanticSearch('Q4 roadmap');
      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBeCloseTo(0.85);
      expect(results[0].rank).toBe(1);
      expect(mockEmbedder.embedSingle).toHaveBeenCalledWith('Q4 roadmap');
    });

    it('should pass meeting ID filters to query', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const options: SemanticSearchOptions = {
        threshold: 0.8,
        limit: 5,
        meetingIds: ['meeting-1', 'meeting-2'],
      };

      await service.semanticSearch('test query', options);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('meeting_id = ANY'),
        expect.arrayContaining([options.meetingIds])
      );
    });

    it('should pass speaker ID filter to query', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.semanticSearch('test query', { speakerId: 'speaker-1' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('speaker_id'),
        expect.arrayContaining(['speaker-1'])
      );
    });
  });

  describe('findSimilarContent', () => {
    it('should find similar segments to a given segment', async () => {
      // First query returns source segment
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'source-id',
            meeting_id: 'meeting-1',
            segment_text: 'Budget allocation for Q4',
            start_time: '00:10:00',
            end_time: '00:10:30',
            speaker_id: null,
            embedding: toPgVector(fakeEmbedding),
            created_at: new Date(),
          }],
        })
        // Second query returns similar segments
        .mockResolvedValueOnce({
          rows: [{
            id: 'similar-id',
            meeting_id: 'meeting-2',
            segment_text: 'Q4 budget review',
            start_time: '00:15:00',
            end_time: '00:15:30',
            speaker_id: null,
            embedding: null,
            created_at: new Date(),
            similarity: '0.82',
            rank: '1',
          }],
        });

      const result = await service.findSimilarContent('source-id');
      expect(result.sourceSegment.id).toBe('source-id');
      expect(result.similarSegments).toHaveLength(1);
      expect(result.similarSegments[0].similarity).toBeCloseTo(0.82);
    });

    it('should throw if segment not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await expect(service.findSimilarContent('nonexistent')).rejects.toThrow('Segment not found');
    });

    it('should throw if segment has no embedding', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'no-embedding',
          meeting_id: 'meeting-1',
          segment_text: 'test',
          start_time: '00:00:00',
          end_time: '00:00:10',
          speaker_id: null,
          embedding: null,
          created_at: new Date(),
        }],
      });
      await expect(service.findSimilarContent('no-embedding')).rejects.toThrow('has no embedding');
    });
  });

  describe('generateMissingEmbeddings', () => {
    it('should generate embeddings for segments without them', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'seg-1', segment_text: 'First text' },
            { id: 'seg-2', segment_text: 'Second text' },
          ],
        })
        .mockResolvedValue({ rows: [] });

      mockEmbedder.embed.mockResolvedValue([fakeEmbedding, fakeEmbedding]);

      const result = await service.generateMissingEmbeddings();
      expect(result.totalSegments).toBe(2);
      expect(result.processedSegments).toBe(2);
      expect(result.failedSegments).toBe(0);
    });

    it('should handle embedding failures gracefully', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'seg-1', segment_text: 'text' }],
      });

      mockEmbedder.embed.mockRejectedValue(new Error('GPU out of memory'));

      const result = await service.generateMissingEmbeddings();
      expect(result.totalSegments).toBe(1);
      expect(result.failedSegments).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('GPU out of memory');
    });
  });

  describe('getMeetingSegments', () => {
    it('should retrieve all segments for a meeting', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'seg-1',
            meeting_id: 'meeting-1',
            segment_text: 'Hello',
            start_time: '00:00:00',
            end_time: '00:00:10',
            speaker_id: null,
            embedding: null,
            created_at: new Date(),
          },
        ],
      });

      const segments = await service.getMeetingSegments('meeting-1');
      expect(segments).toHaveLength(1);
      expect(segments[0].segmentText).toBe('Hello');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE meeting_id'),
        ['meeting-1']
      );
    });
  });

  describe('getSegment', () => {
    it('should return a segment by ID', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'seg-1',
          meeting_id: 'meeting-1',
          segment_text: 'Test',
          start_time: '00:00:00',
          end_time: '00:00:10',
          speaker_id: null,
          embedding: null,
          created_at: new Date(),
        }],
      });

      const segment = await service.getSegment('seg-1');
      expect(segment).not.toBeNull();
      expect(segment!.id).toBe('seg-1');
    });

    it('should return null if segment not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const segment = await service.getSegment('nonexistent');
      expect(segment).toBeNull();
    });
  });

  describe('deleteMeetingSegments', () => {
    it('should delete all segments for a meeting and return count', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 5 });
      const count = await service.deleteMeetingSegments('meeting-1');
      expect(count).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM transcripts'),
        ['meeting-1']
      );
    });
  });

  describe('reembedMeeting', () => {
    it('should regenerate embeddings for all segments in a meeting', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'seg-1', segment_text: 'First' },
            { id: 'seg-2', segment_text: 'Second' },
          ],
        })
        .mockResolvedValue({ rows: [] });

      mockEmbedder.embed.mockResolvedValue([fakeEmbedding, fakeEmbedding]);

      const result = await service.reembedMeeting('meeting-1');
      expect(result.totalSegments).toBe(2);
      expect(result.processedSegments).toBe(2);
      expect(result.failedSegments).toBe(0);
    });
  });
});

describe('standalone embedding functions', () => {
  it('should export generateEmbedding function', () => {
    expect(typeof generateEmbedding).toBe('function');
  });

  it('should export batchGenerateEmbeddings function', () => {
    expect(typeof batchGenerateEmbeddings).toBe('function');
  });
});
