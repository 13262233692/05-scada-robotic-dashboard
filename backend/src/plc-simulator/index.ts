import * as net from 'net';
import { PlcProtocolParser } from '../plc-protocol/parser';
import { RoboticArmTelemetry, JointTelemetry } from '../plc-protocol/types';
import { PROTOCOL } from '../plc-protocol/protocol';

class RoboticArmSimulator {
  private armId: number;
  private socket: net.Socket;
  private jointPhases: number[] = [];
  private baseTemps: number[] = [];
  private baseTorques: number[] = [];
  private sendInterval: NodeJS.Timeout;
  private readonly SEND_FREQUENCY = 20;
  private isRunning: boolean = true;
  private hasError: boolean = false;
  private hasWarning: boolean = false;

  constructor(armId: number, host: string, port: number) {
    this.armId = armId;
    this.socket = new net.Socket();
    
    for (let i = 0; i < PROTOCOL.JOINT_COUNT; i++) {
      this.jointPhases.push(Math.random() * Math.PI * 2);
      this.baseTemps.push(35 + Math.random() * 20);
      this.baseTorques.push(10 + Math.random() * 15);
    }

    this.socket.connect(port, host, () => {
      console.log(`Arm ${armId} PLC connected to ${host}:${port}`);
      this.startSending();
    });

    this.socket.on('error', (err) => {
      console.error(`Arm ${armId} connection error:`, err.message);
      this.reconnect(host, port);
    });

    this.socket.on('close', () => {
      console.log(`Arm ${armId} connection closed`);
      if (this.sendInterval) {
        clearInterval(this.sendInterval);
      }
    });

    setInterval(() => {
      if (Math.random() < 0.001) {
        this.hasError = !this.hasError;
        console.log(`Arm ${armId} error state: ${this.hasError}`);
      }
      if (Math.random() < 0.005) {
        this.hasWarning = !this.hasWarning;
      }
    }, 1000);
  }

  private reconnect(host: string, port: number) {
    setTimeout(() => {
      console.log(`Arm ${this.armId} reconnecting...`);
      this.socket.connect(port, host);
    }, 3000);
  }

  private startSending() {
    this.sendInterval = setInterval(() => {
      if (!this.socket.writable) return;

      const telemetry = this.generateTelemetry();
      const frame = PlcProtocolParser.buildFrame(telemetry);
      this.socket.write(frame);
    }, 1000 / this.SEND_FREQUENCY);
  }

  private generateTelemetry(): RoboticArmTelemetry {
    const timestamp = Date.now();
    const joints: JointTelemetry[] = [];

    for (let i = 0; i < PROTOCOL.JOINT_COUNT; i++) {
      const phase = this.jointPhases[i] + (timestamp / 1000) * (0.5 + i * 0.1);
      const angle = Math.sin(phase) * (90 - i * 10) + (Math.random() - 0.5) * 2;
      const tempVariation = Math.sin(phase * 0.1) * 5 + (Math.random() - 0.5) * 2;
      const torqueVariation = Math.sin(phase * 0.5) * 5 + (Math.random() - 0.5) * 3;

      joints.push({
        angle: Math.round(angle * 100) / 100,
        temperature: Math.round((this.baseTemps[i] + tempVariation) * 10) / 10,
        torque: Math.round((this.baseTorques[i] + torqueVariation) * 100) / 100,
      });
    }

    return {
      armId: this.armId,
      timestamp,
      joints,
      status: {
        isRunning: this.isRunning,
        isError: this.hasError,
        isWarning: this.hasWarning,
        isMaintenance: false,
        emergencyStop: false,
        autoMode: true,
      },
    };
  }

  stop() {
    this.isRunning = false;
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
    }
    this.socket.destroy();
  }
}

const TCP_HOST = 'localhost';
const TCP_PORT = 502;
const ARM_COUNT = 4;

console.log('Starting PLC Simulator...');
console.log(`Connecting ${ARM_COUNT} robotic arms to ${TCP_HOST}:${TCP_PORT}`);

const arms: RoboticArmSimulator[] = [];
for (let i = 1; i <= ARM_COUNT; i++) {
  setTimeout(() => {
    arms.push(new RoboticArmSimulator(i, TCP_HOST, TCP_PORT));
  }, i * 500);
}

process.on('SIGINT', () => {
  console.log('\nShutting down PLC Simulator...');
  arms.forEach((arm) => arm.stop());
  process.exit(0);
});
