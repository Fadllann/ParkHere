/**
 * Unified API Cache System
 * Prevents rate limiting with:
 * - TTL-based expiration
 * - In-flight request deduplication
 * - Minimum refetch intervals
 */

const CACHE_CONFIG = {
  dashboard: { ttl: 30 * 1000, minRefetch: 2 * 1000 },           // 30s with 2s min
  activeTickets: { ttl: 20 * 1000, minRefetch: 2 * 1000 },       // 20s with 2s min
  transactions: { ttl: 30 * 1000, minRefetch: 2 * 1000 },        // 30s with 2s min
  rates: { ttl: 5 * 60 * 1000, minRefetch: 3 * 1000 },           // 5min with 3s min
  users: { ttl: 5 * 60 * 1000, minRefetch: 3 * 1000 },           // 5min with 3s min
  settings: { ttl: 5 * 60 * 1000, minRefetch: 3 * 1000 },        // 5min with 3s min
  backupStatus: { ttl: 2 * 60 * 1000, minRefetch: 3 * 1000 },    // 2min with 3s min
  regulations: { ttl: 5 * 60 * 1000, minRefetch: 3 * 1000 },     // 5min with 3s min
  lostTickets: { ttl: 30 * 1000, minRefetch: 2 * 1000 },         // 30s with 2s min
};

class APICache {
  constructor() {
    this._cache = {};
    this._inflight = {};
    this._lastFetch = {};

    // Initialize cache entries
    Object.keys(CACHE_CONFIG).forEach((key) => {
      this._cache[key] = { data: null, timestamp: 0 };
      this._inflight[key] = null;
      this._lastFetch[key] = 0;
    });
  }

  /**
   * Get cached data or fetch new
   * @param {string} cacheKey - Cache identifier
   * @param {Function} fetcher - Async function that returns data
   * @param {boolean} force - Force refresh ignoring TTL
   * @returns {Promise<{ data, fromCache: boolean }>}
   */
  async get(cacheKey, fetcher, force = false) {
    // Get config for this key, or use default for dynamic keys
    let config = CACHE_CONFIG[cacheKey];
    if (!config) {
      // For dynamic keys (like transactions_1_all), use default TTL
      config = { ttl: 30 * 1000, minRefetch: 2 * 1000 };
      // Initialize cache entry if it doesn't exist
      if (!this._cache[cacheKey]) {
        this._cache[cacheKey] = { data: null, timestamp: 0 };
        this._inflight[cacheKey] = null;
        this._lastFetch[cacheKey] = 0;
      }
    }

    const entry = this._cache[cacheKey];
    const now = Date.now();
    const isFresh = entry.data !== null && now - entry.timestamp < config.ttl;
    const rateLimited = now - this._lastFetch[cacheKey] < config.minRefetch;

    // Return cached data if fresh
    if (!force && isFresh) {
      return { data: entry.data, fromCache: true };
    }

    // Return stale cache if rate limited
    if (!force && rateLimited && entry.data !== null) {
      return { data: entry.data, fromCache: true };
    }

    // Return existing in-flight promise to deduplicate requests
    if (this._inflight[cacheKey]) {
      return this._inflight[cacheKey];
    }

    // Fetch new data
    this._lastFetch[cacheKey] = now;
    this._inflight[cacheKey] = fetcher()
      .then((data) => {
        this._cache[cacheKey] = { data, timestamp: Date.now() };
        this._inflight[cacheKey] = null;
        return { data, fromCache: false };
      })
      .catch((err) => {
        this._inflight[cacheKey] = null;
        throw err;
      });

    return this._inflight[cacheKey];
  }

  /**
   * Invalidate specific cache or multiple caches
   */
  invalidate(...cacheKeys) {
    cacheKeys.forEach((key) => {
      if (this._cache[key]) {
        this._cache[key] = { data: null, timestamp: 0 };
      }
    });
  }

  /**
   * Clear all caches
   */
  clear() {
    Object.keys(this._cache).forEach((key) => {
      this._cache[key] = { data: null, timestamp: 0 };
      this._lastFetch[key] = 0;
    });
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    return Object.entries(this._cache).map(([key, entry]) => ({
      key,
      cached: entry.data !== null,
      age: entry.data ? Date.now() - entry.timestamp : -1,
      ttl: CACHE_CONFIG[key]?.ttl,
    }));
  }
}

// Singleton instance
export const apiCache = new APICache();

// Convenience methods
export async function getCacheData(cacheKey, fetcher, force = false) {
  return apiCache.get(cacheKey, fetcher, force);
}

export function invalidateCache(...keys) {
  apiCache.invalidate(...keys);
}

export function clearAllCache() {
  apiCache.clear();
}

export function getCacheStats() {
  return apiCache.getStats();
}