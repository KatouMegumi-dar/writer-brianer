<template>
  <div class="flex flex-col h-full w-full bg-base-100">
    <div class="flex-none p-4 bg-base-200 shadow-sm flex justify-between items-center">
      <h2 class="text-xl font-bold text-primary">Dual-Layer Graph Visualization (双层图谱)</h2>
      <div class="flex gap-2">
        <button class="btn btn-sm btn-outline btn-error" @click="handleClear">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            重置数据库
        </button>
        <button class="btn btn-sm btn-outline" @click="refreshData">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新数据
        </button>
      </div>
    </div>
    <div class="flex-1 relative w-full h-full overflow-hidden" ref="chartContainer"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from 'vue'
import * as echarts from 'echarts'
import { fetchGraphData, clearDatabase } from '../services/sqlite'

const confirm = inject<(title: string, msg: string, cb: () => void) => void>('confirm')

const chartContainer = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

const initChart = async () => {
  if (!chartContainer.value) return
  
  chartInstance = echarts.init(chartContainer.value)
  
  // Initial empty or loading state
  chartInstance.showLoading();
  
  const { nodes, links } = await fetchGraphData();
  
  chartInstance.hideLoading();

  const option = {
    title: {
      text: 'PEDSA Ontology & Instance Layers',
      subtext: 'Layer 1: Ontology (Red) | Layer 2: Instances (Blue) | Edges: Green=Equal, Red=Inhibit, Gray=Assoc',
      top: 'bottom',
      left: 'right'
    },
    tooltip: {},
    legend: [{
      data: ['Ontology', 'Instance']
    }],
    animationDuration: 1500,
    // animationEasingUpdate: 'quinticInOut',
    series: [
      {
        name: 'Graph',
        type: 'graph',
        layout: 'force',
        data: nodes,
        links: links,
        categories: [
            { name: 'Ontology', itemStyle: { color: '#ef4444' } }, // Red-500
            { name: 'Instance', itemStyle: { color: '#3b82f6' } }  // Blue-500
        ],
        roam: true,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}'
        },
        lineStyle: {
          curveness: 0.3,
          opacity: 0.7
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
        emphasis: {
          focus: 'adjacency',
          lineStyle: {
            width: 5
          }
        },
        force: {
            repulsion: 1000,
            gravity: 0.1,
            edgeLength: [50, 200]
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
  
  window.addEventListener('resize', resizeHandler)
}

const resizeHandler = () => {
  chartInstance?.resize()
}

const refreshData = async () => {
    if (!chartInstance) return;
    chartInstance.showLoading();
    try {
        const { nodes, links } = await fetchGraphData();
        chartInstance.setOption({
            series: [{
                data: nodes,
                links: links
            }]
        });
    } finally {
        chartInstance.hideLoading();
    }
}

const handleClear = async () => {
     if (confirm) {
         confirm('重置数据库', '确定要清空当前所有图谱数据吗？此操作不可撤销。', async () => {
             await clearDatabase();
             await refreshData();
         });
     } else {
         // Fallback to window.confirm if injection fails
         if (window.confirm('确定要清空数据库吗？')) {
             await clearDatabase();
             await refreshData();
         }
     }
 }

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeHandler)
  chartInstance?.dispose()
})
</script>

<style scoped>
/* Ensure container takes full space */
</style>