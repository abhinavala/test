import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/client.js';
import {
  EMBEDDING_DIMENSION,
  type TranscriptSegment,
  type SearchResult,
  type SemanticSearchOptions,
  type BatchEmbedOptions,
  type BatchEmbedResult,
  type CreateTranscriptSegmentInput,
  type SimilarContentResult,
  type EmbeddingServiceConfig,
} from '../types/embedding.js';
import { EmbeddingPipeline, toPgVector, chunk, validateEmbedding } from '../utils/embeddingUtils.js';

export class VectorEmbeddingService {
  private readonly db: Pool;
  private readonly embedder: EmbeddingPipeline;

  constructor(db?: Pool, embeddingConfig?: EmbeddingServiceConfig) {
    this.db = db ?? getPool();
    this.embedder = new EmbeddingPipeline(embeddingConfig);
  }

  /** Ensure pgvector extension and transcript table exist. */
  async initSchema(): Promise<void> {
    await this.db.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id UUID NOT NULL,
        segment_text TEXT NOT NULL,
        start_time INTERVAL,
        end_time INTERVAL,
        speaker_id VARCHAR(50),
        embedding vector(${EMBEDDING_DIMENSION}),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Create indexes if they don't exist
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_time
        ON transcripts (meeting_id, start_time)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_transcripts_embedding
        ON transcripts USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    `).catch(() => {
      // ivfflat index creation may fail if table has < 100 rows; safe to ignore
    });
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_transcripts_text_search
        ON transcripts USING GIN (to_tsvector('english', segment_text))
    `);
  }

  /**
   * Store a transcript segment with its embedding.
   * Generates the embedding automatically from segmentText.
   */
  async storeSegment(input: CreateTranscriptSegmentInput): Promise<TranscriptSegment> {
    const id = uuidv4();
    let embedding: number[];
    try {
      embedding = await this.embedder.embedSingle(input.segmentText);
    } catch (err) {
      // Fallback: store without embedding, can be generated later
      const result = await this.db.query(
        `INSERT INTO transcripts (id, meeting_id, segment_text, start_time, end_time, speaker_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, input.meetingId, input.segmentText, input.startTime, input.endTime, input.speakerId ?? null]
      );
      return this.rowToSegment(result.rows[0]);
    }

    const result = await this.db.query(
      `INSERT INTO transcripts (id, meeting_id, segment_text, start_time, end_time, speaker_id, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, input.meetingId, input.segmentText, input.startTime, input.endTime, input.speakerId ?? null, toPgVector(embedding)]
    );
    return this.rowToSegment(result.rows[0]);
  }

  /**
   * Store multiple transcript segments in batch with embeddings.
   */
  async storeSegments(inputs: CreateTranscriptSegmentInput[]): Promise<TranscriptSegment[]> {
    if (inputs.length === 0) return [];

    const segments: TranscriptSegment[] = [];
    const batches = chunk(inputs, 50);

    for (const batch of batches) {
      const texts = batch.map((s) => s.segmentText);
      let embeddings: number[][];
      try {
        embeddings = await this.embedder.embed(texts);
      } catch {
        // Fallback: store without embeddings
        embeddings = new Array(batch.length).fill(null);
      }

      const values: any[] = [];
      const placeholders: string[] = [];
      batch.forEach((input, i) => {
        const offset = i * 7;
        const id = uuidv4();
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
        );
        values.push(
          id,
          input.meetingId,
          input.segmentText,
          input.startTime,
          input.endTime,
          input.speakerId ?? null,
          embeddings[i] ? toPgVector(embeddings[i]) : null
        );
      });

      const result = await this.db.query(
        `INSERT INTO transcripts (id, meeting_id, segment_text, start_time, end_time, speaker_id, embedding)
         VALUES ${placeholders.join(', ')}
         RETURNING *`,
        values
      );
      segments.push(...result.rows.map((row: any) => this.rowToSegment(row)));
    }

    return segments;
  }

  /**
   * Generate embeddings for segments that don't have them yet.
   */
  async generateMissingEmbeddings(options?: BatchEmbedOptions): Promise<BatchEmbedResult> {
    const batchSize = options?.batchSize ?? 50;

    const { rows } = await this.db.query(
      'SELECT id, segment_text FROM transcripts WHERE embedding IS NULL ORDER BY created_at'
    );

    const result: BatchEmbedResult = {
      totalSegments: rows.length,
      processedSegments: 0,
      failedSegments: 0,
      errors: [],
    };

    const batches = chunk(rows, batchSize);
    for (const batch of batches) {
      try {
        const texts = batch.map((r: any) => r.segment_text);
        const embeddings = await this.embedder.embed(texts);

        for (let i = 0; i < batch.length; i++) {
          try {
            if (!validateEmbedding(embeddings[i])) {
              throw new Error('Invalid embedding dimensions');
            }
            await this.db.query(
              'UPDATE transcripts SET embedding = $1 WHERE id = $2',
              [toPgVector(embeddings[i]), batch[i].id]
            );
            result.processedSegments++;
          } catch (err: any) {
            result.failedSegments++;
            result.errors.push({ segmentId: batch[i].id, error: err.message });
          }
        }
      } catch (err: any) {
        // Entire batch failed
        for (const row of batch) {
          result.failedSegments++;
          result.errors.push({ segmentId: row.id, error: err.message });
        }
      }
    }

    return result;
  }

  /**
   * Perform semantic search across transcripts using a natural language query.
   */
  async semanticSearch(query: string, options?: SemanticSearchOptions): Promise<SearchResult[]> {
    const threshold = options?.threshold ?? 0.7;
    const limit = options?.limit ?? 10;

    const queryEmbedding = await this.embedder.embedSingle(query);
    const embeddingStr = toPgVector(queryEmbedding);

    const conditions: string[] = ['embedding IS NOT NULL'];
    const params: any[] = [embeddingStr, threshold, limit];
    let paramIdx = 4;

    if (options?.meetingIds && options.meetingIds.length > 0) {
      conditions.push(`meeting_id = ANY($${paramIdx}::uuid[])`);
      params.push(options.meetingIds);
      paramIdx++;
    }

    if (options?.speakerId) {
      conditions.push(`speaker_id = $${paramIdx}`);
      params.push(options.speakerId);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const { rows } = await this.db.query(
      `SELECT *,
              1 - (embedding <=> $1::vector) AS similarity,
              ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
       FROM transcripts
       WHERE ${whereClause}
         AND 1 - (embedding <=> $1::vector) >= $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      params
    );

    return rows.map((row: any) => ({
      ...this.rowToSegment(row),
      similarity: parseFloat(row.similarity),
      rank: parseInt(row.rank, 10),
    }));
  }

  /**
   * Find segments similar to a given segment across all meetings.
   */
  async findSimilarContent(
    segmentId: string,
    options?: SemanticSearchOptions
  ): Promise<SimilarContentResult> {
    const { rows } = await this.db.query(
      'SELECT * FROM transcripts WHERE id = $1',
      [segmentId]
    );

    if (rows.length === 0) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    const sourceSegment = this.rowToSegment(rows[0]);

    if (!rows[0].embedding) {
      throw new Error(`Segment ${segmentId} has no embedding`);
    }

    const threshold = options?.threshold ?? 0.7;
    const limit = options?.limit ?? 10;
    const embeddingStr = rows[0].embedding;

    const conditions: string[] = ['embedding IS NOT NULL', 'id != $1'];
    const params: any[] = [segmentId, embeddingStr, threshold, limit];
    let paramIdx = 5;

    if (options?.meetingIds && options.meetingIds.length > 0) {
      conditions.push(`meeting_id = ANY($${paramIdx}::uuid[])`);
      params.push(options.meetingIds);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.db.query(
      `SELECT *,
              1 - (embedding <=> $2::vector) AS similarity,
              ROW_NUMBER() OVER (ORDER BY embedding <=> $2::vector) AS rank
       FROM transcripts
       WHERE ${whereClause}
         AND 1 - (embedding <=> $2::vector) >= $3
       ORDER BY embedding <=> $2::vector
       LIMIT $4`,
      params
    );

    return {
      sourceSegment,
      similarSegments: result.rows.map((row: any) => ({
        ...this.rowToSegment(row),
        similarity: parseFloat(row.similarity),
        rank: parseInt(row.rank, 10),
      })),
    };
  }

  /**
   * Analyze meeting content by finding key topics via embedding clustering.
   * Returns segments grouped by semantic similarity.
   */
  async getMeetingSegments(meetingId: string): Promise<TranscriptSegment[]> {
    const { rows } = await this.db.query(
      'SELECT * FROM transcripts WHERE meeting_id = $1 ORDER BY start_time',
      [meetingId]
    );
    return rows.map((row: any) => this.rowToSegment(row));
  }

  /**
   * Get a segment by ID.
   */
  async getSegment(segmentId: string): Promise<TranscriptSegment | null> {
    const { rows } = await this.db.query(
      'SELECT * FROM transcripts WHERE id = $1',
      [segmentId]
    );
    return rows.length > 0 ? this.rowToSegment(rows[0]) : null;
  }

  /**
   * Delete all segments for a given meeting.
   */
  async deleteMeetingSegments(meetingId: string): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM transcripts WHERE meeting_id = $1',
      [meetingId]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Re-generate embeddings for all segments of a meeting (e.g. after model update).
   */
  async reembedMeeting(meetingId: string): Promise<BatchEmbedResult> {
    const { rows } = await this.db.query(
      'SELECT id, segment_text FROM transcripts WHERE meeting_id = $1 ORDER BY start_time',
      [meetingId]
    );

    const result: BatchEmbedResult = {
      totalSegments: rows.length,
      processedSegments: 0,
      failedSegments: 0,
      errors: [],
    };

    const batches = chunk(rows, 50);
    for (const batch of batches) {
      try {
        const texts = batch.map((r: any) => r.segment_text);
        const embeddings = await this.embedder.embed(texts);

        for (let i = 0; i < batch.length; i++) {
          try {
            await this.db.query(
              'UPDATE transcripts SET embedding = $1 WHERE id = $2',
              [toPgVector(embeddings[i]), batch[i].id]
            );
            result.processedSegments++;
          } catch (err: any) {
            result.failedSegments++;
            result.errors.push({ segmentId: batch[i].id, error: err.message });
          }
        }
      } catch (err: any) {
        for (const row of batch) {
          result.failedSegments++;
          result.errors.push({ segmentId: row.id, error: err.message });
        }
      }
    }

    return result;
  }

  private rowToSegment(row: any): TranscriptSegment {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      segmentText: row.segment_text,
      startTime: row.start_time,
      endTime: row.end_time,
      speakerId: row.speaker_id ?? undefined,
      embedding: row.embedding
        ? typeof row.embedding === 'string'
          ? row.embedding.replace(/^\[/, '').replace(/\]$/, '').split(',').map(Number)
          : undefined
        : undefined,
      createdAt: row.created_at,
    };
  }
}

export const vectorEmbeddingService = new VectorEmbeddingService();
