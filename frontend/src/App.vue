<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="header-left">
        <h1>SCADA 监控系统</h1>
        <div class="tabs">
          <button
            :class="{ active: activeTab === 'robotic' }"
            @click="activeTab = 'robotic'"
          >
            🦾 机械臂阵列
          </button>
          <button
            :class="{ active: activeTab === 'gcode' }"
            @click="activeTab = 'gcode'"
          >
            🔧 G代码监控
          </button>
        </div>
      </div>
      <div class="header-right">
        <div class="status-badge" :class="connectionBadgeClass">
          <span class="badge-dot"></span>
          <span>{{ connectionBadgeText }}</span>
        </div>
        <div class="time-display">
          {{ currentTime }}
        </div>
      </div>
    </header>

    <main class="dashboard-main">
      <!-- 机械臂监控视图 -->
      <template v-if="activeTab === 'robotic'">
        <section class="section-top">
          <TopologyDiagram :selected-arm="selectedArm" @select-arm="selectArm" />
        </section>

        <section class="section-bottom">
          <div class="panel-left">
            <div class="panel-stack">
              <StatusPanel :selected-arm="selectedArm" @select-arm="selectArm" />
            </div>
            <div class="panel-stack">
              <ConnectionDiagnostics
                :diagnostics="connectionDiagnostics"
                @manual-reconnect="handleManualReconnect"
                @reset-circuit="handleResetCircuit"
              />
            </div>
          </div>

          <div class="panel-right">
            <template v-if="selectedArm">
              <RealtimeLineChart
                :key="'chart-' + selectedArm"
                :arm-id="selectedArm"
                :title="`机械臂 #${selectedArm} - 实时数据曲线`"
              />
            </template>
            <div v-else class="empty-selection">
              <div class="empty-icon">📊</div>
              <p>请从左侧或拓扑图中选择一台机械臂查看详细数据</p>
            </div>
          </div>
        </section>
      </template>

      <!-- G代码监控视图 -->
      <template v-else-if="activeTab === 'gcode'">
        <section class="gcode-layout">
          <div class="gcode-sidebar">
            <GCodePanel @parsed="handleGCodeParsed" />
          </div>
          
          <div class="gcode-main">
            <div class="viewer-wrapper">
              <TrajectoryViewer
                v-if="gcodeSegments.length > 0"
                :segments="gcodeSegments"
                :progress="playbackProgress"
                :highlight-segment-id="highlightSegmentId"
              />
              <div v-else class="empty-viewer">
                <div class="empty-icon">📐</div>
                <p>上传或加载 G代码文件以查看刀具轨迹</p>
              </div>
            </div>
            
            <div class="playback-wrapper" v-if="gcodeSegments.length > 0">
              <PlaybackControls
                v-model="playbackProgress"
                :segments="gcodeSegments"
                :metadata="gcodeMetadata"
                @highlight="handleSegmentHighlight"
              />
            </div>
          </div>
        </section>
      </template>
    </main>

    <footer class="dashboard-footer">
      <div class="footer-stats">
        <div v-if="activeTab === 'robotic'" class="stat-item">
          <span class="stat-label">数据推送频率</span>
          <span class="stat-value accent-blue">{{ updateFrequency }} Hz</span>
        </div>
        <div v-if="activeTab === 'robotic'" class="stat-item">
          <span class="stat-label">在线机械臂</span>
          <span class="stat-value accent-green">{{ armCount }} / 4</span>
        </div>
        <div v-if="activeTab === 'robotic'" class="stat-item">
          <span class="stat-label">最后更新</span>
          <span class="stat-value">{{ lastUpdateFormatted }}</span>
        </div>
        <div v-if="activeTab === 'robotic'" class="stat-item">
          <span class="stat-label">连续失败</span>
          <span class="stat-value" :class="failuresClass">{{ connectionDiagnostics.consecutiveFailures }}</span>
        </div>
        
        <div v-if="activeTab === 'gcode' && gcodeSegments.length > 0" class="stat-item">
          <span class="stat-label">运动段数</span>
          <span class="stat-value accent-blue">{{ gcodeSegments.length }}</span>
        </div>
        <div v-if="activeTab === 'gcode' && gcodeMetadata" class="stat-item">
          <span class="stat-label">总距离</span>
          <span class="stat-value accent-green">{{ gcodeMetadata.totalDistance.toFixed(1) }} mm</span>
        </div>
        <div v-if="activeTab === 'gcode' && gcodeMetadata" class="stat-item">
          <span class="stat-label">切削距离</span>
          <span class="stat-value">{{ gcodeMetadata.cuttingDistance.toFixed(1) }} mm</span>
        </div>
        <div v-if="activeTab === 'gcode' && gcodeMetadata" class="stat-item">
          <span class="stat-label">预计时间</span>
          <span class="stat-value accent-yellow">{{ formatGCodeTime(gcodeMetadata.estimatedTime) }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { telemetryManager } from './services/telemetryManager';
import type { GCodeParseResult, MotionSegment, GCodeParseMetadata } from './types/gcode';
import TopologyDiagram from './components/TopologyDiagram.vue';
import StatusPanel from './components/StatusPanel.vue';
import RealtimeLineChart from './components/RealtimeLineChart.vue';
import ConnectionDiagnostics from './components/ConnectionDiagnostics.vue';
import GCodePanel from './components/GCodePanel.vue';
import TrajectoryViewer from './components/TrajectoryViewer.vue';
import PlaybackControls from './components/PlaybackControls.vue';

type TabType = 'robotic' | 'gcode';

const activeTab = ref<TabType>('robotic');
const selectedArm = ref<number | null>(null);
const currentTime = ref('');
const diagnosticsTick = ref(0);
let timeInterval: number | null = null;
let diagnosticsInterval: number | null = null;

const gcodeSegments = ref<MotionSegment[]>([]);
const gcodeMetadata = ref<GCodeParseMetadata | null>(null);
const playbackProgress = ref(1);
const highlightSegmentId = ref<number | undefined>(undefined);

const isConnected = computed(() => telemetryManager.isConnected.value);
const updateFrequency = computed(() => telemetryManager.updateFrequency.value);
const armCount = computed(() => telemetryManager.getAllArmIds().length);
const lastUpdateTime = computed(() => telemetryManager.lastUpdateTime.value);

const connectionDiagnostics = computed(() => {
  diagnosticsTick.value;
  return telemetryManager.getDiagnostics();
});

const connectionBadgeClass = computed(() => {
  const status = connectionDiagnostics.value.status;
  if (status === 'connected') return 'connected';
  if (status === 'circuit_open') return 'error';
  if (status === 'reconnecting' || status === 'connecting') return 'warning';
  return '';
});

const connectionBadgeText = computed(() => {
  const map: Record<string, string> = {
    connected: '系统在线',
    connecting: '连接中...',
    reconnecting: '重连中...',
    disconnected: '系统离线',
    circuit_open: '熔断器触发',
  };
  return map[connectionDiagnostics.value.status] || '未知';
});

const failuresClass = computed(() => {
  const f = connectionDiagnostics.value.consecutiveFailures;
  if (f >= 8) return 'accent-red';
  if (f >= 4) return 'accent-yellow';
  return '';
});

const lastUpdateFormatted = computed(() => {
  if (!lastUpdateTime.value) return '--:--:--';
  const date = new Date(lastUpdateTime.value);
  return date.toLocaleTimeString('zh-CN', { hour12: false });
});

function selectArm(armId: number) {
  selectedArm.value = selectedArm.value === armId ? null : armId;
}

function updateTime() {
  currentTime.value = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function handleManualReconnect() {
  telemetryManager.manualReconnect();
}

function handleResetCircuit() {
  telemetryManager.resetCircuitBreaker();
}

function handleGCodeParsed(result: GCodeParseResult) {
  if (result.success && result.segments) {
    gcodeSegments.value = result.segments;
    gcodeMetadata.value = result.metadata || null;
    playbackProgress.value = 1;
  }
}

function handleSegmentHighlight(id: number | undefined) {
  highlightSegmentId.value = id;
}

function formatGCodeTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

onMounted(() => {
  updateTime();
  timeInterval = window.setInterval(updateTime, 1000);
  diagnosticsInterval = window.setInterval(() => {
    diagnosticsTick.value++;
  }, 100);
  telemetryManager.connect();
});

onUnmounted(() => {
  if (timeInterval) clearInterval(timeInterval);
  if (diagnosticsInterval) clearInterval(diagnosticsInterval);
  telemetryManager.disconnect();
});
</script>

<style scoped>
.dashboard {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 32px;
}

.header-left h1 {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-blue);
  letter-spacing: 1px;
}

.tabs {
  display: flex;
  gap: 4px;
}

.tabs button {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.tabs button:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.tabs button.active {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: white;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid var(--accent-red);
  border-radius: 20px;
  font-size: 12px;
  color: var(--accent-red);
}

.status-badge.connected {
  background: rgba(0, 255, 136, 0.1);
  border-color: var(--accent-green);
  color: var(--accent-green);
}

.status-badge.warning {
  background: rgba(255, 204, 0, 0.1);
  border-color: var(--accent-yellow);
  color: var(--accent-yellow);
}

.status-badge.error {
  background: rgba(255, 71, 87, 0.15);
  border-color: var(--accent-red);
  color: var(--accent-red);
  animation: badgePulse 1s infinite;
}

@keyframes badgePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(255, 71, 87, 0); }
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-red);
}

