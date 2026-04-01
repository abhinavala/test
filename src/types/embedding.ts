/** Dimension count for the all-MiniLM-L6-v2 model */
export const EMBEDDING_DIMENSION = 384;

/** A single transcript segment with optional embedding */
export interface TranscriptSegment {
  id: string;
  meetingId: string;
  segmentText: string;
  startTime: string;
  endTime: string;
  speakerId?: string;
  embedding?: number[];
  createdAt?: Date;
}

/** A transcript segment enriched with similarity score from a search */
export interface SearchResult extends TranscriptSegment {
  similarity: number;
  rank: number;
}

/** Options for semantic search queries */
export interface SemanticSearchOptions {
  /** Minimum cosine similarity threshold (0-1). Default: 0.7 */
  threshold?: number;
  /** Maximum number of results to return. Default: 10 */
  limit?: number;
  /** Restrict search to specific meeting IDs */
  meetingIds?: string[];
  /** Restrict search to a specific speaker */
  speakerId?: string;
}

/** Options for batch embedding generation */
export interface BatchEmbedOptions {
  /** Number of segments to process per batch. Default: 50 */
  batchSize?: number;
  /** Whether to skip segments that already have embeddings. Default: true */
  skipExisting?: boolean;
}

/** Result of a batch embedding operation */
export interface BatchEmbedResult {
  totalSegments: number;
  processedSegments: number;
  failedSegments: number;
  errors: Array<{ segmentId: string; error: string }>;
}

/** Configuration for the embedding service */
export interface EmbeddingServiceConfig {
  /** Model name for @xenova/transformers. Default: 'Xenova/all-MiniLM-L6-v2' */
  modelName?: string;
  /** Whether to use quantized model for faster inference. Default: true */
  quantized?: boolean;
  /** Local path for model files. Default: './models/' */
  modelPath?: string;
}

/** Input for storing a new transcript segment */
export interface CreateTranscriptSegmentInput {
  meetingId: string;
  segmentText: string;
  startTime: string;
  endTime: string;
  speakerId?: string;
}

/** Result from finding similar segments across meetings */
export interface SimilarContentResult {
  sourceSegment: TranscriptSegment;
  similarSegments: SearchResult[];
}
