export enum GCodeCommandType {
  RAPID = 'G00',
  LINEAR = 'G01',
  ARC_CW = 'G02',
  ARC_CCW = 'G03',
  DWELL = 'G04',
  PLANE_XY = 'G17',
  PLANE_XZ = 'G18',
  PLANE_YZ = 'G19',
  UNITS_INCH = 'G20',
  UNITS_MM = 'G21',
  RETURN_REF = 'G28',
  RETURN_SECONDARY = 'G30',
  SET_OFFSET = 'G92',
  ABSOLUTE = 'G90',
  INCREMENTAL = 'G91',
  FEED_PER_MIN = 'G94',
  FEED_PER_REV = 'G95',
  SPINDLE_ON_CW = 'M03',
  SPINDLE_ON_CCW = 'M04',
  SPINDLE_OFF = 'M05',
  COOLANT_ON = 'M08',
  COOLANT_OFF = 'M09',
  PROGRAM_END = 'M02',
  PROGRAM_END_RESET = 'M30',
}

export enum MotionType {
  RAPID = 'rapid',
  FEED = 'feed',
  ARC_CW = 'arc_cw',
  ARC_CCW = 'arc_ccw',
  DWELL = 'dwell',
  NONE = 'none',
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface GCodeWord {
  letter: string;
  value: number;
  raw: string;
}

export interface GCodeLine {
  lineNumber: number;
  raw: string;
  words: GCodeWord[];
  gCommands: string[];
  mCommands: string[];
  comment?: string;
}

export interface MotionSegment {
  id: number;
  type: MotionType;
  startPoint: Point3D;
  endPoint: Point3D;
  center?: Point3D;
  radius?: number;
  feedRate?: number;
  spindleSpeed?: number;
  isCutting: boolean;
  lineNumber: number;
  gCode: string;
}

export interface ParserState {
  position: Point3D;
  offset: Point3D;
  motionType: MotionType;
  plane: 'XY' | 'XZ' | 'YZ';
  units: 'mm' | 'inch';
  coordinateMode: 'absolute' | 'incremental';
  feedRate: number;
  spindleSpeed: number;
  spindleOn: boolean;
  spindleDirection: 'cw' | 'ccw';
  coolantOn: boolean;
  isCutting: boolean;
}

export interface GCodeParseResult {
  success: boolean;
  error?: string;
  lines?: GCodeLine[];
  segments?: MotionSegment[];
  metadata?: {
    totalLines: number;
    totalSegments: number;
    boundingBox: {
      min: Point3D;
      max: Point3D;
    };
    totalDistance: number;
    cuttingDistance: number;
    rapidDistance: number;
    estimatedTime: number;
  };
}

export const DEFAULT_PARSER_STATE: ParserState = {
  position: { x: 0, y: 0, z: 0 },
  offset: { x: 0, y: 0, z: 0 },
  motionType: MotionType.NONE,
  plane: 'XY',
  units: 'mm',
  coordinateMode: 'absolute',
  feedRate: 100,
  spindleSpeed: 0,
  spindleOn: false,
  spindleDirection: 'cw',
  coolantOn: false,
  isCutting: false,
};
