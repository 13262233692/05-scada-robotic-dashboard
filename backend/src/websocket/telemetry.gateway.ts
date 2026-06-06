import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TelemetryGatewayService } from '../telemetry-gateway/telemetry-gateway.service';
import { RoboticArmTelemetry } from '../plc-protocol/types';
import { ConnectionDegradationManager } from '../rate-limit/connection-degradation';
import { SystemLoadMonitor } from '../rate-limit/system-load-monitor';
import { LoadLevel } from '../rate-limit/system-load-monitor';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/telemetry',
  allowEIO3: true,
})
@Injectable()
export class TelemetryWebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private pushInterval: NodeJS.Timeout;
  private readonly PUSH_FREQUENCY = 20;
  private readonly PUSH_INTERVAL_MS = 1000 / this.PUSH_FREQUENCY;
  private connectedClients: Set<string> = new Set();
  private statsLogInterval: NodeJS.Timeout;

  constructor(
    private readonly telemetryService: TelemetryGatewayService,
    private readonly degradationManager: ConnectionDegradationManager,
    private readonly loadMonitor: SystemLoadMonitor
  ) {}

  onModuleInit() {
    this.startDataPush();
    this.startStatsLogging();
  }

  onModuleDestroy() {
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
    }
    if (this.statsLogInterval) {
      clearInterval(this.statsLogInterval);
    }
  }

  afterInit(server: Server) {
    console.log('[WebSocket] Gateway initialized with rate limiting');
  }

  async handleConnection(client: Socket) {
    const clientIp = this.getClientIp(client);
    const decision = this.degradationManager.evaluateHandshake(clientIp);

    if (!decision.allowed) {
      console.warn(
        `[RateLimit] 拒绝连接 ${client.id} (IP: ${clientIp}), 原因: ${decision.reason}, ${
          decision.retryAfterMs
        }ms 后重试`
      );

      client.emit('server:throttled', {
        reason: decision.reason,
        retryAfter: decision.retryAfterMs,
        loadLevel: decision.loadLevel,
        message: 'Server is under high load, please retry later',
      });

      setTimeout(() => {
        client.disconnect(true);
      }, 100);
      return;
    }

    if (decision.degradedMode) {
      console.warn(
        `[Degraded] 客户端 ${client.id} 进入降级模式, 延迟 ${decision.delayMs}ms, 负载级别: ${decision.loadLevel}`
      );

      await new Promise((resolve) => setTimeout(resolve, decision.delayMs));

      if (!client.connected) {
        return;
      }
    }

    this.loadMonitor.incrementConnections();
    this.connectedClients.add(client.id);

    const loadLevel = this.loadMonitor.getLoadLevel();
    const initialData = this.telemetryService.getAllTelemetry();

    client.emit('connection:accepted', {
      serverTime: Date.now(),
      pushFrequency: this.PUSH_FREQUENCY,
      degradedMode: decision.degradedMode,
      loadLevel,
      recommendedReconnectBase: 1500,
    });

    client.emit('initialData', Array.from(initialData.values()));

    console.log(
      `[WebSocket] 客户端连接: ${client.id} (IP: ${clientIp}), 当前连接数: ${this.connectedClients.size}, 负载级别: ${loadLevel}`
    );
  }

  handleDisconnect(client: Socket) {
    this.loadMonitor.decrementConnections();
    this.connectedClients.delete(client.id);
    console.log(
      `[WebSocket] 客户端断开: ${client.id}, 剩余连接数: ${this.connectedClients.size}`
    );
  }

  private startDataPush() {
    this.pushInterval = setInterval(() => {
      if (this.connectedClients.size === 0) return;

      const allTelemetry = this.telemetryService.getAllTelemetry();
      if (allTelemetry.size === 0) return;

      const dataArray = Array.from(allTelemetry.values());
      const loadLevel = this.loadMonitor.getLoadLevel();

      if (loadLevel === LoadLevel.CRITICAL) {
        if (Date.now() % 2 === 0) return;
      }

      this.server.emit('telemetry:batch', {
        timestamp: Date.now(),
        frequency: this.PUSH_FREQUENCY,
        data: dataArray,
        serverLoad: loadLevel,
      });

      dataArray.forEach((telemetry) => {
        this.server.to(`arm:${telemetry.armId}`).emit(`telemetry:arm:${telemetry.armId}`, telemetry);
      });
    }, this.PUSH_INTERVAL_MS);

    console.log(
      `[WebSocket] 数据推送已启动, 频率: ${this.PUSH_FREQUENCY}Hz (每 ${this.PUSH_INTERVAL_MS}ms)`
    );
  }

  private startStatsLogging() {
    this.statsLogInterval = setInterval(() => {
      const stats = this.degradationManager.getStats();
      console.log(
        `[Stats] 连接数: ${this.connectedClients.size}, ` +
          `负载: ${stats.loadLevel}, ` +
          `拒绝率: ${stats.rejectionRate}, ` +
          `已处理: ${stats.totalHandled}, 已拒绝: ${stats.totalRejected}, 已延迟: ${stats.totalDelayed}`
      );
    }, 30000);
  }

  private getClientIp(client: Socket): string {
    return (
      client.handshake.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      client.handshake.address ||
      client.conn.remoteAddress ||
      'unknown'
    );
  }

  @SubscribeMessage('subscribe:arm')
  handleSubscribeArm(client: Socket, armId: number) {
    client.join(`arm:${armId}`);
    return { event: 'subscribed', data: { armId } };
  }

  @SubscribeMessage('unsubscribe:arm')
  handleUnsubscribeArm(client: Socket, armId: number) {
    client.leave(`arm:${armId}`);
    return { event: 'unsubscribed', data: { armId } };
  }

  @SubscribeMessage('command:arm')
  handleArmCommand(client: Socket, payload: { armId: number; command: string }) {
    const loadLevel = this.loadMonitor.getLoadLevel();
    if (loadLevel === LoadLevel.CRITICAL) {
      return {
        event: 'command:response',
        data: { success: false, ...payload, reason: 'system_overloaded' },
      };
    }

    const success = this.telemetryService.sendCommand(payload.armId, payload.command);
    return { event: 'command:response', data: { success, ...payload } };
  }

  @SubscribeMessage('request:current')
  handleRequestCurrent(client: Socket) {
    const allTelemetry = this.telemetryService.getAllTelemetry();
    return {
      event: 'current:data',
      data: {
        telemetry: Array.from(allTelemetry.values()),
        serverLoad: this.loadMonitor.getLoadLevel(),
      },
    };
  }

  @SubscribeMessage('system:stats')
  handleSystemStats() {
    return {
      event: 'system:stats',
      data: this.degradationManager.getStats(),
    };
  }
}
