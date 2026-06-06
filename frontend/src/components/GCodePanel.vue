<template>
  <div class="gcode-panel">
    <div class="panel-header">
      <h3>G代码解析</h3>
      <div class="header-actions">
        <button @click="loadDemo" :disabled="loading" class="demo-btn">
          加载示例
        </button>
      </div>
    </div>

    <div class="upload-area" @click="triggerFileInput" @dragover.prevent="onDragOver" @drop.prevent="onDrop">
      <input
        ref="fileInputRef"
        type="file"
        accept=".nc,.gcode,.txt,.tap"
        @change="onFileSelected"
        style="display: none"
      />
      <div class="upload-content">
        <div class="upload-icon">📄</div>
        <p class="upload-text">
          {{ dragOver ? '松开上传文件' : '点击或拖拽 G代码文件到此处' }}
        </p>
        <p class="upload-hint">支持 .nc, .gcode, .txt, .tap 格式</p>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>正在解析 G代码...</span>
    </div>

    <div v-if="error" class="error-state">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ error }}</span>
    </div>

    <div v-if="parseResult && parseResult.success" class="result-info">
      <div class="result-header">
        <span class="filename">{{ currentFilename }}</span>
        <span class="status success">解析成功</span>
      </div>
      <div class="result-stats">
        <div class="stat">
          <span class="stat-label">代码行</span>
          <span class="stat-value">{{ parseResult.metadata?.totalLines }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">运动段</span>
          <span class="stat-value">{{ parseResult.metadata?.totalSegments }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">总距离</span>
          <span class="stat-value">{{ parseResult.metadata?.totalDistance.toFixed(1) }}mm</span>
        </div>
        <div class="stat">
          <span class="stat-label">预计时间</span>
          <span class="stat-value">{{ formatTime(parseResult.metadata?.estimatedTime || 0) }}</span>
        </div>
      </div>
    </div>

    <div v-if="history.length > 0" class="history-section">
      <h4>历史记录</h4>
      <div class="history-list">
        <div
          v-for="item in history.slice(0, 5)"
          :key="item.id"
          class="history-item"
        >
          <span class="history-name">{{ item.filename }}</span>
          <span class="history-time">{{ formatDate(item.uploadTime) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { GCodeParseResult } from '../types/gcode';
import { parseGCodeContent, uploadGCodeFile, getParseHistory } from '../services/gcodeService';

const emit = defineEmits<{
  (e: 'parsed', result: GCodeParseResult): void;
}>();

const fileInputRef = ref<HTMLInputElement>();
const loading = ref(false);
const error = ref<string | null>(null);
const dragOver = ref(false);
const parseResult = ref<GCodeParseResult | null>(null);
const currentFilename = ref('');
const history = ref<any[]>([]);

const DEMO_GCODE = `%
O0001 (DEMO PROGRAM - SQUARE POCKET)
G90 G94 G17 G21
G54
S3000 M03
G00 Z5.0
G00 X0 Y0

G01 Z-2.0 F100
G01 X50.0 F200
G01 Y50.0
G01 X0
G01 Y0

G00 Z5.0
G00 X60 Y0
G01 Z-1.5 F100
G02 X100 Y0 I20 J0 F150

G00 Z20.0
G00 X0 Y0
M05
M30
%`;

function triggerFileInput() {
  fileInputRef.value?.click();
}

function onDragOver() {
  dragOver.value = true;
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleFile(files[0]);
  }
}

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    handleFile(files[0]);
  }
}

async function handleFile(file: File) {
  loading.value = true;
  error.value = null;
  currentFilename.value = file.name;

  try {
    const result = await uploadGCodeFile(file);
    
    if (result.success) {
      parseResult.value = result;
      emit('parsed', result);
      loadHistory();
    } else {
      error.value = result.error || '解析失败';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败';
  } finally {
    loading.value = false;
  }
}

async function loadDemo() {
  loading.value = true;
  error.value = null;
  currentFilename.value = 'demo-square-pocket.nc';

  try {
    const result = await parseGCodeContent(DEMO_GCODE, 'demo-square-pocket.nc');
    
    if (result.success) {
      parseResult.value = result;
      emit('parsed', result);
    } else {
      error.value = result.error || '解析失败';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '解析失败';
  } finally {
    loading.value = false;
  }
}

async function loadHistory() {
  history.value = await getParseHistory();
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(() => {
  loadHistory();
});
</script>

<style scoped>
.gcode-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.demo-btn {
  background: var(--accent-blue);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.demo-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.demo-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.upload-area {
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-area:hover {
  border-color: var(--accent-blue);
  background: rgba(0, 212, 255, 0.05);
}

.upload-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.upload-text {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid var(--accent-red);
  border-radius: 6px;
}

.error-icon {
  font-size: 18px;
}

.error-text {
  font-size: 12px;
  color: var(--accent-red);
}

.result-info {
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 12px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.filename {
  font-size: 12px;
  font-weight: 500;
  font-family: Consolas, monospace;
  color: var(--accent-blue);
}

.status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status.success {
  background: rgba(0, 255, 136, 0.1);
  color: var(--accent-green);
}

.result-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  font-family: Consolas, monospace;
}

.history-section {
  margin-top: auto;
}

.history-section h4 {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 11px;
}

.history-name {
  font-family: Consolas, monospace;
  color: var(--text-primary);
}

.history-time {
  color: var(--text-secondary);
}
</style>
