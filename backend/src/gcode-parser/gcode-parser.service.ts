import {
  GCodeLine,
  GCodeWord,
  GCodeParseResult,
  MotionSegment,
  MotionType,
  ParserState,
  Point3D,
  DEFAULT_PARSER_STATE,
  GCodeCommandType,
} from './types';

const GCODE_REGEX = /([A-Z])(-?\d+\.?\d*)/g;
const COMMENT_REGEX = /\(.*?\)|\;.*$/g;
const LINE_NUMBER_REGEX = /^N\d+\s*/i;

export class GCodeParserEngine {
  private state: ParserState;
  private segments: MotionSegment[] = [];
  private lines: GCodeLine[] = [];
  private segmentIdCounter = 0;
  private errors: string[] = [];

  constructor(initialState?: Partial<ParserState>) {
    this.state = { ...DEFAULT_PARSER_STATE, ...initialState };
  }

  parse(gcode: string): GCodeParseResult {
    try {
      this.reset();
      const rawLines = gcode.split(/\r?\n/);

      for (let i = 0; i < rawLines.length; i++) {
        const lineNumber = i + 1;
        const parsedLine = this.parseLine(rawLines[i], lineNumber);
        if (parsedLine) {
          this.lines.push(parsedLine);
          this.executeLine(parsedLine);
        }
      }

      return {
        success: true,
        lines: this.lines,
        segments: this.segments,
        metadata: this.calculateMetadata(),
      };
    } catch (e) {
      return {
        success: false,
        error: `Parse error: ${e.message}`,
      };
    }
  }

  private reset() {
    this.state = { ...DEFAULT_PARSER_STATE };
    this.segments = [];
    this.lines = [];
    this.segmentIdCounter = 0;
    this.errors = [];
  }

  private parseLine(raw: string, lineNumber: number): GCodeLine | null {
    let cleaned = raw.trim();
    if (!cleaned) return null;

    let comment = '';
    const commentMatch = cleaned.match(COMMENT_REGEX);
    if (commentMatch) {
      comment = commentMatch.join(' ');
      cleaned = cleaned.replace(COMMENT_REGEX, '').trim();
    }

    cleaned = cleaned.replace(LINE_NUMBER_REGEX, '').trim();
    if (!cleaned) {
      return comment ? { lineNumber, raw, words: [], gCommands: [], mCommands: [], comment } : null;
    }

    const words: GCodeWord[] = [];
    const gCommands: string[] = [];
    const mCommands: string[] = [];

    let match;
    const regex = new RegExp(GCODE_REGEX.source, 'gi');
    while ((match = regex.exec(cleaned)) !== null) {
      const letter = match[1].toUpperCase();
      const value = parseFloat(match[2]);
      const rawWord = match[0];

      words.push({ letter, value, raw: rawWord });

      if (letter === 'G') {
        const code = `G${value.toString().padStart(2, '0')}`;
        gCommands.push(code);
      } else if (letter === 'M') {
        const code = `M${value.toString().padStart(2, '0')}`;
        mCommands.push(code);
      }
    }

    return {
      lineNumber,
      raw,
      words,
      gCommands,
      mCommands,
      comment: comment || undefined,
    };
  }

  private executeLine(line: GCodeLine) {
    for (const gCode of line.gCommands) {
      this.executeGCode(gCode, line);
    }

    for (const mCode of line.mCommands) {
      this.executeMCode(mCode);
    }

    this.applyMotionWords(line);
  }

