import { io, Socket } from 'socket.io-client';
import { ref, reactive, computed } from 'vue';
import type { RoboticArmTelemetry, TelemetryBatch, HistoryPoint, DataMetric } from '../types/telemetry';
import {
  ExponentialBackoffWithJitter,
  BackoffState,
} from '../utils/exponential-backoff';

const HISTORY_MAX_POINTS = 300;

type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'circuit_open';

class TelemetryDataManager {
  private socket: Socket | null = null;
  private historyBuffers: Map<number, Map<string, HistoryPoint[]>> = new Map();
  private backoff: ExponentialBackoffWithJitter;
  private serverUrl: string = '';
  private manualDisconnect: boolean = false;

  public isConnected = ref(false);
  public connectionStatus = ref<ConnectionStatus>('disconnected');
  public currentData = reactive<Map<number, RoboticArmTelemetry>>(new Map());
  public lastUpdateTime = ref(0);
  public updateFrequency = ref(0);
  public reconnectAttempt = ref(0);
  public nextReconnectIn = ref(0);
  public consecutiveFailures = ref(0);
  public circuitOpen = ref(false);
  public circuitRemainingMs = ref(0);

  private lastFrameTime = 0;
  private frameCount = 0;
  private frequencyCalcInterval: number | null = null;
  private countdownInterval: number | null = null;
  private nextRetryAt: number = 0;

  constructor() {
    this.backoff = new ExponentialBackoffWithJitter({
      initialDelay: 1500,
      maxDelay: 45000,
      multiplier: 1.8,
      jitterFactor: 0.4,
      maxRetries: 25,
      circuitBreakerThreshold: 12,
      circuitBreakerResetTime: 300000,
    });

    this.setupBackoffCallbacks();
    this.initFrequencyCounter();
    this.initCountdownTimer();
  }

  private setupBackoffCallbacks() {
    this.backoff.onRetry((attempt, delay) => {
      this.reconnectAttempt.value = attempt;
      this.nextReconnectIn.value = delay;
      this.nextRetryAt = Date.now() + delay;
      this.connectionStatus.value = 'reconnecting';
      console.warn(
        `[Reconnect] 尝试第 ${attempt} 次重连，延迟 ${(delay / 1000).toFixed(1)}s`
      );
    });

    this.backoff.onReset(() => {
      this.reconnectAttempt.value = 0;
      this.consecutiveFailures.value = 0;
      this.nextReconnectIn.value = 0;
      this.nextRetryAt = 0;
    });

    this.backoff.onCircuitOpen(() => {
      this.circuitOpen.value = true;
      this.connectionStatus.value = 'circuit_open';
      console.error(
        `[CircuitBreaker] 熔断器打开！停止重连 ${
          this.backoff.getCircuitRemainingTime() / 1000
        }s`
      );
    });

    this.backoff.onCircuitClose(() => {
      this.circuitOpen.value = false;
      console.log('[CircuitBreaker] 熔断器关闭，恢复重连尝试');
    });
  }

  private initFrequencyCounter() {
    this.frequencyCalcInterval = window.setInterval(() => {
      const now = Date.now();
      if (this.lastFrameTime > 0) {
        const elapsed = (now - this.lastFrameTime) / 1000;
        this.updateFrequency.value = Math.round(this.frameCount / elapsed);
      }
      this.frameCount = 0;
      this.lastFrameTime = now;
    }, 1000);
  }

  private initCountdownTimer() {
    this.countdownInterval = window.setInterval(() => {
      if (this.connectionStatus.value === 'reconnecting' && this.nextRetryAt > 0) {
        const remaining = Math.max(0, this.nextRetryAt - Date.now());
        this.nextReconnectIn.value = remaining;
      }

      if (this.circuitOpen.value) {
        this.circuitRemainingMs.value = this.backoff.getCircuitRemainingTime();
      }
    }, 100);
  }

  connect(url: string = 'http://localhost:3000/telemetry') {
    this.serverUrl = url;
    this.manualDisconnect = false;

    if (this.socket) {
      this.cleanupSocket();
    }

    this.performConnection();
  }

