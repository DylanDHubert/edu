import crypto from 'crypto';
import { ExperimentResult } from './chunks-experiment-service';

interface CachedExperiment {
  result: ExperimentResult;
  createdAt: number;
  lastAccessed: number;
}

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  oldestEntry?: string;
  newestEntry?: string;
  memoryUsage: string;
}

export class ExperimentCacheService {
  private cache = new Map<string, CachedExperiment>();
  private maxSize = 100;
  private ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private hitCount = 0;
  private missCount = 0;

  generateKey(assistantId: string, query: string): string {
    const hash = crypto.createHash('md5').update(query).digest('hex');
    return `${assistantId}:${hash}`;
  }

  async get(assistantId: string, query: string): Promise<ExperimentResult | null> {
    const key = this.generateKey(assistantId, query);
    const cached = this.cache.get(key);

    if (!cached) {
      this.missCount++;
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - cached.createdAt > this.ttl) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    // Update last accessed for LRU
    cached.lastAccessed = now;
    this.cache.set(key, cached);
    this.hitCount++;

    console.log(`📋 Cache hit for experiment: ${assistantId} (${this.hitCount} hits, ${this.missCount} misses)`);
    return cached.result;
  }

  async set(assistantId: string, query: string, result: ExperimentResult): Promise<void> {
    const key = this.generateKey(assistantId, query);
    const now = Date.now();

    // Evict old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      result,
      createdAt: now,
      lastAccessed: now
    });

    console.log(`💾 Cached experiment result: ${assistantId} (cache size: ${this.cache.size})`);
  }

  async clear(): Promise<void> {
    const size = this.cache.size;
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    console.log(`🧹 Cleared experiment cache (${size} entries removed)`);
  }

  async getStats(): Promise<CacheStats> {
    const entries = Array.from(this.cache.entries());
    const memoryUsage = this.estimateMemoryUsage();

    let oldestEntry: string | undefined;
    let newestEntry: string | undefined;

    if (entries.length > 0) {
      // Sort by creation time
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
      oldestEntry = entries[0][0];
      newestEntry = entries[entries.length - 1][0];
    }

    return {
      totalEntries: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      oldestEntry,
      newestEntry,
      memoryUsage
    };
  }

  private evictOldest(): void {
    if (this.cache.size === 0) return;

    // Find the least recently accessed entry
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`🗑️  Evicted oldest cache entry: ${oldestKey}`);
    }
  }

  private estimateMemoryUsage(): string {
    let totalSize = 0;

    for (const cached of this.cache.values()) {
      // Rough estimation of memory usage
      totalSize += JSON.stringify(cached.result).length;
      totalSize += 100; // Overhead for timestamps and metadata
    }

    if (totalSize < 1024) {
      return `${totalSize} bytes`;
    } else if (totalSize < 1024 * 1024) {
      return `${Math.round(totalSize / 1024)} KB`;
    } else {
      return `${Math.round(totalSize / (1024 * 1024))} MB`;
    }
  }

  // Force evict expired entries
  async cleanup(): Promise<number> {
    const now = Date.now();
    let evictedCount = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.createdAt > this.ttl) {
        this.cache.delete(key);
        evictedCount++;
      }
    }

    if (evictedCount > 0) {
      console.log(`🧹 Cleaned up ${evictedCount} expired cache entries`);
    }

    return evictedCount;
  }
}

// Singleton instance
export const experimentCache = new ExperimentCacheService();
