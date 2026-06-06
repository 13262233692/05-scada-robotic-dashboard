<template>
  <div class="trajectory-viewer">
    <div class="viewer-header">
      <h3>刀具运动轨迹</h3>
      <div class="viewer-controls">
        <button @click="resetView" title="重置视图">
          <span>⟳</span> 重置
        </button>
        <button @click="zoomIn" title="放大">+</button>
        <button @click="zoomOut" title="缩小">−</button>
        <span class="scale-label">缩放: {{ (scale * 100).toFixed(0) }}%</span>
      </div>
    </div>
    
    <div class="canvas-container" ref="containerRef">
      <canvas
        ref="canvasRef"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @wheel="onWheel"
      ></canvas>
      
      <div class="coords-display" v-if="mouseCoords">
        X: {{ mouseCoords.x.toFixed(2) }}  Y: {{ mouseCoords.y.toFixed(2) }}
      </div>
      
      <div class="legend">
        <div class="legend-item">
          <span class="legend-line cutting"></span>
          <span>走刀 (切削)</span>
        </div>
        <div class="legend-item">
          <span class="legend-line rapid"></span>
          <span>空切 (快速定位)</span>
        </div>
        <div class="legend-item">
          <span class="legend-point current"></span>
          <span>当前位置</span>
        </div>
      </div>
    </div>
    
    <div class="bounds-info" v-if="bounds">
      <span>X: [{{ bounds.minX.toFixed(1) }}, {{ bounds.maxX.toFixed(1) }}]</span>
      <span>Y: [{{ bounds.minY.toFixed(1) }}, {{ bounds.maxY.toFixed(1) }}]</span>
      <span>Z: [{{ bounds.minZ.toFixed(1) }}, {{ bounds.maxZ.toFixed(1) }}]</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { MotionSegment } from '../types/gcode';
import { generateArcPoints, estimateBounds } from '../services/gcodeService';
import { MotionType } from '../types/gcode';

const props = defineProps<{
  segments: MotionSegment[];
  progress: number;
  highlightSegmentId?: number;
}>();

const canvasRef = ref<HTMLCanvasElement>();
const containerRef = ref<HTMLDivElement>();
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const mouseCoords = ref<{ x: number; y: number } | null>(null);

const bounds = computed(() => {
  if (props.segments.length === 0) return null;
  return estimateBounds(props.segments);
});

const COLORS = {
  cutting: '#00ff88',
  rapid: '#ffcc00',
  current: '#ff4757',
  grid: '#1a2332',
  axis: '#2a3a52',
  axisLabel: '#8b9bb4',
  background: '#0a0e17',
};

let ctx: CanvasRenderingContext2D | null = null;
let animationId: number | null = null;

function initCanvas() {
  if (!canvasRef.value || !containerRef.value) return;
  
  const container = containerRef.value;
  const canvas = canvasRef.value;
  const dpr = window.devicePixelRatio || 1;
  
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  
  ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
  
  fitToView();
}

function fitToView() {
  if (!bounds.value || !containerRef.value) return;
  
  const container = containerRef.value;
  const rect = container.getBoundingClientRect();
  const padding = 60;
  
  const rangeX = bounds.value.maxX - bounds.value.minX;
  const rangeY = bounds.value.maxY - bounds.value.minY;
  const centerX = (bounds.value.minX + bounds.value.maxX) / 2;
  const centerY = (bounds.value.minY + bounds.value.maxY) / 2;
  
  const scaleX = (rect.width - padding * 2) / rangeX;
  const scaleY = (rect.height - padding * 2) / rangeY;
  
  scale.value = Math.min(scaleX, scaleY, 5);
  offsetX.value = rect.width / 2 - centerX * scale.value;
  offsetY.value = rect.height / 2 + centerY * scale.value;
  
  requestRender();
}

function worldToScreen(x: number, y: number): { x: number; y: number } {
  return {
    x: x * scale.value + offsetX.value,
    y: -y * scale.value + offsetY.value,
  };
}

function screenToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: (x - offsetX.value) / scale.value,
    y: -(y - offsetY.value) / scale.value,
  };
}

function render() {
  if (!ctx || !containerRef.value || !canvasRef.value) return;
  
  const rect = containerRef.value.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  
  drawGrid(width, height);
  drawAxes(width, height);
  drawToolPath();
  drawCurrentPosition();
}

