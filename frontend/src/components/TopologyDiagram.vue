<template>
  <div class="topology-card">
    <div class="card-header">
      <h3>车间流水线拓扑图</h3>
      <div class="legend">
        <div class="legend-item">
          <span class="legend-dot running"></span>
          <span>运行</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot warning"></span>
          <span>警告</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot error"></span>
          <span>故障</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot idle"></span>
          <span>待机</span>
        </div>
      </div>
    </div>
    
    <div class="svg-container">
      <svg viewBox="0 0 900 400" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="conveyorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#2a3a52" />
            <stop offset="50%" style="stop-color:#3a4a62" />
            <stop offset="100%" style="stop-color:#2a3a52" />
          </linearGradient>
          
          <linearGradient id="floorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#0f141f" />
            <stop offset="100%" style="stop-color:#0a0e17" />
          </linearGradient>
          
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          <pattern id="conveyorPattern" patternUnits="userSpaceOnUse" width="40" height="20">
            <rect width="40" height="20" fill="url(#conveyorGrad)" />
            <line x1="0" y1="10" x2="40" y2="10" stroke="#1a2332" stroke-width="1" />
            <line x1="20" y1="0" x2="20" y2="20" stroke="#1a2332" stroke-width="1" />
          </pattern>
        </defs>
        
        <rect x="0" y="0" width="900" height="400" fill="url(#floorGrad)" />
        
        <g id="grid">
          <template v-for="i in 18">
            <line
              :key="'v' + i"
              :x1="i * 50"
              y1="0"
              :x2="i * 50"
              y2="400"
              stroke="#121a29"
              stroke-width="0.5"
            />
          </template>
          <template v-for="i in 8">
            <line
              :key="'h' + i"
              x1="0"
              :y1="i * 50"
              x2="900"
              :y2="i * 50"
              stroke="#121a29"
              stroke-width="0.5"
            />
          </template>
        </g>
        
        <g id="conveyors">
          <rect x="50" y="180" width="800" height="40" fill="url(#conveyorPattern)" rx="4" />
          <rect x="50" y="180" width="800" height="40" fill="none" stroke="#3a4a62" stroke-width="2" rx="4" />
          
          <g class="conveyor-arrows">
            <template v-for="i in 10">
              <polygon
                :key="'arr' + i"
                :points="`${100 + i * 80},200 ${110 + i * 80},195 ${110 + i * 80},205`"
                fill="#00d4ff"
                opacity="0.6"
              >
                <animate
                  attributeName="opacity"
                  values="0.3;0.8;0.3"
                  dur="1.5s"
                  :begin="`${i * 0.15}s`"
                  repeatCount="indefinite"
                />
              </polygon>
            </template>
          </g>
        </g>
        
        <g id="stations">
          <g v-for="(station, idx) in stations" :key="'station' + idx">
            <rect
              :x="station.x"
              :y="station.y"
              width="100"
              height="70"
              fill="#121a29"
              stroke="#2a3a52"
              stroke-width="2"
              rx="4"
            />
            <text
              :x="station.x + 50"
              :y="station.y + 30"
              text-anchor="middle"
              fill="#8b9bb4"
              font-size="11"
            >
              {{ station.name }}
            </text>
            <text
              :x="station.x + 50"
              :y="station.y + 50"
              text-anchor="middle"
              fill="#00d4ff"
              font-size="10"
              font-family="Consolas, monospace"
            >
              {{ station.code }}
            </text>
          </g>
        </g>
        
        <g id="roboticArms">
          <g
            v-for="(arm, idx) in armPositions"
            :key="'arm' + arm.id"
            class="robotic-arm"
            :class="{ selected: selectedArm === arm.id }"
            @click="$emit('selectArm', arm.id)"
          >
            <g :transform="`translate(${arm.x}, ${arm.y})`">
              <circle cx="0" cy="0" r="30" fill="#121a29" stroke="#2a3a52" stroke-width="2" />
              
              <g class="arm-base">
                <rect x="-15" y="-5" width="30" height="25" fill="#1a2332" stroke="#2a3a52" stroke-width="1" rx="2" />
                <rect x="-10" y="-25" width="20" height="20" fill="#2a3a52" rx="2" />
                
                <line
                  x1="0"
                  y1="-15"
                  :x2="getJointAngle(arm.id, 0) * 0.8"
                  :y2="-15 - 25"
                  stroke="#3a4a62"
                  stroke-width="6"
                  stroke-linecap="round"
                />
                
                <line
                  :x1="getJointAngle(arm.id, 0) * 0.8"
                  :y1="-15 - 25"
                  :x2="getJointAngle(arm.id, 0) * 0.8 + getJointAngle(arm.id, 1) * 0.5"
                  :y2="-15 - 50"
                  stroke="#4a5a72"
                  stroke-width="5"
                  stroke-linecap="round"
                />
                
                <circle
                  :cx="getJointAngle(arm.id, 0) * 0.8 + getJointAngle(arm.id, 1) * 0.5"
                  :cy="-15 - 50"
                  r="8"
                  :fill="getArmStatusColor(arm.id)"
                  filter="url(#glow)"
                >
                  <animate
                    v-if="getArmStatus(arm.id)?.isRunning"
                    attributeName="r"
                    values="8;10;8"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
              
              <circle
                cx="0"
                cy="0"
                r="35"
                fill="none"
                :stroke="getArmStatusColor(arm.id)"
                stroke-width="2"
                opacity="0.5"
              >
                <animate
                  v-if="getArmStatus(arm.id)?.isRunning"
                  attributeName="r"
                  values="35;42;35"
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  v-if="getArmStatus(arm.id)?.isRunning"
                  attributeName="opacity"
                  values="0.5;0.1;0.5"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
              
              <text
                x="0"
                y="55"
                text-anchor="middle"
                fill="#e8ecf1"
                font-size="12"
                font-weight="600"
              >
                机械臂 #{{ arm.id }}
              </text>
              
              <g class="mini-status">
                <circle
                  v-for="(status, sIdx) in getMiniStatus(arm.id)"
                  :key="sIdx"
                  :cx="-15 + sIdx * 10"
                  cy="42"
                  r="3"
                  :fill="status.color"
                />
              </g>
            </g>
          </g>
        </g>
        
        <g id="workpieces">
          <template v-for="i in 5">
            <g :key="'wp' + i">
              <rect
                :x="100 + i * 160"
                y="190"
                width="30"
                height="20"
                fill="#ffcc00"
                rx="2"
                opacity="0.8"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from="0 0"
                  to="160 0"
                  dur="8s"
                  repeatCount="indefinite"
                  :begin="`${i * 1.6}s`"
                />
              </rect>
            </g>
          </template>
        </g>
        
        <g id="labels">
          <text x="450" y="30" text-anchor="middle" fill="#00d4ff" font-size="16" font-weight="600">
            汽车柔性制造流水线
          </text>
          <text x="450" y="50" text-anchor="middle" fill="#8b9bb4" font-size="11">
            Automotive Flexible Manufacturing Line
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { telemetryManager } from '../services/telemetryManager';
import type { ArmStatus } from '../types/telemetry';

