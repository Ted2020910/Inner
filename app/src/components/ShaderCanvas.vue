<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useShader, type SceneId } from '../composables/useShader'

const props = defineProps<{
  scene: SceneId
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const sceneRef = toRef(props, 'scene')

const controls = useShader(canvasRef, sceneRef)

defineExpose({
  setIntensity: controls.setIntensity,
  setBlurAmount: controls.setBlurAmount,
  setScene: controls.setScene,
})
</script>

<template>
  <canvas ref="canvasRef" class="shader-canvas" />
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
