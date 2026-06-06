<template>
  <div class="playback-controls">
    <div class="controls-row">
      <div class="transport-buttons">
        <button @click="skipToStart" :disabled="!hasSegments" title="跳到开始">
          ⏮
        </button>
        <button @click="stepBackward" :disabled="!hasSegments || currentIndex === 0" title="上一段">
          ◀◀
        </button>
        <button class="play-btn" @click="togglePlay" :disabled="!hasSegments">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button @click="stepForward" :disabled="!hasSegments || currentIndex >= totalSegments - 1" title="下一段">
          ▶▶
        </button>
        <button @click="skipToEnd" :disabled="!hasSegments" title="跳到结束">
          ⏭
        </button>
      </div>

      <div class="speed-control">
        <span class="speed-label">速度:</span>
        <select v-model="playbackSpeed" class="speed-select">
          <option :value="0.25">0.25x</option>
          <option :value="0.5">0.5x</option>
          <option :value="1">1x</option>
          <option :value="2">2x</option>
          <option :value="4">4x</option>
          <option :value="8">8x</option>
        </select>
      </div>

      <div class="position-info">
        <span class="current-seg">{{ currentIndex + 1 }}</span>
        <span class="sep">/</span>
        <span class="total-seg">{{ totalSegments }}</span>
        <span class="unit">段</span>
      </div>
    </div>

    <div class="progress-container" ref="progressContainerRef">
      <div
        class="progress-track"
        @mousedown="onProgressMouseDown"
        @mousemove="onProgressMouseMove"
        @mouseup="onProgressMouseUp"
        @mouseleave="onProgressMouseUp"
      >
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: (progress * 100) + '%' }"></div>
          <div
            class="progress-thumb"
            :style="{ left: (progress * 100) + '%' }"
          ></div>
        </div>

        <div class="segment-markers">
          <div
            v-for="(seg, idx) in displaySegments"
            :key="seg.id"
            class="segment-marker"
            :class="{ cutting: seg.isCutting, active: idx < currentIndex }"
            :style="{ left: (idx / totalSegments * 100) + '%' }"
            :title="`段 ${idx + 1}: ${seg.gCode} ${seg.isCutting ? '(切削)' : '(空切)'}`"
          ></div>
        </div>
      </div>

      <div v-if="hoverSegment !== null" class="hover-tooltip" :style="{ left: tooltipLeft + 'px' }">
        <div class="tooltip-title">段 {{ hoverSegment + 1 }}</div>
        <div class="tooltip-row">
          <span>指令:</span>
          <span class="code">{{ displaySegments[hoverSegment]?.gCode }}</span>
        </div>
        <div class="tooltip-row">
          <span>类型:</span>
          <span :class="displaySegments[hoverSegment]?.isCutting ? 'cutting' : 'rapid'">
            {{ displaySegments[hoverSegment]?.isCutting ? '切削走刀' : '快速空切' }}
          </span>
        </div>
        <div class="tooltip-row">
          <span>行号:</span>
          <span>N{{ displaySegments[hoverSegment]?.lineNumber }}</span>
        </div>
      </div>
    </div>

    <div class="time-info" v-if="metadata">
      <div class="time-item">
        <span class="time-label">预计加工时间</span>
        <span class="time-value">{{ formatTime(metadata.estimatedTime) }}</span>
      </div>
      <div class="time-item">
        <span class="time-label">总距离</span>
        <span class="time-value">{{ metadata.totalDistance.toFixed(2) }} mm</span>
      </div>
      <div class="time-item">
        <span class="time-label">切削距离</span>
        <span class="time-value cutting">{{ metadata.cuttingDistance.toFixed(2) }} mm</span>
      </div>
      <div class="time-item">
        <span class="time-label">空切距离</span>
        <span class="time-value rapid">{{ metadata.rapidDistance.toFixed(2) }} mm</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import type { MotionSegment, GCodeParseMetadata } from '../types/gcode';

const props = defineProps<{
  segments: MotionSegment[];
  metadata?: GCodeParseMetadata | null;
  modelValue: number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'highlight', segmentId: number | undefined): void;
}>();

const isPlaying = ref(false);
const playbackSpeed = ref(1);
const currentIndex = ref(0);
const hoverSegment = ref<number | null>(null);
const tooltipLeft = ref(0);
const isDragging = ref(false);
const progressContainerRef = ref<HTMLDivElement>();

let playInterval: number | null = null;

const progress = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const totalSegments = computed(() => props.segments.length);
const hasSegments = computed(() => totalSegments.value > 0);

const displaySegments = computed(() => {
  return props.segments.slice(0, Math.min(200, totalSegments.value));
});

watch(() => props.modelValue, (val) => {
  currentIndex.value = Math.min(
    Math.floor(val * totalSegments.value),
    totalSegments.value - 1
  );
});

watch(() => props.segments, () => {
  currentIndex.value = 0;
  if (isPlaying.value) {
    stopPlayback();
  }
});

