export interface BackoffOptions {
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitterFactor: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTime: number;
}

export const DEFAULT_BACKOFF_OPTIONS: BackoffOptions = {
  initialDelay: 1000,
  maxDelay: 60000,
  multiplier: 2,
  jitterFactor: 0.5,
  maxRetries: 30,
  circuitBreakerThreshold: 10,
  circuitBreakerResetTime: 300000,
};

export enum BackoffState {
  IDLE = 'idle',
  RETRYING = 'retrying',
  CIRCUIT_OPEN = 'circuit_open',
}

export class ExponentialBackoffWithJitter {
  private options: BackoffOptions;
  private retryCount = 0;
  private consecutiveFailures = 0;
  private state: BackoffState = BackoffState.IDLE;
  private currentDelay = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private circuitOpenSince = 0;

  private onRetryCallback: (attempt: number, delay: number) => void;
  private onResetCallback: () => void;
  private onCircuitOpenCallback: () => void;
  private onCircuitCloseCallback: () => void;

  constructor(options: Partial<BackoffOptions> = {}) {
    this.options = { ...DEFAULT_BACKOFF_OPTIONS, ...options };
  }

  onRetry(callback: (attempt: number, delay: number) => void): this {
    this.onRetryCallback = callback;
    return this;
  }

  onReset(callback: () => void): this {
    this.onResetCallback = callback;
    return this;
  }

  onCircuitOpen(callback: () => void): this {
    this.onCircuitOpenCallback = callback;
    return this;
  }

  onCircuitClose(callback: () => void): this {
    this.onCircuitCloseCallback = callback;
    return this;
  }

  scheduleNextRetry(): number | null {
    if (this.state === BackoffState.CIRCUIT_OPEN) {
      if (Date.now() - this.circuitOpenSince > this.options.circuitBreakerResetTime) {
        this.closeCircuit();
      } else {
        return null;
      }
    }

    if (this.retryCount >= this.options.maxRetries) {
      this.openCircuit();
      return null;
    }

    if (this.consecutiveFailures >= this.options.circuitBreakerThreshold) {
      this.openCircuit();
      return null;
    }

    this.state = BackoffState.RETRYING;

    const baseDelay = Math.min(
      this.options.initialDelay * Math.pow(this.options.multiplier, this.retryCount),
      this.options.maxDelay
    );

    const jitterRange = baseDelay * this.options.jitterFactor;
    const jitter = (Math.random() - 0.5) * jitterRange;
    this.currentDelay = Math.max(this.options.initialDelay, Math.round(baseDelay + jitter));

    this.retryCount++;
    this.consecutiveFailures++;

    if (this.onRetryCallback) {
      this.onRetryCallback(this.retryCount, this.currentDelay);
    }

    return this.currentDelay;
  }

  executeAfterDelay(fn: () => void): boolean {
    const delay = this.scheduleNextRetry();
    if (delay === null) {
      return false;
    }

    this.cancelPending();
    this.timerId = setTimeout(() => {
      fn();
    }, delay);

    return true;
  }

  reset(): void {
    this.retryCount = 0;
    this.consecutiveFailures = 0;
    this.state = BackoffState.IDLE;
    this.currentDelay = 0;
    this.cancelPending();

    if (this.onResetCallback) {
      this.onResetCallback();
    }
  }

  success(): void {
    this.reset();
  }

  failure(): void {
    this.consecutiveFailures = Math.min(
      this.consecutiveFailures + 1,
      this.options.circuitBreakerThreshold + 1
    );
  }

  private openCircuit(): void {
    if (this.state === BackoffState.CIRCUIT_OPEN) return;

    this.state = BackoffState.CIRCUIT_OPEN;
    this.circuitOpenSince = Date.now();
    this.cancelPending();

    if (this.onCircuitOpenCallback) {
      this.onCircuitOpenCallback();
    }
  }

  private closeCircuit(): void {
    this.state = BackoffState.IDLE;
    this.retryCount = 0;
    this.consecutiveFailures = Math.floor(this.options.circuitBreakerThreshold / 2);

    if (this.onCircuitCloseCallback) {
      this.onCircuitCloseCallback();
    }
  }

  cancelPending(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  getState(): BackoffState {
    if (this.state === BackoffState.CIRCUIT_OPEN) {
      if (Date.now() - this.circuitOpenSince > this.options.circuitBreakerResetTime) {
        this.closeCircuit();
      }
    }
    return this.state;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  getCurrentDelay(): number {
    return this.currentDelay;
  }

  getCircuitRemainingTime(): number {
    if (this.state !== BackoffState.CIRCUIT_OPEN) return 0;
    const elapsed = Date.now() - this.circuitOpenSince;
    return Math.max(0, this.options.circuitBreakerResetTime - elapsed);
  }

  dispose(): void {
    this.cancelPending();
  }
}
