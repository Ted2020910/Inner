import { ref, onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import * as THREE from 'three'
import commonVertShader from '../shaders/common.vert?raw'
import cosmosFrag from '../shaders/cosmos.frag?raw'
import digitalBrainFrag from '../shaders/digital-brain.frag?raw'
import driveHomeFrag from '../shaders/drive-home.frag?raw'
import oceanFrag from '../shaders/ocean.frag?raw'
import rainDayFrag from '../shaders/rain-day.frag?raw'
import rainFrag from '../shaders/rain.frag?raw'
import skyFrag from '../shaders/sky.frag?raw'
import snowFrag from '../shaders/snow.frag?raw'
import sunnyFrag from '../shaders/sunny.frag?raw'
import thunderstormFrag from '../shaders/thunderstorm.frag?raw'

export const SCENES = [
  { id: 'rain', label: 'Night Rain', icon: '☔', frag: rainFrag },
  { id: 'rain-day', label: 'Rain Day', icon: '🌫', frag: rainDayFrag },
  { id: 'thunderstorm', label: 'Thunderstorm', icon: '⚡', frag: thunderstormFrag },
  { id: 'sunny', label: 'Sunny', icon: '☀', frag: sunnyFrag },
  { id: 'snow', label: 'Snow Night', icon: '❄', frag: snowFrag },
  { id: 'digital-brain', label: 'Digital Brain', icon: '◈', frag: digitalBrainFrag },
  { id: 'drive-home', label: 'Drive Home', icon: '⌁', frag: driveHomeFrag },
  { id: 'ocean', label: 'Sunrise on Saturn', icon: '🪐', frag: oceanFrag },
  { id: 'sky', label: 'Lone Planet and the Sun', icon: '🛰', frag: skyFrag },
  { id: 'cosmos', label: 'Light Circles', icon: '✦', frag: cosmosFrag },
] as const

export const DEFAULT_SCENE_ID: SceneId = 'ocean'

export type SceneId = (typeof SCENES)[number]['id']

export interface ShaderControls {
  sceneId: Ref<SceneId>
  intensity: Ref<number>
  blurAmount: Ref<number>
  setScene: (id: SceneId) => void
  setIntensity: (v: number) => void
  setBlurAmount: (v: number) => void
}

export function useShader(
  canvasRef: Ref<HTMLCanvasElement | null>,
  initialScene: Ref<SceneId>
): ShaderControls {
  const sceneId = initialScene
  const intensity = ref(0.5)
  const blurAmount = ref(0.5)

  let renderer: THREE.WebGLRenderer | null = null
  let scene: THREE.Scene | null = null
  let camera: THREE.OrthographicCamera | null = null
  let mesh: THREE.Mesh | null = null
  let material: THREE.ShaderMaterial | null = null
  let animationId = 0
  const clock = new THREE.Clock()
  let sceneTimeOffset = 0

  function getResolution(): THREE.Vector2 {
    const pr = renderer?.getPixelRatio() ?? 1
    return new THREE.Vector2(window.innerWidth * pr, window.innerHeight * pr)
  }

  function getSceneDefinition(id: SceneId) {
    return SCENES.find((entry) => entry.id === id) ?? SCENES[0]
  }

  function createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: commonVertShader,
      fragmentShader: getSceneDefinition(sceneId.value).frag,
      uniforms: {
        uResolution: { value: getResolution() },
        uTime: { value: 0 },
        uIntensity: { value: intensity.value },
        uBlurAmount: { value: blurAmount.value },
      },
    })
  }

  function applyScene(id: SceneId) {
    if (!material) return
    const nextScene = getSceneDefinition(id)
    material.fragmentShader = nextScene.frag
    material.needsUpdate = true
    material.uniforms.uTime.value = 0
    sceneTimeOffset = clock.getElapsedTime()
  }

  function init(canvas: HTMLCanvasElement) {
    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(window.innerWidth, window.innerHeight)

    const geometry = new THREE.PlaneGeometry(2, 2)
    material = createMaterial()
    mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    animate()
    window.addEventListener('resize', onResize)
  }

  function animate() {
    animationId = requestAnimationFrame(animate)

    if (material) {
      material.uniforms.uTime.value = clock.getElapsedTime() - sceneTimeOffset
      material.uniforms.uIntensity.value = intensity.value
      material.uniforms.uBlurAmount.value = blurAmount.value
    }

    renderer?.render(scene!, camera!)
  }

  function onResize() {
    if (!renderer || !material) return
    renderer.setSize(window.innerWidth, window.innerHeight)
    material.uniforms.uResolution.value.copy(getResolution())
  }

  function setScene(id: SceneId) {
    sceneId.value = id
    applyScene(id)
  }

  function setIntensity(v: number) {
    intensity.value = Math.max(0, Math.min(1, v))
  }

  function setBlurAmount(v: number) {
    blurAmount.value = Math.max(0, Math.min(1, v))
  }

  onMounted(() => {
    if (canvasRef.value) init(canvasRef.value)
  })

  watch(sceneId, (value) => {
    applyScene(value)
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(animationId)
    window.removeEventListener('resize', onResize)
    renderer?.dispose()
    material?.dispose()
  })

  return { sceneId, intensity, blurAmount, setScene, setIntensity, setBlurAmount }
}
