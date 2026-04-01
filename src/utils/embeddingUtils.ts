import type { EmbeddingServiceConfig } from '../types/embedding.js';
import { EMBEDDING_DIMENSION } from '../types/embedding.js';

/**
 * Singleton wrapper around @xenova/transformers pipeline for generating
 * text embeddings using sentence-transformer models.
 */
export class EmbeddingPipeline {
  private pipeline: any = null;
  private initPromise: Promise<void> | null = null;
  private readonly config: Required<EmbeddingServiceConfig>;

  constructor(config?: EmbeddingServiceConfig) {
    this.config = {
      modelName: config?.modelName ?? 'Xenova/all-MiniLM-L6-v2',
      quantized: config?.quantized ?? true,
      modelPath: config?.modelPath ?? './models/',
    };
  }

  /** Initialize the transformer pipeline. Safe to call multiple times. */
  async init(): Promise<void> {
    if (this.pipeline) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowRemoteModels = true;
      env.localModelPath = this.config.modelPath;

      this.pipeline = await pipeline('feature-extraction', this.config.modelName, {
        quantized: this.config.quantized,
      });
    })();

    return this.initPromise;
  }

  /** Generate embeddings for one or more texts. Returns array of float arrays. */
  async embed(texts: string[]): Promise<number[][]> {
    await this.init();
    const output = await this.pipeline(texts, {
      pooling: 'mean',
      normalize: true,
    });
    return output.tolist() as number[][];
  }

  /** Generate embedding for a single text string. */
  async embedSingle(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text]);
    return embedding;
  }
}

/**
 * Format an embedding vector into pgvector's literal format: '[0.1,0.2,...]'
 */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse a pgvector string back into a number array.
 */
export function fromPgVector(pgVector: string): number[] {
  return pgVector
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map(Number);
}

/**
 * Split an array into chunks of a given size for batch processing.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Validate that an embedding has the expected dimension.
 */
export function validateEmbedding(
  embedding: number[],
  expectedDimension: number = EMBEDDING_DIMENSION
): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === expectedDimension &&
    embedding.every((v) => typeof v === 'number' && isFinite(v))
  );
}

/**
 * Compute cosine similarity between two vectors (for testing/validation).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
