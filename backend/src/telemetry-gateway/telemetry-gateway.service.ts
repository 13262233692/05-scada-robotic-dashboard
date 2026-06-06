import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as net from 'net';
import { EventEmitter } from 'events';
import { PlcProtocolParser } from '../plc-protocol/parser';
import { PROTOCOL } from '../plc-protocol/protocol';
import { RoboticArmTelemetry } from '../plc-protocol/types';

@Injectable()
export class TelemetryGatewayService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private server: net.Server;
  private clients: Map<number, net.Socket> = new Map();
  private telemetryCache: Map<number, RoboticArmTelemetry> = new Map();
  private bufferCache: Map<string, Buffer> = new Map();

  constructor(private readonly parser: PlcProtocolParser) {
    super();
  }

  onModuleInit() {
    this.startTcpServer();
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close();
    }
    this.clients.forEach((socket) => socket.destroy());
  }

  private startTcpServer() {
    this.server = net.createServer((socket) => {
      const clientKey = `${socket.remoteAddress}:${socket.remotePort}`;
      console.log(`PLC connected: ${clientKey}`);
      this.bufferCache.set(clientKey, Buffer.alloc(0));

      socket.on('data', (data) => {
        this.handleData(clientKey, data);
      });

      socket.on('close', () => {
        console.log(`PLC disconnected: ${clientKey}`);
        this.bufferCache.delete(clientKey);
      });

      socket.on('error', (err) => {
        console.error(`PLC socket error: ${err.message}`);
        this.bufferCache.delete(clientKey);
      });
    });

    const TCP_PORT = 502;
    this.server.listen(TCP_PORT, () => {
      console.log(`TelemetryGateway TCP Server listening on port ${TCP_PORT}`);
    });
  }

  private handleData(clientKey: string, data: Buffer) {
    const existingBuffer = this.bufferCache.get(clientKey) || Buffer.alloc(0);
    let combined = Buffer.concat([existingBuffer, data]);

    while (combined.length >= PROTOCOL.FRAME_LENGTH) {
      const headerIndex = this.findHeader(combined);
      
      if (headerIndex === -1) {
        combined = combined.slice(-(PROTOCOL.FRAME_LENGTH - 1));
        break;
      }

      if (headerIndex > 0) {
        combined = combined.slice(headerIndex);
      }

      if (combined.length < PROTOCOL.FRAME_LENGTH) {
        break;
      }

      const frame = combined.slice(0, PROTOCOL.FRAME_LENGTH);
      const result = this.parser.parseFrame(frame);

      if (result.valid && result.telemetry) {
        this.processTelemetry(result.telemetry);
      }

      combined = combined.slice(PROTOCOL.FRAME_LENGTH);
    }

    this.bufferCache.set(clientKey, combined);
  }

  private findHeader(buffer: Buffer): number {
    for (let i = 0; i <= buffer.length - 2; i++) {
      if (buffer.readUInt16LE(i) === PROTOCOL.FRAME_HEADER) {
        return i;
      }
    }
    return -1;
  }

  private processTelemetry(telemetry: RoboticArmTelemetry) {
    this.telemetryCache.set(telemetry.armId, telemetry);
    this.emit('telemetry', telemetry);
  }

  getTelemetry(armId?: number): RoboticArmTelemetry | RoboticArmTelemetry[] | undefined {
    if (armId !== undefined) {
      return this.telemetryCache.get(armId);
    }
    return Array.from(this.telemetryCache.values());
  }

  getAllTelemetry(): Map<number, RoboticArmTelemetry> {
    return new Map(this.telemetryCache);
  }

  sendCommand(armId: number, command: string): boolean {
    const client = this.clients.get(armId);
    if (client && client.writable) {
      client.write(JSON.stringify({ command, armId, timestamp: Date.now() }));
      return true;
    }
    return false;
  }
}
