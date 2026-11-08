<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import Chart, { type ChartConfiguration, registerables } from "chart.js/auto";

Chart.register(...registerables);

const props = withDefaults(defineProps<{
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  kind?: "bar" | "doughnut";
  rtl?: boolean;
  currency?: string;
}>(), {
  kind: "bar",
  rtl: false,
  currency: ""
});

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

function renderChart(): void {
  if (!canvas.value) return;
  chart?.destroy();

  const configuration: ChartConfiguration = {
    type: props.kind,
    data: {
      labels: [...props.labels],
      datasets: props.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: [...dataset.data],
        borderWidth: 2,
        borderRadius: props.kind === "bar" ? 7 : 0,
        tension: 0.3,
        backgroundColor: props.kind === "doughnut"
          ? ["#2563eb", "#0d9488", "#f59e0b", "#8b5cf6", "#e11d48", "#64748b", "#16a34a"]
          : index === 0 ? "rgba(37, 99, 235, 0.72)" : index === 1 ? "rgba(225, 29, 72, 0.68)" : "rgba(13, 148, 136, 0.68)",
        borderColor: props.kind === "doughnut"
          ? "#ffffff"
          : index === 0 ? "#2563eb" : index === 1 ? "#e11d48" : "#0d9488"
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: true, position: "bottom", rtl: props.rtl, textDirection: props.rtl ? "rtl" : "ltr" },
        tooltip: {
          callbacks: {
            label(context) {
              const value = Number(context.raw ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
              return props.currency ? value + " " + props.currency : value;
            }
          }
        }
      },
      ...(props.kind === "bar" ? {
        scales: {
          x: { reverse: props.rtl, grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback(value) { return Number(value).toLocaleString(); } } }
        }
      } : {})
    }
  };

  chart = new Chart(canvas.value, configuration);
}

onMounted(renderChart);
watch(() => [props.labels, props.datasets, props.kind, props.rtl, props.currency], renderChart, { deep: true });
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="relative h-72 w-full">
    <canvas ref="canvas" />
  </div>
</template>
