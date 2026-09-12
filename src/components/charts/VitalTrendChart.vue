<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import * as echarts from 'echarts'
import type { Patient } from '@/types/clinical'

interface Props {
  patient: Patient
}

const props = defineProps<Props>()
const chartRef = useTemplateRef<HTMLDivElement>('chart')
const chart = shallowRef<echarts.ECharts | null>(null)

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 42, right: 18, top: 24, bottom: 28 },
  xAxis: {
    type: 'category',
    data: ['9/5', '9/6', '9/7', '9/8', '9/9', '9/10', '9/11'],
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#d7e1ef' } },
    axisLabel: { color: '#64748b' },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#64748b' },
    splitLine: { lineStyle: { color: '#eef2f7' } },
  },
  series: [
    {
      name: '收缩压',
      type: 'line',
      smooth: true,
      data: props.patient.status === 'stable' ? [124, 126, 125, 127, 124, 126, 126] : [142, 146, 148, 150, 149, 151, 152],
      lineStyle: { width: 2, color: '#2f6f8f' },
      itemStyle: { color: '#2f6f8f' },
      areaStyle: { color: 'rgba(47, 111, 143, 0.06)' },
    },
    {
      name: '心率',
      type: 'line',
      smooth: true,
      data: props.patient.status === 'critical' ? [86, 88, 90, 92, 94, 95, 96] : [74, 76, 73, 78, 75, 77, props.patient.metrics.heartRate],
      lineStyle: { width: 2, color: '#2c8578' },
      itemStyle: { color: '#2c8578' },
    },
  ],
}))

function renderChart() {
  chart.value?.setOption(option.value, true)
}

function resizeChart() {
  chart.value?.resize()
}

onMounted(() => {
  if (!chartRef.value) return
  chart.value = echarts.init(chartRef.value)
  renderChart()
  window.addEventListener('resize', resizeChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart)
  chart.value?.dispose()
})

watch(option, renderChart)
</script>

<template>
  <div ref="chart" class="vital-chart" />
</template>

<style scoped>
.vital-chart {
  width: 100%;
  height: 280px;
}
</style>
