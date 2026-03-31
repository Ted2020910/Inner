<script setup lang="ts">
import { ref } from 'vue'
import { useShader } from '../composables/useShader'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { rainAmount, setRainAmount } = useShader(canvasRef)

defineExpose({ rainAmount, setRainAmount })
</script>

<template>
  <canvas
    ref="canvasRef"
    class="shader-canvas"
  />
</template>

<style scoped>
.shader-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
}
</style>
