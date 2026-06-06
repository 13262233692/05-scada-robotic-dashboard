import { PROTOCOL } from './protocol';
import { ParsedFrame, RoboticArmTelemetry, JointTelemetry } from './types';

export class PlcProtocolParser {
  static parseFrame(buffer: Buffer): ParsedFrame {
    try {
      if (buffer.length < PROTOCOL.FRAME_LENGTH) {
        return { valid: false, error: `Frame too short: ${buffer.length} bytes` };
      }

      const header = buffer.readUInt16LE(PROTOCOL.OFFSETS.HEADER);
      if (header !== PROTOCOL.FRAME_HEADER) {
        return { valid: false, error: `Invalid header: 0x${header.toString(16)}` };
      }

      const footer = buffer.readUInt16LE(PROTOCOL.OFFSETS.FOOTER);
      if (footer !== PROTOCOL.FRAME_FOOTER) {
        return { valid: false, error: `Invalid footer: 0x${footer.toString(16)}` };
      }

      const armId = buffer.readUInt16LE(PROTOCOL.OFFSETS.ARM_ID);
      
      const timestampHigh = buffer.readUInt16LE(PROTOCOL.OFFSETS.TIMESTAMP_HIGH);
      const timestampLow = buffer.readUInt16LE(PROTOCOL.OFFSETS.TIMESTAMP_LOW);
      const timestamp = (timestampHigh << 16) | timestampLow;

      const joints: JointTelemetry[] = [];
      for (let i = 0; i < PROTOCOL.JOINT_COUNT; i++) {
        const angleOffset = PROTOCOL.OFFSETS.JOINT_ANGLES + i * 4;
        const tempOffset = PROTOCOL.OFFSETS.JOINT_TEMPS + i * 4;
        const torqueOffset = PROTOCOL.OFFSETS.JOINT_TORQUES + i * 4;

        joints.push({
          angle: buffer.readFloatLE(angleOffset),
          temperature: buffer.readFloatLE(tempOffset),
          torque: buffer.readFloatLE(torqueOffset),
        });
      }

      const statusWord = buffer.readUInt16LE(PROTOCOL.OFFSETS.STATUS_WORD);
      const status = {
        isRunning: !!(statusWord & (1 << PROTOCOL.STATUS_BITS.RUNNING)),
        isError: !!(statusWord & (1 << PROTOCOL.STATUS_BITS.ERROR)),
        isWarning: !!(statusWord & (1 << PROTOCOL.STATUS_BITS.WARNING)),
        isMaintenance: !!(statusWord & (1 << PROTOCOL.STATUS_BITS.MAINTENANCE)),
        emergencyStop: !!(statusWord & (1 << PROTOCOL.STATUS_BITS.EMERGENCY_STOP)),
        autoMode: !!(statusWord & (1 << PROTOCOL.STATUS_BITS.AUTO_MODE)),
      };

      const telemetry: RoboticArmTelemetry = {
        armId,
        timestamp,
        joints,
        status,
      };

      return { valid: true, telemetry };
    } catch (e) {
      return { valid: false, error: `Parse error: ${e.message}` };
    }
  }

  static buildFrame(telemetry: RoboticArmTelemetry): Buffer {
    const buffer = Buffer.alloc(PROTOCOL.FRAME_LENGTH);
    
    buffer.writeUInt16LE(PROTOCOL.FRAME_HEADER, PROTOCOL.OFFSETS.HEADER);
    buffer.writeUInt16LE(telemetry.armId, PROTOCOL.OFFSETS.ARM_ID);
    buffer.writeUInt16LE(PROTOCOL.FRAME_LENGTH, PROTOCOL.OFFSETS.FRAME_LEN);
    
    const timestampHigh = (telemetry.timestamp >> 16) & 0xFFFF;
    const timestampLow = telemetry.timestamp & 0xFFFF;
    buffer.writeUInt16LE(timestampHigh, PROTOCOL.OFFSETS.TIMESTAMP_HIGH);
    buffer.writeUInt16LE(timestampLow, PROTOCOL.OFFSETS.TIMESTAMP_LOW);

    for (let i = 0; i < PROTOCOL.JOINT_COUNT; i++) {
      const angleOffset = PROTOCOL.OFFSETS.JOINT_ANGLES + i * 4;
      const tempOffset = PROTOCOL.OFFSETS.JOINT_TEMPS + i * 4;
      const torqueOffset = PROTOCOL.OFFSETS.JOINT_TORQUES + i * 4;

      buffer.writeFloatLE(telemetry.joints[i].angle, angleOffset);
      buffer.writeFloatLE(telemetry.joints[i].temperature, tempOffset);
      buffer.writeFloatLE(telemetry.joints[i].torque, torqueOffset);
    }

    let statusWord = 0;
    if (telemetry.status.isRunning) statusWord |= (1 << PROTOCOL.STATUS_BITS.RUNNING);
    if (telemetry.status.isError) statusWord |= (1 << PROTOCOL.STATUS_BITS.ERROR);
    if (telemetry.status.isWarning) statusWord |= (1 << PROTOCOL.STATUS_BITS.WARNING);
    if (telemetry.status.isMaintenance) statusWord |= (1 << PROTOCOL.STATUS_BITS.MAINTENANCE);
    if (telemetry.status.emergencyStop) statusWord |= (1 << PROTOCOL.STATUS_BITS.EMERGENCY_STOP);
    if (telemetry.status.autoMode) statusWord |= (1 << PROTOCOL.STATUS_BITS.AUTO_MODE);
    buffer.writeUInt16LE(statusWord, PROTOCOL.OFFSETS.STATUS_WORD);

    const crc = this.calculateCRC(buffer.slice(0, PROTOCOL.OFFSETS.CRC));
    buffer.writeUInt16LE(crc, PROTOCOL.OFFSETS.CRC);
    buffer.writeUInt16LE(PROTOCOL.FRAME_FOOTER, PROTOCOL.OFFSETS.FOOTER);

    return buffer;
  }

  private static calculateCRC(data: Buffer): number {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc >>= 1;
        }
      }
    }
    return crc & 0xFFFF;
  }
}