function togglePlay() {
  if (isPlaying.value) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (totalSegments.value === 0) return;
  
  if (currentIndex.value >= totalSegments.value - 1) {
    currentIndex.value = 0;
    progress.value = 0;
  }
  
  isPlaying.value = true;
  
  const baseInterval = 100;
  const interval = baseInterval / playbackSpeed.value;
  
  playInterval = window.setInterval(() => {
    if (currentIndex.value < totalSegments.value - 1) {
      currentIndex.value++;
      progress.value = currentIndex.value / totalSegments.value;
      emit('highlight', props.segments[currentIndex.value]?.id);
    } else {
      stopPlayback();
    }
  }, interval);
}

function stopPlayback() {
  isPlaying.value = false;
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
}

function stepForward() {
  if (currentIndex.value < totalSegments.value - 1) {
    currentIndex.value++;
    progress.value = currentIndex.value / totalSegments.value;
    emit('highlight', props.segments[currentIndex.value]?.id);
  }
}

function stepBackward() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
    progress.value = currentIndex.value / totalSegments.value;
    emit('highlight', props.segments[currentIndex.value]?.id);
  }
}

function skipToStart() {
  currentIndex.value = 0;
  progress.value = 0;
  emit('highlight', undefined);
}

function skipToEnd() {
  currentIndex.value = Math.max(0, totalSegments.value - 1);
  progress.value = 1;
  emit('highlight', props.segments[currentIndex.value]?.id);
}

function onProgressMouseDown(e: MouseEvent) {
  isDragging.value = true;
  updateProgressFromMouse(e);
}

function onProgressMouseMove(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percent = Math.max(0, Math.min(1, x / rect.width));
  const segIndex = Math.floor(percent * displaySegments.value.length);
  
  if (segIndex >= 0 && segIndex < displaySegments.value.length) {
    hoverSegment.value = segIndex;
    tooltipLeft.value = Math.min(x, rect.width - 180);
  } else {
    hoverSegment.value = null;
  }
  
  if (isDragging.value) {
    updateProgressFromMouse(e);
  }
}

function onProgressMouseUp() {
  isDragging.value = false;
}

function updateProgressFromMouse(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percent = Math.max(0, Math.min(1, x / rect.width));
  
  progress.value = percent;
  currentIndex.value = Math.floor(percent * totalSegments.value);
  emit('highlight', props.segments[currentIndex.value]?.id);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

watch(playbackSpeed, () => {
  if (isPlaying.value) {
    stopPlayback();
    startPlayback();
  }
});

onUnmounted(() => {
  stopPlayback();
});
</script>

<style scoped>
.playback-controls {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 12px;
}

.transport-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.transport-buttons button {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  width: 32px;
  height: 32px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.transport-buttons button:hover:not(:disabled) {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.transport-buttons button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.play-btn {
  width: 40px !important;
  height: 40px !important;
  font-size: 16px !important;
  background: var(--accent-blue) !important;
  border-color: var(--accent-blue) !important;
  color: white !important;
}

.play-btn:hover:not(:disabled) {
  background: #00b8e6 !important;
  color: white !important;
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.speed-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.speed-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.position-info {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: Consolas, monospace;
}

.current-seg {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-blue);
}

.sep {
  font-size: 14px;
  color: var(--text-secondary);
}

.total-seg {
  font-size: 14px;
  color: var(--text-secondary);
}

.unit {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.progress-container {
  position: relative;
  margin-bottom: 12px;
}

.progress-track {
  position: relative;
  height: 32px;
  cursor: pointer;
  padding: 12px 0;
}

.progress-bar {
  position: relative;
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: visible;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-blue), var(--accent-green));
  border-radius: 3px;
  transition: width 0.05s linear;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  background: white;
  border: 2px solid var(--accent-blue);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: left 0.05s linear;
}

.segment-markers {
  position: absolute;
  top: 12px;
  left: 0;
  right: 0;
  height: 6px;
  pointer-events: none;
}

.segment-marker {
  position: absolute;
  top: 0;
  width: 2px;
  height: 6px;
  background: var(--border-color);
  transition: background 0.2s;
}

.segment-marker.active {
  background: var(--accent-blue);
}

.segment-marker.cutting {
  background: var(--accent-green);
}

.segment-marker.cutting.active {
  background: var(--accent-green);
  box-shadow: 0 0 4px var(--accent-green);
}

.hover-tooltip {
  position: absolute;
  top: -80px;
  transform: translateX(-50%);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 11px;
  pointer-events: none;
  z-index: 10;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tooltip-title {
  font-weight: 600;
  color: var(--accent-blue);
  margin-bottom: 6px;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
}

.tooltip-row span:first-child {
  color: var(--text-secondary);
}

.code {
  font-family: Consolas, monospace;
  color: var(--accent-yellow);
}

.cutting {
  color: var(--accent-green) !important;
}

.rapid {
  color: var(--accent-yellow) !important;
}

.time-info {
  display: flex;
  gap: 24px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.time-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.time-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.time-value {
  font-size: 13px;
  font-weight: 600;
  font-family: Consolas, monospace;
}

.time-value.cutting {
  color: var(--accent-green);
}

.time-value.rapid {
  color: var(--accent-yellow);
}
</style>