defineProps<{
  selectedArm: number | null;
}>();

defineEmits<{
  (e: 'selectArm', armId: number): void;
}>();

const stations = [
  { x: 100, y: 80, name: '上料工位', code: 'STAT-001' },
  { x: 300, y: 80, name: '焊接工位', code: 'STAT-002' },
  { x: 500, y: 80, name: '装配工位', code: 'STAT-003' },
  { x: 700, y: 80, name: '检测工位', code: 'STAT-004' },
];

const armPositions = [
  { id: 1, x: 200, y: 150 },
  { id: 2, x: 400, y: 150 },
  { id: 3, x: 600, y: 150 },
  { id: 4, x: 800, y: 150 },
];

function getArmStatus(armId: number): ArmStatus | null {
  const telemetry = telemetryManager.getCurrentTelemetry(armId);
  return telemetry?.status || null;
}

function getArmStatusColor(armId: number): string {
  const status = getArmStatus(armId);
  if (!status) return '#2a3a52';
  if (status.isError || status.emergencyStop) return '#ff4757';
  if (status.isWarning) return '#ffcc00';
  if (status.isRunning) return '#00ff88';
  return '#2a3a52';
}

function getJointAngle(armId: number, jointIdx: number): number {
  const telemetry = telemetryManager.getCurrentTelemetry(armId);
  if (!telemetry || !telemetry.joints[jointIdx]) return 0;
  return telemetry.joints[jointIdx].angle;
}

function getMiniStatus(armId: number): Array<{ color: string }> {
  const status = getArmStatus(armId);
  return [
    { color: status?.isRunning ? '#00ff88' : '#2a3a52' },
    { color: status?.isWarning ? '#ffcc00' : '#2a3a52' },
    { color: status?.isError ? '#ff4757' : '#2a3a52' },
  ];
}
</script>

<style scoped>
.topology-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.legend {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot.running {
  background: var(--accent-green);
  box-shadow: 0 0 4px var(--accent-green);
}

.legend-dot.warning {
  background: var(--accent-yellow);
  box-shadow: 0 0 4px var(--accent-yellow);
}

.legend-dot.error {
  background: var(--accent-red);
  box-shadow: 0 0 4px var(--accent-red);
}

.legend-dot.idle {
  background: #2a3a52;
}

.svg-container {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

svg {
  width: 100%;
  height: 100%;
}

.robotic-arm {
  cursor: pointer;
  transition: all 0.2s;
}

.robotic-arm:hover circle:first-child {
  stroke: var(--accent-blue);
}

.robotic-arm.selected circle:first-child {
  stroke: var(--accent-blue);
  stroke-width: 3;
}
</style>