.status-badge.connected .badge-dot {
  background: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
  animation: pulse 2s infinite;
}

.status-badge.warning .badge-dot {
  background: var(--accent-yellow);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.time-display {
  font-family: 'Consolas', monospace;
  font-size: 14px;
  color: var(--text-primary);
}

.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.section-top {
  height: 40%;
  min-height: 0;
}

.section-bottom {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.panel-left {
  width: 320px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-stack {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-stack:first-child {
  flex: 1.2;
}

.panel-right {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.empty-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-selection p {
  font-size: 14px;
}

/* G代码布局 */
.gcode-layout {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.gcode-sidebar {
  width: 300px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.gcode-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.viewer-wrapper {
  flex: 1;
  min-height: 0;
}

.playback-wrapper {
  flex-shrink: 0;
}

.empty-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
}

.empty-viewer .empty-icon {
  font-size: 64px;
}

.dashboard-footer {
  padding: 10px 24px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.footer-stats {
  display: flex;
  gap: 48px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  font-family: 'Consolas', monospace;
  color: var(--text-primary);
}

.stat-value.accent-blue {
  color: var(--accent-blue);
}

.stat-value.accent-green {
  color: var(--accent-green);
}

.stat-value.accent-yellow {
  color: var(--accent-yellow);
}

.stat-value.accent-red {
  color: var(--accent-red);
}
</style>
