export interface JointTelemetry {
  angle: number;
  temperature: number;
  torque: number;
}

export interface RoboticArmTelemetry {
  armId: number;
  timestamp: number;
  joints: JointTelemetry[];
  status: {
    isRunning: boolean;
    isError: boolean;
    isWarning: boolean;
    isMaintenance: boolean;
    emergencyStop: boolean;
    autoMode: boolean;
  };
}

export interface ParsedFrame {
  valid: boolean;
  telemetry?: RoboticArmTelemetry;
  error?: string;
}