  private executeGCode(gCode: string, line: GCodeLine) {
    const word = line.words.find((w) => w.letter === 'G' && `G${w.value.toString().padStart(2, '0')}` === gCode);
    if (!word) return;

    switch (gCode) {
      case GCodeCommandType.RAPID:
        this.state.motionType = MotionType.RAPID;
        this.state.isCutting = false;
        break;
      case GCodeCommandType.LINEAR:
        this.state.motionType = MotionType.FEED;
        this.state.isCutting = this.state.spindleOn;
        break;
      case GCodeCommandType.ARC_CW:
        this.state.motionType = MotionType.ARC_CW;
        this.state.isCutting = this.state.spindleOn;
        break;
      case GCodeCommandType.ARC_CCW:
        this.state.motionType = MotionType.ARC_CCW;
        this.state.isCutting = this.state.spindleOn;
        break;
      case GCodeCommandType.DWELL:
        this.state.motionType = MotionType.DWELL;
        break;
      case GCodeCommandType.PLANE_XY:
        this.state.plane = 'XY';
        break;
      case GCodeCommandType.PLANE_XZ:
        this.state.plane = 'XZ';
        break;
      case GCodeCommandType.PLANE_YZ:
        this.state.plane = 'YZ';
        break;
      case GCodeCommandType.UNITS_INCH:
        this.state.units = 'inch';
        break;
      case GCodeCommandType.UNITS_MM:
        this.state.units = 'mm';
        break;
      case GCodeCommandType.ABSOLUTE:
        this.state.coordinateMode = 'absolute';
        break;
      case GCodeCommandType.INCREMENTAL:
        this.state.coordinateMode = 'incremental';
        break;
      case GCodeCommandType.SET_OFFSET:
        this.applyOffset(line);
        break;
    }
  }

  private executeMCode(mCode: string) {
    switch (mCode) {
      case GCodeCommandType.SPINDLE_ON_CW:
        this.state.spindleOn = true;
        this.state.spindleDirection = 'cw';
        if (this.state.motionType === MotionType.FEED) {
          this.state.isCutting = true;
        }
        break;
      case GCodeCommandType.SPINDLE_ON_CCW:
        this.state.spindleOn = true;
        this.state.spindleDirection = 'ccw';
        if (this.state.motionType === MotionType.FEED) {
          this.state.isCutting = true;
        }
        break;
      case GCodeCommandType.SPINDLE_OFF:
        this.state.spindleOn = false;
        this.state.isCutting = false;
        break;
      case GCodeCommandType.COOLANT_ON:
        this.state.coolantOn = true;
        break;
      case GCodeCommandType.COOLANT_OFF:
        this.state.coolantOn = false;
        break;
    }
  }

  private applyMotionWords(line: GCodeLine) {
    const xWord = line.words.find((w) => w.letter === 'X');
    const yWord = line.words.find((w) => w.letter === 'Y');
    const zWord = line.words.find((w) => w.letter === 'Z');
    const fWord = line.words.find((w) => w.letter === 'F');
    const sWord = line.words.find((w) => w.letter === 'S');
    const iWord = line.words.find((w) => w.letter === 'I');
    const jWord = line.words.find((w) => w.letter === 'J');
    const kWord = line.words.find((w) => w.letter === 'K');

    if (fWord) this.state.feedRate = fWord.value;
    if (sWord) this.state.spindleSpeed = sWord.value;

    if (xWord || yWord || zWord) {
      const target = this.calculateTarget(xWord, yWord, zWord);
      this.createMotionSegment(target, line, iWord, jWord, kWord);
    }
  }

  private calculateTarget(xWord?: GCodeWord, yWord?: GCodeWord, zWord?: GCodeWord): Point3D {
    const target = { ...this.state.position };

    if (this.state.coordinateMode === 'absolute') {
      if (xWord) target.x = xWord.value;
      if (yWord) target.y = yWord.value;
      if (zWord) target.z = zWord.value;
    } else {
      if (xWord) target.x += xWord.value;
      if (yWord) target.y += yWord.value;
      if (zWord) target.z += zWord.value;
    }

    return target;
  }

