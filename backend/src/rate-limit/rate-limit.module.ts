import { Module, Global, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CombinedRateLimiter } from './combined-limiter';
import { SystemLoadMonitor } from './system-load-monitor';
import { ConnectionDegradationManager } from './connection-degradation';

@Global()
@Module({
  providers: [
    {
      provide: CombinedRateLimiter,
      useFactory: () => {
        return new CombinedRateLimiter(
          {
            capacity: 300,
            refillRate: 80,
            refillIntervalMs: 1000,
          },
          {
            windowSizeMs: 10000,
            maxRequests: 800,
          }
        );
      },
    },
    {
      provide: SystemLoadMonitor,
      useFactory: () => {
        const monitor = new SystemLoadMonitor({
          cpuWarning: 0.65,
          cpuCritical: 0.88,
          memoryWarning: 0.75,
          memoryCritical: 0.92,
          connectionsWarning: 500,
          connectionsCritical: 1200,
        });
        return monitor;
      },
    },
    {
      provide: ConnectionDegradationManager,
      useFactory: (
        rateLimiter: CombinedRateLimiter,
        loadMonitor: SystemLoadMonitor
      ) => {
        return new ConnectionDegradationManager(rateLimiter, loadMonitor, {
          warningDelayMs: 2500,
          criticalDelayMs: 10000,
          warningMaxConcurrent: 25,
          criticalMaxConcurrent: 8,
          enableJitter: true,
          jitterFactor: 0.35,
        });
      },
      inject: [CombinedRateLimiter, SystemLoadMonitor],
    },
  ],
  exports: [CombinedRateLimiter, SystemLoadMonitor, ConnectionDegradationManager],
})
export class RateLimitModule implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly loadMonitor: SystemLoadMonitor) {}

  onModuleInit() {
    this.loadMonitor.startSampling(2000);
    console.log('[RateLimit] 限流与负载保护模块已启动');
  }

  onModuleDestroy() {
    this.loadMonitor.stopSampling();
  }
}
