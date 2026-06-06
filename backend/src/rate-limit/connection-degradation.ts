import { CombinedRateLimiter } from './combined-limiter';
import { SystemLoadMonitor, LoadLevel, SystemLoad } from './system-load-monitor';

export interface HandshakeDecision {
  allowed: boolean;
  retryAfterMs: number;
  delayMs: number;
  reason?: string;
  loadLevel?: LoadLevel;
  degradedMode: boolean;
}

export interface DegradationConfig {
  warningDelayMs: number;
  criticalDelayMs: number;
  warningMaxConcurrent: number;
  criticalMaxConcurrent: number;
  enableJitter: boolean;
  jitterFactor: number;
}

const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  warningDelayMs: 2000,
  criticalDelayMs: 8000,
  warningMaxConcurrent: 20,
  criticalMaxConcurrent: 5,
  enableJitter: true,
  jitterFactor: 0.3,
};

export class ConnectionDegradationManager {
  private rateLimiter: CombinedRateLimiter;
  private loadMonitor: SystemLoadMonitor;
  private config: DegradationConfig;
  private pendingHandshakes = 0;
  private totalHandled = 0;
  private totalRejected = 0;
  private totalDelayed = 0;

  constructor(
    rateLimiter: CombinedRateLimiter,
    loadMonitor: SystemLoadMonitor,
    config: Partial<DegradationConfig> = {}
  ) {
    this.rateLimiter = rateLimiter;
    this.loadMonitor = loadMonitor;
    this.config = { ...DEFAULT_DEGRADATION_CONFIG, ...config };
  }

  evaluateHandshake(clientIp: string): HandshakeDecision {
    this.totalHandled++;

    const rateLimitResult = this.rateLimiter.tryAcquire();
    if (!rateLimitResult.allowed) {
      this.totalRejected++;
      return {
        allowed: false,
        retryAfterMs: rateLimitResult.retryAfterMs,
        delayMs: 0,
        reason: rateLimitResult.reason || 'rate_limited',
        degradedMode: true,
      };
    }

    const loadLevel = this.loadMonitor.getLoadLevel();
    const load = this.loadMonitor.getCurrentLoad();

    switch (loadLevel) {
      case LoadLevel.CRITICAL:
        return this.handleCriticalLoad(load);
      case LoadLevel.WARNING:
        return this.handleWarningLoad(load);
      default:
        return this.handleNormalLoad(load);
    }
  }

  private handleNormalLoad(load: SystemLoad | null): HandshakeDecision {
    return {
      allowed: true,
      retryAfterMs: 0,
      delayMs: 0,
      loadLevel: LoadLevel.NORMAL,
      degradedMode: false,
    };
  }

  private handleWarningLoad(load: SystemLoad | null): HandshakeDecision {
    if (this.pendingHandshakes >= this.config.warningMaxConcurrent) {
      this.totalRejected++;
      return {
        allowed: false,
        retryAfterMs: this.config.warningDelayMs,
        delayMs: 0,
        reason: 'too_many_pending_handshakes',
        loadLevel: LoadLevel.WARNING,
        degradedMode: true,
      };
    }

    const delay = this.applyJitter(this.config.warningDelayMs * 0.3);
    this.totalDelayed++;
    this.pendingHandshakes++;

    setTimeout(() => {
      this.pendingHandshakes = Math.max(0, this.pendingHandshakes - 1);
    }, delay);

    return {
      allowed: true,
      retryAfterMs: 0,
      delayMs: delay,
      reason: 'load_warning',
      loadLevel: LoadLevel.WARNING,
      degradedMode: true,
    };
  }

  private handleCriticalLoad(load: SystemLoad | null): HandshakeDecision {
    if (this.pendingHandshakes >= this.config.criticalMaxConcurrent) {
      this.totalRejected++;
      return {
        allowed: false,
        retryAfterMs: this.config.criticalDelayMs,
        delayMs: 0,
        reason: 'system_overloaded',
        loadLevel: LoadLevel.CRITICAL,
        degradedMode: true,
      };
    }

    const delay = this.applyJitter(this.config.criticalDelayMs * 0.5);
    this.totalDelayed++;
    this.pendingHandshakes++;

    setTimeout(() => {
      this.pendingHandshakes = Math.max(0, this.pendingHandshakes - 1);
    }, delay);

    return {
      allowed: true,
      retryAfterMs: 0,
      delayMs: delay,
      reason: 'load_critical',
      loadLevel: LoadLevel.CRITICAL,
      degradedMode: true,
    };
  }

  private applyJitter(baseDelay: number): number {
    if (!this.config.enableJitter) return Math.round(baseDelay);

    const jitterRange = baseDelay * this.config.jitterFactor;
    const jitter = (Math.random() - 0.5) * jitterRange;
    return Math.max(100, Math.round(baseDelay + jitter));
  }

  getStats() {
    return {
      totalHandled: this.totalHandled,
      totalRejected: this.totalRejected,
      totalDelayed: this.totalDelayed,
      pendingHandshakes: this.pendingHandshakes,
      rejectionRate: this.totalHandled > 0
        ? (this.totalRejected / this.totalHandled * 100).toFixed(2) + '%'
        : '0%',
      loadLevel: this.loadMonitor.getLoadLevel(),
      rateLimiter: this.rateLimiter.getStats(),
      systemLoad: this.loadMonitor.getCurrentLoad(),
    };
  }

  resetStats() {
    this.totalHandled = 0;
    this.totalRejected = 0;
    this.totalDelayed = 0;
    this.pendingHandshakes = 0;
  }
}