  private performConnection() {
    if (this.manualDisconnect) return;

    const state = this.backoff.getState();
    if (state === BackoffState.CIRCUIT_OPEN) {
      this.circuitOpen.value = true;
      this.connectionStatus.value = 'circuit_open';
      return;
    }

    this.connectionStatus.value = 'connecting';

    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 8000,
      forceNew: true,
    });

    this.socket.on('connect', () => {
      console.log('[WebSocket] 连接成功');
      this.isConnected.value = true;
      this.connectionStatus.value = 'connected';
      this.backoff.success();
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[WebSocket] 连接错误:', err.message);
      this.backoff.failure();
      this.consecutiveFailures.value = this.backoff.getConsecutiveFailures();
      this.scheduleReconnect();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[WebSocket] 断开连接，原因:', reason);
      this.isConnected.value = false;

      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        this.connectionStatus.value = 'disconnected';
        return;
      }

      if (!this.manualDisconnect) {
        this.backoff.failure();
        this.consecutiveFailures.value = this.backoff.getConsecutiveFailures();
        this.scheduleReconnect();
      }
    });

    this.socket.on('initialData', (data: RoboticArmTelemetry[]) => {
      data.forEach((telemetry) => {
        this.currentData.set(telemetry.armId, telemetry);
        this.initHistoryBuffer(telemetry.armId);
      });
    });

    this.socket.on('telemetry:batch', (batch: TelemetryBatch) => {
      this.handleBatchData(batch);
    });

    this.socket.on('server:throttled', (info) => {
      console.warn('[Server] 服务端限流:', info);
      if (info?.retryAfter) {
        this.backoff.executeAfterDelay(() => {
          this.manualDisconnect = false;
          this.performConnection();
        });
      }
    });
  }

  private scheduleReconnect() {
    if (this.manualDisconnect) return;

    const scheduled = this.backoff.executeAfterDelay(() => {
      if (!this.manualDisconnect) {
        this.performConnection();
      }
    });

    if (!scheduled) {
      this.connectionStatus.value =
        this.backoff.getState() === BackoffState.CIRCUIT_OPEN
          ? 'circuit_open'
          : 'disconnected';
      this.isConnected.value = false;
    }
  }

  private cleanupSocket() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private handleBatchData(batch: TelemetryBatch) {
    this.frameCount++;
    this.lastUpdateTime.value = batch.timestamp;

    batch.data.forEach((telemetry) => {
      this.currentData.set(telemetry.armId, { ...telemetry });
      this.updateHistory(telemetry);
    });
  }

  private initHistoryBuffer(armId: number) {
    if (!this.historyBuffers.has(armId)) {
      const metrics = new Map<string, HistoryPoint[]>();
      ['angle', 'temperature', 'torque'].forEach((metric) => {
        for (let joint = 0; joint < 6; joint++) {
          metrics.set(`${metric}_j${joint}`, []);
        }
      });
      this.historyBuffers.set(armId, metrics);
    }
  }

  private updateHistory(telemetry: RoboticArmTelemetry) {
    const armBuffer = this.historyBuffers.get(telemetry.armId);
    if (!armBuffer) {
      this.initHistoryBuffer(telemetry.armId);
      return;
    }

    const ts = telemetry.timestamp;

    telemetry.joints.forEach((joint, idx) => {
      this.pushToBuffer(armBuffer.get(`angle_j${idx}`)!, ts, joint.angle);
      this.pushToBuffer(armBuffer.get(`temperature_j${idx}`)!, ts, joint.temperature);
      this.pushToBuffer(armBuffer.get(`torque_j${idx}`)!, ts, joint.torque);
    });
  }

  private pushToBuffer(buffer: HistoryPoint[], ts: number, value: number) {
    buffer.push({ timestamp: ts, value });
    if (buffer.length > HISTORY_MAX_POINTS) {
      buffer.shift();
    }
  }

  getHistory(armId: number, metric: DataMetric, jointIndex: number): HistoryPoint[] {
    const armBuffer = this.historyBuffers.get(armId);
    if (!armBuffer) return [];
    return armBuffer.get(`${metric}_j${jointIndex}`) || [];
  }

  getCurrentTelemetry(armId: number): RoboticArmTelemetry | undefined {
    return this.currentData.get(armId);
  }

  getAllArmIds(): number[] {
    return Array.from(this.currentData.keys()).sort((a, b) => a - b);
  }

  subscribeArm(armId: number) {
    if (this.socket && this.isConnected.value) {
      this.socket.emit('subscribe:arm', armId);
    }
  }

  unsubscribeArm(armId: number) {
    if (this.socket && this.isConnected.value) {
      this.socket.emit('unsubscribe:arm', armId);
    }
  }

  sendCommand(armId: number, command: string) {
    if (this.socket && this.isConnected.value) {
      this.socket.emit('command:arm', { armId, command });
    }
  }

  manualReconnect() {
    console.log('[Reconnect] 手动触发重连');
    this.backoff.reset();
    this.manualDisconnect = false;
    this.cleanupSocket();
    this.performConnection();
  }

  resetCircuitBreaker() {
    if (this.backoff.getState() === BackoffState.CIRCUIT_OPEN) {
      console.log('[CircuitBreaker] 手动重置熔断器');
      this.backoff['closeCircuit']();
      this.backoff['retryCount'] = 0;
      this.backoff['consecutiveFailures'] = 0;
      this.circuitOpen.value = false;
      this.manualReconnect();
    }
  }

  disconnect() {
    this.manualDisconnect = true;
    this.backoff.cancelPending();
    this.backoff.reset();
    this.cleanupSocket();

    if (this.frequencyCalcInterval) {
      clearInterval(this.frequencyCalcInterval);
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    this.isConnected.value = false;
    this.connectionStatus.value = 'disconnected';
  }

  getDiagnostics() {
    return {
      status: this.connectionStatus.value,
      reconnectAttempt: this.reconnectAttempt.value,
      consecutiveFailures: this.consecutiveFailures.value,
      nextReconnectInMs: this.nextReconnectIn.value,
      circuitOpen: this.circuitOpen.value,
      circuitRemainingMs: this.circuitRemainingMs.value,
      updateFrequency: this.updateFrequency.value,
      connectedArms: this.currentData.size,
    };
  }
}

export const telemetryManager = new TelemetryDataManager();
