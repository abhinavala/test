import { EventEmitter } from 'events';
import {
  QueueItem,
  QueueConfig,
  BackpressureLevel,
  DEFAULT_QUEUE_CONFIG,
} from '../types/pipeline';

export class ProcessingQueue<T = unknown> extends EventEmitter {
  private items: QueueItem<T>[] = [];
  private processing = new Set<string>();
  private readonly config: QueueConfig;
  private readonly name: string;

  constructor(name: string, config: Partial<QueueConfig> = {}) {
    super();
    this.name = name;
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  enqueue(item: QueueItem<T>): boolean {
    const backpressure = this.getBackpressureLevel();
    if (backpressure === 'critical') {
      this.emit('backpressure', { level: 'critical', queueName: this.name, size: this.items.length });
      return false;
    }

    this.items.push(item);
    this.items.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);

    if (backpressure === 'warning') {
      this.emit('backpressure', { level: 'warning', queueName: this.name, size: this.items.length });
    }

    this.emit('enqueued', { itemId: item.id, queueName: this.name });
    return true;
  }

  dequeue(): QueueItem<T> | undefined {
    if (this.items.length === 0) return undefined;
    if (this.processing.size >= this.config.processingConcurrency) return undefined;

    const item = this.items.shift();
    if (item) {
      this.processing.add(item.id);
      this.emit('dequeued', { itemId: item.id, queueName: this.name });
    }
    return item;
  }

  complete(itemId: string): void {
    this.processing.delete(itemId);
    this.emit('completed', { itemId, queueName: this.name });
  }

  fail(itemId: string, item: QueueItem<T>): boolean {
    this.processing.delete(itemId);

    if (item.retryCount < item.maxRetries) {
      const retryItem: QueueItem<T> = {
        ...item,
        retryCount: item.retryCount + 1,
        priority: Math.min(item.priority + 1, 3), // lower priority on retry
      };
      this.items.push(retryItem);
      this.items.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
      this.emit('retry', { itemId, retryCount: retryItem.retryCount, queueName: this.name });
      return true;
    }

    this.emit('failed', { itemId, queueName: this.name });
    return false;
  }

  getBackpressureLevel(): BackpressureLevel {
    const size = this.items.length;
    if (size >= this.config.maxSize) return 'critical';
    if (size >= this.config.warningThreshold) return 'warning';
    return 'normal';
  }

  getSize(): number {
    return this.items.length;
  }

  getProcessingCount(): number {
    return this.processing.size;
  }

  getTotalCount(): number {
    return this.items.length + this.processing.size;
  }

  getConfig(): Readonly<QueueConfig> {
    return this.config;
  }

  getName(): string {
    return this.name;
  }

  clear(): void {
    this.items = [];
    this.processing.clear();
    this.emit('cleared', { queueName: this.name });
  }

  clearSession(sessionId: string): number {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.sessionId !== sessionId);
    const removed = before - this.items.length;
    if (removed > 0) {
      this.emit('sessionCleared', { sessionId, removed, queueName: this.name });
    }
    return removed;
  }

  hasCapacity(): boolean {
    return (
      this.items.length < this.config.maxSize &&
      this.processing.size < this.config.processingConcurrency
    );
  }

  peek(): QueueItem<T> | undefined {
    return this.items[0];
  }

  getStats(): {
    name: string;
    queued: number;
    processing: number;
    total: number;
    backpressure: BackpressureLevel;
    maxSize: number;
    concurrency: number;
  } {
    return {
      name: this.name,
      queued: this.items.length,
      processing: this.processing.size,
      total: this.getTotalCount(),
      backpressure: this.getBackpressureLevel(),
      maxSize: this.config.maxSize,
      concurrency: this.config.processingConcurrency,
    };
  }
}
