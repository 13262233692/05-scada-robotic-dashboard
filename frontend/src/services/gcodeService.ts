import type { GCodeParseResult, GCodeParseMetadata, MotionSegment } from '../types/gcode';

const API_BASE = 'http://localhost:3000';

export async function parseGCodeContent(content: string, filename?: string): Promise<GCodeParseResult> {
  try {
    const response = await fetch(`${API_BASE}/gcode/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, filename }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function uploadGCodeFile(file: File): Promise<GCodeParseResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/gcode/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data.result,
      filename: data.filename,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getParseHistory(): Promise<any[]> {
  try {
    const response = await fetch(`${API_BASE}/gcode/history`);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

export function generateArcPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
  clockwise: boolean,
  segments: number = 50
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

  let deltaAngle = endAngle - startAngle;
  if (clockwise) {
    if (deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  } else {
    if (deltaAngle < 0) deltaAngle += 2 * Math.PI;
  }

  const numSegments = Math.max(
    3,
    Math.min(segments, Math.ceil(Math.abs(deltaAngle) * 10))
  );

  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const angle = startAngle + deltaAngle * t;
    const radius = Math.sqrt(
      Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2)
    );
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }

  return points;
}

export function flattenSegmentsToPaths(segments: MotionSegment[]): {
  cuttingPaths: MotionSegment[];
  rapidPaths: MotionSegment[];
  allPaths: MotionSegment[];
} {
  const cuttingPaths: MotionSegment[] = [];
  const rapidPaths: MotionSegment[] = [];

  for (const segment of segments) {
    if (segment.isCutting) {
      cuttingPaths.push(segment);
    } else {
      rapidPaths.push(segment);
    }
  }

  return { cuttingPaths, rapidPaths, allPaths: segments };
}

export function estimateBounds(
  segments: MotionSegment[]
): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;

  for (const seg of segments) {
    minX = Math.min(minX, seg.startPoint.x, seg.endPoint.x);
    maxX = Math.max(maxX, seg.startPoint.x, seg.endPoint.x);
    minY = Math.min(minY, seg.startPoint.y, seg.endPoint.y);
    maxY = Math.max(maxY, seg.startPoint.y, seg.endPoint.y);
    minZ = Math.min(minZ, seg.startPoint.z, seg.endPoint.z);
    maxZ = Math.max(maxZ, seg.startPoint.z, seg.endPoint.z);
  }

  if (!isFinite(minX)) {
    minX = -100;
    maxX = 100;
    minY = -100;
    maxY = 100;
    minZ = -50;
    maxZ = 50;
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}
