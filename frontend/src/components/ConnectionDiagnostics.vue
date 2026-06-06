<template>
  <div class="connection-panel">
    <div class="panel-header">
      <h3>连接状态诊断</h3>
      <div class="status-badge" :class="statusClass">
        <span class="badge-dot"></span>
        <span>{{ statusText }}</span>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-item">
        <span class="metric-label">连接状态</span>
        <span class="metric-value" :class="statusClass">{{ statusText }}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">重连尝试</span>
        <span class="metric-value">{{ diagnostics.reconnectAttempt }}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">连续失败</span>
        <span class="metric-value" :class="failuresClass">{{ diagnostics.consecutiveFailures }}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">下次重连</span>
        <span class="metric-value">{{ nextRetryText }}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">数据频率</span>
        <span class="metric-value accent-blue">{{ diagnostics.updateFrequency }} Hz</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">在线机械臂</span>
        <span class="metric-value accent-green">{{ diagnostics.connectedArms }}</span>
      </div>
    </div>

    <div v-if="diagnostics.circuitOpen" class="circuit-warning">
      <div class="warning-icon">⚠️</div>
      <div class="warning-content">
        <p class="warning-title">熔断器已触发</p>
        <p class="warning-desc">
          检测到连续连接失败，已暂停自动重连。
          剩余冷却时间: <strong>{{ circuitCooldownText }}</strong>
        </p>
        <button class="reset-btn" @click="$emit('resetCircuit')">
          手动重置熔断器
        </button>
      </div>
    </div>

    <div v-if="diagnostics.status === 'reconnecting'" class="reconnect-progress">
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>
      <span class="progress-text">正在重连中... {{ nextRetrySeconds }}s</span>
    </div>

    <div class="action-buttons">
      <button
        class="btn btn-secondary"
        @click="$emit('manualReconnect')"
        :disabled="diagnostics.status === 'connecting'"
      >
        手动重连
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  diagnostics: {
    status: string;
    reconnectAttempt: number;
    consecutiveFailures: number;
    nextReconnectInMs: number;
    circuitOpen: boolean;
    circuitRemainingMs: number;
    updateFrequency: number;
    connectedArms: number;
  };
}>();

defineEmits<{
  (e: 'manualReconnect'): void;
  (e: 'resetCircuit'): void;
}>();

const statusClass = computed(() => {
  switch (props.diagnostics.status) {
    case 'connected':
      return 'success';
    case 'connecting':
    case 'reconnecting':
      return 'warning';
    case 'circuit_open':
      return 'error';
    default:
      return 'muted';
  }
});

const statusText = computed(() => {
  const map: Record<string, string> = {
    connected: '已连接',
    connecting: '连接中',
    reconnecting: '重连中',
    disconnected: '已断开',
    circuit_open: '熔断器触发',
  };
  return map[props.diagnostics.status] || props.diagnostics.status;
});

const failuresClass = computed(() => {
  if (props.diagnostics.consecutiveFailures >= 8) return 'error';
  if (props.diagnostics.consecutiveFailures >= 4) return 'warning';
  return '';
});

const nextRetrySeconds = computed(() => {
  return Math.ceil(props.diagnostics.nextReconnectInMs / 1000);
});

const nextRetryText = computed(() => {
  if (props.diagnostics.circuitOpen) return '已暂停';
  if (props.diagnostics.status === 'reconnecting') {
    return `${nextRetrySeconds.value}s 后`;
  }
  if (props.diagnostics.status === 'connected') return '-';
  return '等待中';
});

const circuitCooldownText = computed(() => {
  const remaining = Math.ceil(props.diagnostics.circuitRemainingMs / 1000);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

const progressPercent = computed(() => {
  if (props.diagnostics.status !== 'reconnecting') return 0;
  const total = 45000;
  return Math.min(100, ((total - props.diagnostics.nextReconnectInMs) / total) * 100);
});
</script>

<style scoped>
.connection-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(42, 58, 82, 0.5);
  border-radius: 12px;
  font-size: 11px;
}

.status-badge.success {
  background: rgba(0, 255, 136, 0.1);
  color: var(--accent-green);
}

.status-badge.warning {
  background: rgba(255, 204, 0, 0.1);
  color: var(--accent-yellow);
}

.status-badge.error {
  background: rgba(255, 71, 87, 0.1);
  color: var(--accent-red);
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.status-badge.success .badge-dot {
  background: var(--accent-green);
  animation: pulse 2s infinite;
}

.status-badge.warning .badge-dot {
  background: var(--accent-yellow);
  animation: pulse 1s infinite;
}

.status-badge.error .badge-dot {
  background: var(--accent-red);
  animation: fastBlink 0.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes fastBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.metric-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 13px;
  font-weight: 600;
  font-family: 'Consolas', monospace;
}

.metric-value.success {
  color: var(--accent-green);
}

.metric-value.warning {
  color: var(--accent-yellow);
}

.metric-value.error {
  color: var(--accent-red);
}

.metric-value.accent-blue {
  color: var(--accent-blue);
}

.metric-value.accent-green {
  color: var(--accent-green);
}

.circuit-warning {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid var(--accent-red);
  border-radius: 6px;
  margin-bottom: 12px;
}

.warning-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
}

.warning-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-red);
  margin-bottom: 4px;
}

.warning-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
}

.warning-desc strong {
  color: var(--accent-yellow);
}

.reset-btn {
  background: var(--accent-red);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.reset-btn:hover {
  opacity: 0.9;
}

.reconnect-progress {
  margin-bottom: 12px;
}

.progress-bar {
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-blue), var(--accent-green));
  transition: width 0.1s linear;
}

.progress-text {
  font-size: 10px;
  color: var(--text-secondary);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  border-color: var(--border-color);
  color: var(--text-primary);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}
</style>
