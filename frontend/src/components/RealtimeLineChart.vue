<template>
  <div class="chart-card">
    <div class="chart-header">
      <h3>{{ title }}</h3>
      <div class="chart-controls">
        <button
          v-for="m in metrics"
          :key="m.key"
          :class="{ active: currentMetric === m.key }"
          @click="currentMetric = m.key"
        >
          {{ m.label }}
        </button>
      </div>
    </div>
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import * as echarts from 'echarts';
import type { DataMetric } from '../types/telemetry';
import { telemetryManager } from '../services/telemetryManager';

const props = defineProps<{
  armId: number;
  title: string;
}>();

const chartRef = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;
let animationFrameId: number | null = null;
let lastUpdateTime = 0;
const UPDATE_THROTTLE_MS = 50;

const currentMetric = ref<DataMetric>('angle');

const metrics = [
  { key: 'angle' as DataMetric, label: '角度 (°)' },
  { key: 'temperature' as DataMetric, label: '温度 (°C)' },
  { key: 'torque' as DataMetric, label: '扭矩 (N·m)' },
];

const jointColors = [
  '#00d4ff',
  '#00ff88',
  '#ffcc00',
  '#ff8c00',
  '#ff4757',
  '#a855f7',
];

const unitLabels: Record<DataMetric, string> = {
  angle: '°',
  temperature: '°C',
  torque: 'N·m',
};

function initChart() {
  if (!chartRef.value) return;
  
  chartInstance = echarts.init(chartRef.value, 'dark');
  
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
    },
    legend: {
      data: Array.from({ length: 6 }, (_, i) => `关节 ${i + 1}`),
      top: 0,
      right: 0,
      textStyle: { color: '#8b9bb4', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26, 35, 50, 0.95)',
      borderColor: '#2a3a52',
      textStyle: { color: '#e8ecf1' },
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#00d4ff', width: 1 },
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#2a3a52' } },
      axisLabel: {
        color: '#8b9bb4',
        fontSize: 10,
        formatter: (value: number) => {
          const date = new Date(value);
          return `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#2a3a52' } },
      axisLabel: { color: '#8b9bb4', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1a2332', width: 1 } },
    },
    series: Array.from({ length: 6 }, (_, i) => ({
      name: `关节 ${i + 1}`,
      type: 'line',
      smooth: true,
      symbol: 'none',
      sampling: 'lttb',
      data: [],
      lineStyle: {
        color: jointColors[i],
        width: 1.5,
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: jointColors[i] + '30' },
          { offset: 1, color: jointColors[i] + '00' },
        ]),
      },
    })),
  };
  
  chartInstance.setOption(option);
}

function updateChart() {
  if (!chartInstance) return;
  
  const now = Date.now();
  if (now - lastUpdateTime < UPDATE_THROTTLE_MS) {
    animationFrameId = requestAnimationFrame(updateChart);
    return;
  }
  lastUpdateTime = now;
  
  const seriesData: any[][] = [];
  
  for (let joint = 0; joint < 6; joint++) {
    const history = telemetryManager.getHistory(props.armId, currentMetric.value, joint);
    const points = history.map(p => [p.timestamp, p.value]);
    seriesData.push(points);
  }
  
  chartInstance.setOption({
    series: seriesData.map((data, i) => ({ data })),
  });
  
  animationFrameId = requestAnimationFrame(updateChart);
}

function handleResize() {
  chartInstance?.resize();
}

watch(currentMetric, () => {
  if (chartInstance) {
    chartInstance.setOption({
      yAxis: { name: unitLabels[currentMetric.value] },
    });
  }
});

onMounted(() => {
  initChart();
  window.addEventListener('resize', handleResize);
  animationFrameId = requestAnimationFrame(updateChart);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  chartInstance?.dispose();
});
</script>

<style scoped>
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.chart-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.chart-controls {
  display: flex;
  gap: 4px;
}

.chart-controls button {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.chart-controls button:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.chart-controls button.active {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: var(--bg-primary);
}

.chart-container {
  flex: 1;
  min-height: 0;
}
</style>