  private createMotionSegment(
    target: Point3D,
    line: GCodeLine,
    iWord?: GCodeWord,
    jWord?: GCodeWord,
    kWord?: GCodeWord
  ) {
    const startPoint = { ...this.state.position };
    const isArc = this.state.motionType === MotionType.ARC_CW || this.state.motionType === MotionType.ARC_CCW;

    let center: Point3D | undefined;
    let radius: number | undefined;

    if (isArc && (iWord || jWord || kWord)) {
      center = {
        x: startPoint.x + (iWord?.value || 0),
        y: startPoint.y + (jWord?.value || 0),
        z: startPoint.z + (kWord?.value || 0),
      };
      radius = Math.sqrt(
        Math.pow(target.x - center.x, 2) +
        Math.pow(target.y - center.y, 2) +
        Math.pow(target.z - center.z, 2)
      );
    }

    const segment: MotionSegment = {
      id: this.segmentIdCounter++,
      type: this.state.motionType === MotionType.RAPID ? MotionType.RAPID :
            this.state.motionType === MotionType.FEED ? MotionType.FEED :
            this.state.motionType,
      startPoint,
      endPoint: { ...target },
      center,
      radius,
      feedRate: this.state.feedRate,
      spindleSpeed: this.state.spindleSpeed,
      isCutting: this.state.isCutting,
      lineNumber: line.lineNumber,
      gCode: line.gCommands[0] || '',
    };

    this.segments.push(segment);
    this.state.position = { ...target };
  }

  private applyOffset(line: GCodeLine) {
    const xWord = line.words.find((w) => w.letter === 'X');
    const yWord = line.words.find((w) => w.letter === 'Y');
    const zWord = line.words.find((w) => w.letter === 'Z');

    if (xWord) this.state.offset.x = xWord.value;
    if (yWord) this.state.offset.y = yWord.value;
    if (zWord) this.state.offset.z = zWord.value;
  }

  private calculateMetadata() {
    const allPoints = this.segments.flatMap((s) => [s.startPoint, s.endPoint]);
    
    const min = {
      x: Math.min(...allPoints.map((p) => p.x)),
      y: Math.min(...allPoints.map((p) => p.y)),
      z: Math.min(...allPoints.map((p) => p.z)),
    };
    
    const max = {
      x: Math.max(...allPoints.map((p) => p.x)),
      y: Math.max(...allPoints.map((p) => p.y)),
      z: Math.max(...allPoints.map((p) => p.z)),
    };

    let totalDistance = 0;
    let cuttingDistance = 0;
    let rapidDistance = 0;
    let estimatedTime = 0;

    for (const segment of this.segments) {
      const dist = this.calculateSegmentDistance(segment);
      totalDistance += dist;

      if (segment.type === MotionType.RAPID) {
        rapidDistance += dist;
        estimatedTime += dist / 500;
      } else {
        if (segment.isCutting) {
          cuttingDistance += dist;
        }
        const feed = segment.feedRate || 100;
        estimatedTime += dist / feed * 60;
      }
    }

    return {
      totalLines: this.lines.length,
      totalSegments: this.segments.length,
      boundingBox: { min, max },
      totalDistance: parseFloat(totalDistance.toFixed(3)),
      cuttingDistance: parseFloat(cuttingDistance.toFixed(3)),
      rapidDistance: parseFloat(rapidDistance.toFixed(3)),
      estimatedTime: Math.ceil(estimatedTime),
    };
  }

  private calculateSegmentDistance(segment: MotionSegment): number {
    if (segment.type === MotionType.ARC_CW || segment.type === MotionType.ARC_CCW) {
      if (segment.radius) {
        const angle = this.calculateArcAngle(segment);
        return Math.abs(segment.radius * angle);
      }
    }
    
    return Math.sqrt(
      Math.pow(segment.endPoint.x - segment.startPoint.x, 2) +
      Math.pow(segment.endPoint.y - segment.startPoint.y, 2) +
      Math.pow(segment.endPoint.z - segment.startPoint.z, 2)
    );
  }

  private calculateArcAngle(segment: MotionSegment): number {
    if (!segment.center) return Math.PI;
    
    const startAngle = Math.atan2(
      segment.startPoint.y - segment.center.y,
      segment.startPoint.x - segment.center.x
    );
    const endAngle = Math.atan2(
      segment.endPoint.y - segment.center.y,
      segment.endPoint.x - segment.center.x
    );

    let angle = endAngle - startAngle;
    if (segment.type === MotionType.ARC_CW) {
      if (angle > 0) angle -= 2 * Math.PI;
    } else {
      if (angle < 0) angle += 2 * Math.PI;
    }

    return angle;
  }

  getState(): ParserState {
    return { ...this.state };
  }

  getSegments(): MotionSegment[] {
    return [...this.segments];
  }
}
