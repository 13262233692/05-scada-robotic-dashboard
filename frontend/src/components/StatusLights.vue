<template>
  <div class="status-lights">
    <div
      class="light"
      :class="{ active: status?.isRunning, running: status?.isRunning }"
      title="运行中"
    ></div>
    <div
      class="light"
      :class="{ active: status?.autoMode }"
      title="自动模式"
    ></div>
    <div
      class="light warning"
      :class="{ active: status?.isWarning }"
      title="警告"
    ></div>
    <div
      class="light error"
      :class="{ active: status?.isError }"
      title="故障"
    ></div>
    <div
      class="light emergency"
      :class="{ active: status?.emergencyStop }"
      title="急停"
    ></div>
  </div>
</template>

<script setup lang="ts">
import type { ArmStatus } from '../types/telemetry';

defineProps<{
  status: ArmStatus | null;
}>();
</script>

<style scoped>
.status-lights {
  display: flex;
  gap: 4px;
}

.light {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2a3a52;
  transition: all 0.2s;
}

.light.active {
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
}

.light.running {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.light.warning.active {
  background: var(--accent-yellow);
  box-shadow: 0 0 6px var(--accent-yellow);
}

.light.error.active {
  background: var(--accent-red);
  box-shadow: 0 0 6px var(--accent-red);
}

.light.emergency.active {
  background: var(--accent-red);
  box-shadow: 0 0 8px var(--accent-red);
  animation: fastBlink 0.3s infinite;
}

@keyframes fastBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
