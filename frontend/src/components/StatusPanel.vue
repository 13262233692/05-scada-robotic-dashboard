<template>
  <div class="status-panel">
    <div class="panel-header">
      <h3>机械臂状态阵列</h3>
      <div class="connection-status">
        <span class="status-indicator" :class="{ connected: isConnected }"></span>
        <span>{{ isConnected ? '已连接' : '未连接' }}</span>
        <span class="freq">{{ updateFrequency }} Hz</span>
      </div>
    </div>
    
    <div class="arm-grid">
      <div
        v-for="armId in armIds"
        :key="armId"
        class="arm-card"
        :class="{ selected: selectedArm === armId }"
        @click="$emit('selectArm', armId)"
      >
        <div class="arm-header">
          <span class="arm-name">机械臂 #{{ armId }}</span>
          <StatusLights :status="getArmStatus(armId)" />
        </div>
        
        <div class="arm-data">
          <div class="joint-grid">
            <div
              v-for="(joint, idx) in getArmJoints(armId)"
              :key="idx"
              class="joint-item"
            >
              <span class="joint-label">J{{ idx + 1 }}</span>
              <span class="joint-value" :class="getTempClass(joint.temperature)">
                {{ joint.angle.toFixed(1) }}°
              </span>
            </div>
          </div>
          
          <div class="summary-stats">
            <div class="stat">
              <span class="stat-label">最高温度</span>
              <span class="stat-value" :class="getTempClass(getMaxTemp(armId))">
                {{ getMaxTemp(armId).toFixed(1) }}°C
              </span>
            </div>
            <div class="stat">
              <span class="stat-label">平均扭矩</span>
              <span class="stat-value">{{ getAvgTorque(armId).toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { telemetryManager } from '../services/telemetryManager';
import type { ArmStatus, JointTelemetry } from '../types/telemetry';
import StatusLights from './StatusLights.vue';

defineProps<{
  selectedArm: number | null;
}>();

defineEmits<{
  (e: 'selectArm', armId: number): void;
}>();

const isConnected = computed(() => telemetryManager.isConnected.value);
const updateFrequency = computed(() => telemetryManager.updateFrequency.value);
const armIds = computed(() => telemetryManager.getAllArmIds());

function getArmStatus(armId: number): ArmStatus | null {
  const telemetry = telemetryManager.getCurrentTelemetry(armId);
  return telemetry?.status || null;
}

function getArmJoints(armId: number): JointTelemetry[] {
  const telemetry = telemetryManager.getCurrentTelemetry(armId);
  return telemetry?.joints || Array(6).fill({ angle: 0, temperature: 0, torque: 0 });
}

function getMaxTemp(armId: number): number {
  const joints = getArmJoints(armId);
  return Math.max(...joints.map(j => j.temperature));
}

function getAvgTorque(armId: number): number {
  const joints = getArmJoints(armId);
  return joints.reduce((sum, j) => sum + j.torque, 0) / joints.length;
}

function getTempClass(temp: number): string {
  if (temp >= 60) return 'danger';
  if (temp >= 50) return 'warning';
  return 'normal';
}
</script>

<style scoped>
.status-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
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

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-red);
}

.status-indicator.connected {
  background: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.freq {
  color: var(--accent-blue);
  font-weight: 600;
}

.arm-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.arm-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.arm-card:hover {
  border-color: var(--accent-blue);
}

.arm-card.selected {
  border-color: var(--accent-blue);
  background: rgba(0, 212, 255, 0.05);
}

.arm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.arm-name {
  font-size: 13px;
  font-weight: 600;
}

.joint-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  margin-bottom: 10px;
}

.joint-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.joint-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.joint-value {
  font-size: 11px;
  font-weight: 500;
  font-family: 'Consolas', monospace;
}

.joint-value.normal {
  color: var(--accent-green);
}

.joint-value.warning {
  color: var(--accent-yellow);
}

.joint-value.danger {
  color: var(--accent-red);
}

.summary-stats {
  display: flex;
  justify-content: space-around;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  font-family: 'Consolas', monospace;
}

.stat-value.normal {
  color: var(--accent-green);
}

.stat-value.warning {
  color: var(--accent-yellow);
}

.stat-value.danger {
  color: var(--accent-red);
}
</style>
