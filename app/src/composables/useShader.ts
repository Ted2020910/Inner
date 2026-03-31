import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'
import * as THREE from 'three'
import rainFragShader from '../shaders/rain.frag?raw'
import commonVertShader from '../shaders/common.vert?raw'

export interface ShaderControls {
  rainAmount: Ref<number>
  setRainAmount: (v: number) => void
}

export function useShader(canvasRef: Ref<HTMLCanvasElement | null>): ShaderControls {
  const rainAmount = ref(0.5)
  let renderer: THREE.WebGLRenderer | null = null
  let animationId: number = 0
  let material: THREE.ShaderMaterial | null = null
  const clock = new THREE.Clock()

  function init(canvas: HTMLCanvasElement) {
    // Scene setup — fullscreen quad
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    // Load background texture
    const textureLoader = new THREE.TextureLoader()
    // Create a procedural dark background texture as fallback
    const bgTexture = createProceduralBackground()

    // Fullscreen quad geometry
    const geometry = new THREE.PlaneGeometry(2, 2)

    material = new THREE.ShaderMaterial({
      vertexShader: commonVertShader,
      fragmentShader: rainFragShader,
      uniforms: {
        uResolution: {
          value: new THREE.Vector2(
            window.innerWidth * renderer.getPixelRatio(),
            window.innerHeight * renderer.getPixelRatio()
          ),
        },
        uTime: { value: 0 },
        uRainAmount: { value: rainAmount.value },
        uBackground: { value: bgTexture },
      },
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Animation loop
    function animate() {
      animationId = requestAnimationFrame(animate)

      if (material) {
        material.uniforms.uTime.value = clock.getElapsedTime()
        material.uniforms.uRainAmount.value = rainAmount.value
      }

      renderer!.render(scene, camera)
    }

    animate()

    // Handle resize
    window.addEventListener('resize', onResize)
  }

  function createProceduralBackground(): THREE.Texture {
    // Create a dark, moody procedural background
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Dark gradient background
    const gradient = ctx.createRadialGradient(
      size * 0.5, size * 0.4, 0,
      size * 0.5, size * 0.5, size * 0.7
    )
    gradient.addColorStop(0, '#1a2332')
    gradient.addColorStop(0.3, '#0f1923')
    gradient.addColorStop(0.6, '#0a1018')
    gradient.addColorStop(1, '#050a0f')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)

    // Add some subtle light spots (city lights effect)
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size
      const y = size * 0.4 + Math.random() * size * 0.5
      const r = 1 + Math.random() * 4
      const alpha = 0.05 + Math.random() * 0.15

      const colors = ['#4a6fa5', '#e8a87c', '#c9b1ff', '#85c1e9', '#ffd700']
      const color = colors[Math.floor(Math.random() * colors.length)]

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.globalAlpha = alpha
      ctx.fill()

      // Glow
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 6)
      glow.addColorStop(0, color)
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.globalAlpha = alpha * 0.3
      ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12)
    }
    ctx.globalAlpha = 1

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    return texture
  }

  function onResize() {
    if (!renderer || !material) return
    renderer.setSize(window.innerWidth, window.innerHeight)
    material.uniforms.uResolution.value.set(
      window.innerWidth * renderer.getPixelRatio(),
      window.innerHeight * renderer.getPixelRatio()
    )
  }

  function setRainAmount(v: number) {
    rainAmount.value = Math.max(0, Math.min(1, v))
  }

  onMounted(() => {
    if (canvasRef.value) {
      init(canvasRef.value)
    }
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(animationId)
    window.removeEventListener('resize', onResize)
    renderer?.dispose()
  })

  return {
    rainAmount,
    setRainAmount,
  }
}
