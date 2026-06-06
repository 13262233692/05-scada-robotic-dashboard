import * as os from 'os';

export interface SystemLoad {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  activeConnections: number;
  loadAverage: number[];
  eventLoopLagMs: number;
}

export interface LoadThresholds {
  cpuWarning: number;
  cpuCritical: number;
  memoryWarning: number;
  memoryCritical: number;
  connectionsWarning: number;
  connectionsCritical: number;
}

export const DEFAULT_LOAD_THRESHOLDS: LoadThresholds = {
  cpuWarning: 0.6,
  cpuCritical: 0.85,
  memoryWarning: 0.7,
  memoryCritical: 0.9,
  connectionsWarning: 800,
  connectionsCritical: 1500,
};

export enum LoadLevel {
  NORMAL = 'normal',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export class SystemLoadMonitor {
  private thresholds: LoadThresholds;
  private lastCpuUsage: { idle: number; total: number };
  private history: SystemLoad[] = [];
  private maxHistoryPoints = 60;
  private currentLoad: SystemLoad | null = null;
  private sampleInterval: NodeJS.Timeout | null = null;
  private activeConnections = 0;
  private lagStart = process.hrtime();

  constructor(thresholds: Partial<LoadThresholds> = {}) {
    this.thresholds = { ...DEFAULT_LOAD_THRESHOLDS, ...thresholds };
    this.lastCpuUsage = this.getCpuUsage();
  }

  startSampling(intervalMs = 2000) {
    this.sample();
    this.sampleInterval = setInterval(() => this.sample(), intervalMs);
  }

  stopSampling() {
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }
  }

  private sample() {
    const cpuSample = this.calculateCpuUsage();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const usedMem = memUsage.heapUsed;
    const eventLoopLag = this.measureEventLoopLag();

    const load: SystemLoad = {
      timestamp: Date.now(),
      cpuUsage: cpuSample,
      memoryUsage: usedMem / totalMem,
      memoryUsedMB: Math.round(usedMem / 1024 / 1024),
      memoryTotalMB: Math.round(totalMem / 1024 / 1024),
      activeConnections: this.activeConnections,
      loadAverage: os.loadavg(),
      eventLoopLagMs: eventLoopLag,
    };

    this.currentLoad = load;
    this.history.push(load);
    if (this.history.length > this.maxHistoryPoints) {
      this.history.shift();
    }
  }

  private getCpuUsage(): { idle: number; total: number } {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return { idle: totalIdle, total: totalTick };
  }

  private calculateCpuUsage(): number {
    const current = this.getCpuUsage();
    const idleDiff = current.idle - this.lastCpuUsage.idle;
    const totalDiff = current.total - this.lastCpuUsage.total;
    this.lastCpuUsage = current;

    if (totalDiff === 0) return 0;
    return 1 - idleDiff / totalDiff;
  }

  private measureEventLoopLag(): number {
    const hrtime = process.hrtime(this.lagStart);
    this.lagStart = process.hrtime();
    return hrtime[0] * 1000 + hrtime[1] / 1000000;
  }

  getCurrentLoad(): SystemLoad | null {
    return this.currentLoad;
  }

  getLoadLevel(): LoadLevel {
    const load = this.currentLoad;
    if (!load) return LoadLevel.NORMAL;

    if (
      load.cpuUsage >= this.thresholds.cpuCritical ||
      load.memoryUsage >= this.thresholds.memoryCritical ||
      load.activeConnections >= this.thresholds.connectionsCritical
    ) {
      return LoadLevel.CRITICAL;
    }

    if (
      load.cpuUsage >= this.thresholds.cpuWarning ||
      load.memoryUsage >= this.thresholds.memoryWarning ||
      load.activeConnections >= this.thresholds.connectionsWarning
    ) {
      return LoadLevel.WARNING;
    }

    return LoadLevel.NORMAL;
  }

  incrementConnections() {
    this.activeConnections++;
  }

  decrementConnections() {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  getHistory(): SystemLoad[] {
    return [...this.history];
  }

  getStats() {
    return {
      loadLevel: this.getLoadLevel(),
      current: this.currentLoad,
      thresholds: this.thresholds,
    };
  }
}
