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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/telemetry',
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

  constructor(private readonly telemetryService: TelemetryGatewayService) {}

  onModuleInit() {
    this.startDataPush();
  }

  onModuleDestroy() {
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
    }
  }

  afterInit(server: Server) {
    console.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.connectedClients.add(client.id);
    
    const currentData = this.telemetryService.getAllTelemetry();
    client.emit('initialData', Array.from(currentData.values()));
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  private startDataPush() {
    this.pushInterval = setInterval(() => {
      if (this.connectedClients.size === 0) return;

      const allTelemetry = this.telemetryService.getAllTelemetry();
      if (allTelemetry.size === 0) return;

      const dataArray = Array.from(allTelemetry.values());
      
      this.server.emit('telemetry:batch', {
        timestamp: Date.now(),
        frequency: this.PUSH_FREQUENCY,
        data: dataArray,
      });

      dataArray.forEach((telemetry) => {
        this.server.to(`arm:${telemetry.armId}`).emit(`telemetry:arm:${telemetry.armId}`, telemetry);
      });
    }, this.PUSH_INTERVAL_MS);

    console.log(`WebSocket push started at ${this.PUSH_FREQUENCY}Hz (every ${this.PUSH_INTERVAL_MS}ms)`);
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
    const success = this.telemetryService.sendCommand(payload.armId, payload.command);
    return { event: 'command:response', data: { success, ...payload } };
  }

  @SubscribeMessage('request:current')
  handleRequestCurrent(client: Socket) {
    const allTelemetry = this.telemetryService.getAllTelemetry();
    return { event: 'current:data', data: Array.from(allTelemetry.values()) };
  }
}
