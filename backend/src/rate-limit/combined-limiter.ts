export interface TokenBucketConfig {
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
}

export interface SlidingWindowConfig {
  windowSizeMs: number;
  maxRequests: number;
}

export const DEFAULT_TOKEN_BUCKET_CONFIG: TokenBucketConfig = {
  capacity: 200,
  refillRate: 50,
  refillIntervalMs: 1000,
};

export const DEFAULT_SLIDING_WINDOW_CONFIG: SlidingWindowConfig = {
  windowSizeMs: 10000,
  maxRequests: 500,
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remainingTokens: number;
  windowRequestCount: number;
  reason?: string;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private config: TokenBucketConfig;

  constructor(config: Partial<TokenBucketConfig> = {}) {
    this.config = { ...DEFAULT_TOKEN_BUCKET_CONFIG, ...config };
    this.tokens = this.config.capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): RateLimitResult {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        allowed: true,
        retryAfterMs: 0,
        remainingTokens: this.tokens,
        windowRequestCount: 0,
      };
    }

    const timeToNextToken =
      this.config.refillIntervalMs / this.config.refillRate;

    return {
      allowed: false,
      retryAfterMs: Math.ceil(timeToNextToken * (tokens - this.tokens)),
      remainingTokens: this.tokens,
      windowRequestCount: 0,
      reason: 'token_bucket_exhausted',
    };
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.config.refillIntervalMs) {
      const refillCycles = Math.floor(elapsed / this.config.refillIntervalMs);
      const tokensToAdd = refillCycles * this.config.refillRate;
      this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now - (elapsed % this.config.refillIntervalMs);
    }
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  reset() {
    this.tokens = this.config.capacity;
    this.lastRefill = Date.now();
  }
}

class SlidingWindowLog {
  private timestamps: number[] = [];
  private config: SlidingWindowConfig;

  constructor(config: Partial<SlidingWindowConfig> = {}) {
    this.config = { ...DEFAULT_SLIDING_WINDOW_CONFIG, ...config };
  }

  tryAdd(): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowSizeMs;

    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length < this.config.maxRequests) {
      this.timestamps.push(now);
      return {
        allowed: true,
        retryAfterMs: 0,
        remainingTokens: 0,
        windowRequestCount: this.timestamps.length,
      };
    }

    const oldestInWindow = this.timestamps[0];
    const retryAfterMs = Math.ceil(
      oldestInWindow + this.config.windowSizeMs - now
    );

    return {
      allowed: false,
      retryAfterMs,
      remainingTokens: 0,
      windowRequestCount: this.timestamps.length,
      reason: 'sliding_window_exceeded',
    };
  }

  getCount(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowSizeMs;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);
    return this.timestamps.length;
  }

  reset() {
    this.timestamps = [];
  }
}

export class CombinedRateLimiter {
  private tokenBucket: TokenBucket;
  private slidingWindow: SlidingWindowLog;
  private stats = {
    totalRequests: 0,
    rejectedRequests: 0,
    lastReset: Date.now(),
  };

  constructor(
    tokenBucketConfig?: Partial<TokenBucketConfig>,
    slidingWindowConfig?: Partial<SlidingWindowConfig>
  ) {
    this.tokenBucket = new TokenBucket(tokenBucketConfig);
    this.slidingWindow = new SlidingWindowLog(slidingWindowConfig);
  }

  tryAcquire(): RateLimitResult {
    this.stats.totalRequests++;

    const windowResult = this.slidingWindow.tryAdd();
    if (!windowResult.allowed) {
      this.stats.rejectedRequests++;
      return {
        ...windowResult,
        remainingTokens: this.tokenBucket.getTokens(),
      };
    }

    const bucketResult = this.tokenBucket.tryConsume(1);
    if (!bucketResult.allowed) {
      this.stats.rejectedRequests++;
      return {
        ...bucketResult,
        windowRequestCount: windowResult.windowRequestCount,
      };
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      remainingTokens: bucketResult.remainingTokens,
      windowRequestCount: windowResult.windowRequestCount,
    };
  }

  getStats() {
    return {
      ...this.stats,
      windowCount: this.slidingWindow.getCount(),
      remainingTokens: this.tokenBucket.getTokens(),
      elapsedSinceReset: Date.now() - this.stats.lastReset,
    };
  }

  reset() {
    this.tokenBucket.reset();
    this.slidingWindow.reset();
    this.stats = {
      totalRequests: 0,
      rejectedRequests: 0,
      lastReset: Date.now(),
    };
  }
}
