/**
 * Reusable, namespaced key-value store shared by every stateful service
 * that needs to work correctly across multiple backend instances:
 * cache.service.ts, retrieval-cache.service.ts, and token.service.ts.
 *
 * Uses Redis when REDIS_URL is configured — so state is shared across
 * instances instead of trapped in one process's memory, the actual gap
 * this fixes. Falls back to an in-memory Map when REDIS_URL is unset, so
 * local dev without Docker/Redis running still works exactly as before.
 *
 * Redis operations fail soft, not hard: a GET failure is treated as a
 * cache miss, a SET failure is a skipped (best-effort) write — matching
 * the graceful-degradation pattern used everywhere else in this pipeline
 * (Tavily, Groq timeouts) rather than crashing a request over infra being
 * temporarily unreachable.
 */
import Redis from "ioredis";

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  size(): Promise<number>;
}

class RedisKVStore implements KVStore {
  constructor(
    private client: Redis,
    private namespace: string
  ) {}

  private k(key: string): string {
    return `${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(this.k(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      console.warn(
        `⚠️ Redis GET failed for ${this.k(key)}, treating as miss:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(this.k(key), raw, "EX", ttlSeconds);
      } else {
        await this.client.set(this.k(key), raw);
      }
    } catch (err) {
      console.warn(
        `⚠️ Redis SET failed for ${this.k(key)}, write skipped:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(this.k(key));
    } catch {
      // best-effort
    }
  }

  async size(): Promise<number> {
    try {
      const keys = await this.client.keys(`${this.namespace}:*`);
      return keys.length;
    } catch {
      return -1;
    }
  }
}

class MemoryKVStore implements KVStore {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  constructor() {
    // Same hourly-sweep hygiene the original in-memory cache.service.ts had —
    // lazy expiry-on-read alone works correctly, this just reclaims memory
    // from entries that are never read again after expiring.
    setInterval(() => this.prune(), 60 * 60 * 1000);
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) this.store.delete(key);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async size(): Promise<number> {
    return this.store.size;
  }
}

let redisClient: Redis | null = null;

/** The raw shared Redis client, if configured — used directly by the rate limiter's store adapter. */
export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!redisClient) {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    redisClient.on("error", (err) => {
      console.warn("⚠️ Redis connection error:", err.message);
    });
    redisClient.on("ready", () => {
      console.log("✅ Redis connected — cache/tokens/rate-limit now shared across instances");
    });
  }
  return redisClient;
}

/** Creates a namespaced store — Redis-backed if REDIS_URL is set, in-memory otherwise. */
export function createKVStore(namespace: string): KVStore {
  const client = getRedisClient();
  return client ? new RedisKVStore(client, namespace) : new MemoryKVStore();
}