function drawGrid(width: number, height: number) {
  if (!ctx) return;
  
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  
  const gridSize = 50;
  const startX = Math.floor(offsetX.value % gridSize);
  const startY = Math.floor(offsetY.value % gridSize);
  
  ctx.beginPath();
  for (let x = startX; x < width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = startY; y < height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function drawAxes(width: number, height: number) {
  if (!ctx) return;
  
  const origin = worldToScreen(0, 0);
  
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1.5;
  
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.stroke();
  
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '11px Consolas, monospace';
  
  const tickInterval = 50;
  const worldTickSpacing = tickInterval / scale.value;
  
  for (let wx = -200; wx <= 200; wx += Math.max(10, Math.round(worldTickSpacing * 10) / 10)) {
    const screen = worldToScreen(wx, 0);
    if (screen.x > 0 && screen.x < width) {
      ctx.fillText(wx.toFixed(0), screen.x + 3, origin.y + 14);
    }
  }
  
  for (let wy = -200; wy <= 200; wy += Math.max(10, Math.round(worldTickSpacing * 10) / 10)) {
    const screen = worldToScreen(0, wy);
    if (screen.y > 0 && screen.y < height) {
      ctx.fillText(wy.toFixed(0), origin.x + 5, screen.y - 3);
    }
  }
  
  ctx.fillStyle = '#ff4757';
  ctx.fillText('X', width - 15, origin.y - 5);
  ctx.fillStyle = '#00ff88';
  ctx.fillText('Y', origin.x + 5, 15);
}

function drawToolPath() {
  if (!ctx || props.segments.length === 0) return;
  
  const visibleSegments = Math.floor(props.segments.length * props.progress);
  
  for (let i = 0; i <= visibleSegments && i < props.segments.length; i++) {
    const segment = props.segments[i];
    const color = segment.isCutting ? COLORS.cutting : COLORS.rapid;
    const lineWidth = segment.isCutting ? 2 : 1;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (props.highlightSegmentId === segment.id) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowBlur = 0;
    }
    
    if (segment.type === MotionType.ARC_CW || segment.type === MotionType.ARC_CCW) {
      drawArcSegment(segment);
    } else {
      drawLineSegment(segment);
    }
    
    ctx.shadowBlur = 0;
  }
}

function drawLineSegment(segment: MotionSegment) {
  if (!ctx) return;
  
  const start = worldToScreen(segment.startPoint.x, segment.startPoint.y);
  const end = worldToScreen(segment.endPoint.x, segment.endPoint.y);
  
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawArcSegment(segment: MotionSegment) {
  if (!ctx || !segment.center) {
    drawLineSegment(segment);
    return;
  }
  
  const points = generateArcPoints(
    { x: segment.startPoint.x, y: segment.startPoint.y },
    { x: segment.endPoint.x, y: segment.endPoint.y },
    { x: segment.center.x, y: segment.center.y },
    segment.type === MotionType.ARC_CW
  );
  
  if (points.length < 2) return;
  
  ctx.beginPath();
  const first = worldToScreen(points[0].x, points[0].y);
  ctx.moveTo(first.x, first.y);
  
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(points[i].x, points[i].y);
    ctx.lineTo(p.x, p.y);
  }
  
  ctx.stroke();
}

function drawCurrentPosition() {
  if (!ctx || props.segments.length === 0) return;
  
  const visibleSegments = Math.floor(props.segments.length * props.progress);
  const currentIdx = Math.min(visibleSegments, props.segments.length - 1);
  const segment = props.segments[currentIdx];
  
  let currentPoint;
  if (props.progress >= 1) {
    currentPoint = segment.endPoint;
  } else {
    const segmentProgress = (props.segments.length * props.progress) % 1;
    currentPoint = {
      x: segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * segmentProgress,
      y: segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * segmentProgress,
    };
  }
  
  const pos = worldToScreen(currentPoint.x, currentPoint.y);
  
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.current;
  ctx.shadowColor = COLORS.current;
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;
  
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.current;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function requestRender() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  animationId = requestAnimationFrame(render);
}

function onMouseDown(e: MouseEvent) {
  isDragging.value = true;
  dragStart.value = { x: e.clientX - offsetX.value, y: e.clientY - offsetY.value };
}

function onMouseMove(e: MouseEvent) {
  if (!containerRef.value) return;
  
  const rect = containerRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  mouseCoords.value = screenToWorld(x, y);
  
  if (isDragging.value) {
    offsetX.value = e.clientX - dragStart.value.x;
    offsetY.value = e.clientY - dragStart.value.y;
    requestRender();
  }
}

function onMouseUp() {
  isDragging.value = false;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const worldBefore = screenToWorld(mouseX, mouseY);
  
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  scale.value = Math.max(0.1, Math.min(20, scale.value * zoomFactor));
  
  const worldAfter = screenToWorld(mouseX, mouseY);
  
  offsetX.value += (worldAfter.x - worldBefore.x) * scale.value;
  offsetY.value -= (worldAfter.y - worldBefore.y) * scale.value;
  
  requestRender();
}

function zoomIn() {
  scale.value = Math.min(20, scale.value * 1.3);
  requestRender();
}

function zoomOut() {
  scale.value = Math.max(0.1, scale.value / 1.3);
  requestRender();
}

function resetView() {
  fitToView();
}

function handleResize() {
  initCanvas();
}

watch(() => props.segments, () => {
  if (props.progress >= 1) {
    fitToView();
  } else {
    requestRender();
  }
}, { deep: true });

watch(() => props.progress, () => {
  requestRender();
});

watch(() => props.highlightSegmentId, () => {
  requestRender();
});

onMounted(() => {
  initCanvas();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
});
</script>

<style scoped>
.trajectory-viewer {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.viewer-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.viewer-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.viewer-controls button {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.viewer-controls button:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.scale-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: Consolas, monospace;
}

.canvas-container {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background: var(--bg-primary);
  cursor: grab;
}

.canvas-container:active {
  cursor: grabbing;
}

canvas {
  display: block;
}

.coords-display {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(10, 14, 23, 0.9);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: Consolas, monospace;
  color: var(--accent-blue);
  border: 1px solid var(--border-color);
}

.legend {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(10, 14, 23, 0.9);
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-line {
  width: 24px;
  height: 2px;
  border-radius: 1px;
}

.legend-line.cutting {
  background: var(--accent-green);
}

.legend-line.rapid {
  background: var(--accent-yellow);
}

.legend-point {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-red);
  box-shadow: 0 0 6px var(--accent-red);
}

.bounds-info {
  display: flex;
  gap: 20px;
  padding-top: 8px;
  font-size: 11px;
  font-family: Consolas, monospace;
  color: var(--text-secondary);
}
</style>
