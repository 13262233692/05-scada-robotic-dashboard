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

export interface GCodeParseMetadata {
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
}

export interface GCodeParseResult {
  success: boolean;
  error?: string;
  segments?: MotionSegment[];
  metadata?: GCodeParseMetadata;
  filename?: string;
}

export interface DrawPoint {
  x: number;
  y: number;
}

export interface PathSegment {
  id: number;
  type: MotionType;
  points: DrawPoint[];
  isCutting: boolean;
  lineNumber: number;
  gCode: string;
  feedRate?: number;
}

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}
