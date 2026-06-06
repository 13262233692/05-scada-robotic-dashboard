export interface JointTelemetry {
  angle: number;
  temperature: number;
  torque: number;
}

export interface ArmStatus {
  isRunning: boolean;
  isError: boolean;
  isWarning: boolean;
  isMaintenance: boolean;
  emergencyStop: boolean;
  autoMode: boolean;
}

export interface RoboticArmTelemetry {
  armId: number;
  timestamp: number;
  joints: JointTelemetry[];
  status: ArmStatus;
}

export interface TelemetryBatch {
  timestamp: number;
  frequency: number;
  data: RoboticArmTelemetry[];
}

export interface HistoryPoint {
  timestamp: number;
  value: number;
}

export type DataMetric = 'angle' | 'temperature' | 'torque';
