import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { SceneId } from './useShader'
import {
  DEFAULT_SCENE_AUDIO_PROFILES,
  type AudioManifest,
  type ExternalAudioTrack,
  type ExternalLayerResource,
  type LayerFilterConfig,
  type LayerProfile,
} from './audioProfiles'

const MANIFEST_URL = '/audio/manifest.json'

const STORAGE_KEYS = {
  master: 'inner:audio:master',
  primary: 'inner:audio:primary',
  texture: 'inner:audio:texture',
  music: 'inner:audio:music',
  resume: 'inner:audio:resume',
} as const

interface ExternalLayerHandle {
  source: null
  mediaElement: HTMLAudioElement
  mediaSource: MediaElementAudioSourceNode
  filter: BiquadFilterNode
  trim: GainNode
}

interface SynthLayerHandle {
  source: AudioBufferSourceNode
  mediaElement: null
  mediaSource: null
  filter: BiquadFilterNode
  trim: GainNode
}

type LayerHandle = ExternalLayerHandle | SynthLayerHandle

interface MusicHandle {
  mediaElement: HTMLAudioElement
  mediaSource: MediaElementAudioSourceNode
  trim: GainNode
}

export interface AudioControls {
  masterVolume: Ref<number>
  primaryVolume: Ref<number>
  textureVolume: Ref<number>
  musicVolume: Ref<number>
  sceneLabel: Ref<string>
  primaryLabel: Ref<string>
  textureLabel: Ref<string>
  musicLabel: Ref<string>
  hasMusic: Ref<boolean>
  isPlaying: Ref<boolean>
  start: () => Promise<void>
  stop: () => void
  setPrimaryVolume: (v: number) => void
  setTextureVolume: (v: number) => void
  setMusicVolume: (v: number) => void
  setMasterVolume: (v: number) => void
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? clamp01(parsed) : fallback
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
}

function createPinkSample(state: number[], white: number): number {
  state[0] = 0.99886 * state[0] + white * 0.0555179
  state[1] = 0.99332 * state[1] + white * 0.0750759
  state[2] = 0.969 * state[2] + white * 0.153852
  state[3] = 0.8665 * state[3] + white * 0.3104856
  state[4] = 0.55 * state[4] + white * 0.5329522
  state[5] = -0.7616 * state[5] - white * 0.016898
  const pink = (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + state[6] + white * 0.5362) * 0.11
  state[6] = white * 0.115926
  return pink
}

function fillStereoBuffer(
  ctx: AudioContext,
  duration: number,
  render: (data: Float32Array, sampleRate: number, channel: number) => void
): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * duration))
  const buffer = ctx.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    render(buffer.getChannelData(channel), sampleRate, channel)
  }

  return buffer
}

function createRainBuffer(ctx: AudioContext, duration: number, stormy: boolean): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    let brown = 0
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      brown += (Math.random() * 2 - 1) * (stormy ? 0.14 : 0.08)
      brown *= 0.985

      const sweep = 0.5 + 0.5 * Math.sin(t * (stormy ? 0.35 : 0.22) + channel * 0.7)
      const drizzle = Math.pow(Math.max(0, Math.sin(t * (stormy ? 12.5 : 8.5) + Math.sin(t * 0.9) * 2.8)), stormy ? 7 : 9)
      const hiss = (Math.random() * 2 - 1) * (stormy ? 0.28 : 0.18)
      const thunder = stormy
        ? Math.sin(t * 0.18 + channel * 0.4) * Math.pow(Math.max(0, Math.sin(t * 0.06 + channel)), 18) * 0.22
        : 0

      data[i] = clampSample((brown * 0.35 + hiss * 0.2) * (0.45 + sweep * 0.55) + drizzle * hiss * 0.55 + thunder)
    }
  })
}

function createWindBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    let low = 0
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      const white = Math.random() * 2 - 1
      low = low * 0.992 + white * 0.05
      const gust = 0.35 + 0.25 * Math.sin(t * 0.23 + channel * 0.8) + 0.2 * Math.sin(t * 0.51 + channel * 0.3)
      const shimmer = Math.sin(t * 4.8 + channel) * 0.02
      data[i] = clampSample((low * 0.75 + white * 0.08 + shimmer) * gust)
    }
  })
}

function createSnowBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    const pinkState = [0, 0, 0, 0, 0, 0, 0]
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      const white = Math.random() * 2 - 1
      const hush = createPinkSample(pinkState, white) * 0.45
      const drift = 0.35 + 0.15 * Math.sin(t * 0.17 + channel * 0.6)
      const sparkleGate = Math.pow(Math.max(0, Math.sin(t * 1.1 + channel * 0.9)), 20)
      const sparkle = Math.sin(t * 920 + channel * 4) * sparkleGate * 0.04
      data[i] = clampSample(hush * drift + sparkle)
    }
  })
}

function createWaveBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    let surf = 0
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      const white = Math.random() * 2 - 1
      surf = surf * 0.985 + white * 0.045
      const swell = 0.45 + 0.35 * Math.sin(t * 0.28 + channel * 0.4)
      const foam = Math.pow(Math.max(0, Math.sin(t * 0.95 + Math.sin(t * 0.18) * 2.2)), 6) * white * 0.3
      const undertow = Math.sin(t * 0.11 + channel * 0.2) * 0.1
      data[i] = clampSample((surf * 0.5 + undertow) * swell + foam)
    }
  })
}

function createDroneBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    let dust = 0
    const base = channel === 0 ? 62 : 65
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      dust = dust * 0.996 + (Math.random() * 2 - 1) * 0.008
      const tone =
        Math.sin(Math.PI * 2 * base * t) * 0.16 +
        Math.sin(Math.PI * 2 * base * 0.5 * t + 1.1) * 0.1 +
        Math.sin(Math.PI * 2 * (base + 7) * t + channel * 0.4) * 0.05
      const lfo = 0.65 + 0.25 * Math.sin(t * 0.19 + channel * 0.7)
      data[i] = clampSample(tone * lfo + dust)
    }
  })
}

function createPulseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    let noise = 0
    const base = channel === 0 ? 150 : 164
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      const gate =
        Math.pow(Math.max(0, Math.sin(t * 2.2)), 10) * 0.9 +
        Math.pow(Math.max(0, Math.sin(t * 4.7 + 1.2)), 18) * 0.35
      noise = noise * 0.985 + (Math.random() * 2 - 1) * 0.03
      const tone = Math.sin(Math.PI * 2 * base * t + Math.sin(t * 0.4) * 1.5) * 0.18
      data[i] = clampSample((tone + noise * 0.5) * (0.18 + gate))
    }
  })
}

function createAirBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    const pinkState = [0, 0, 0, 0, 0, 0, 0]
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      const white = Math.random() * 2 - 1
      const air = createPinkSample(pinkState, white) * 0.35
      const flutter = 0.7 + 0.15 * Math.sin(t * 0.6 + channel * 0.5)
      data[i] = clampSample(air * flutter)
    }
  })
}

function createRumbleBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  return fillStereoBuffer(ctx, duration, (data, sampleRate, channel) => {
    let brown = 0
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate
      brown = brown * 0.995 + (Math.random() * 2 - 1) * 0.018
      const lfo = 0.55 + 0.35 * Math.sin(t * 0.12 + channel * 0.3)
      const sub = Math.sin(Math.PI * 2 * 34 * t + channel * 0.2) * 0.08
      data[i] = clampSample((brown * 0.5 + sub) * lfo)
    }
  })
}

function createLayerBuffer(ctx: AudioContext, layer: LayerProfile): AudioBuffer {
  switch (layer.kind) {
    case 'rain':
      return createRainBuffer(ctx, layer.duration, false)
    case 'storm':
      return createRainBuffer(ctx, layer.duration, true)
    case 'wind':
      return createWindBuffer(ctx, layer.duration)
    case 'snow':
      return createSnowBuffer(ctx, layer.duration)
    case 'waves':
      return createWaveBuffer(ctx, layer.duration)
    case 'drone':
      return createDroneBuffer(ctx, layer.duration)
    case 'pulse':
      return createPulseBuffer(ctx, layer.duration)
    case 'air':
      return createAirBuffer(ctx, layer.duration)
    case 'rumble':
      return createRumbleBuffer(ctx, layer.duration)
  }
}

function applyFilterConfig(filter: BiquadFilterNode, config?: LayerFilterConfig) {
  const fallback = config ?? { type: 'lowpass' as BiquadFilterType, frequency: 1200, q: 0.7 }
  filter.type = fallback.type
  filter.frequency.value = fallback.frequency
  filter.Q.value = fallback.q ?? 0.7
}

function buildTrackLabel(track: ExternalAudioTrack | null): string {
  if (!track) return 'No Music Track'
  return track.artist ? `${track.title} · ${track.artist}` : track.title
}

export function useAudio(scene: Ref<SceneId>): AudioControls {
  const masterVolume = ref(readStoredNumber(STORAGE_KEYS.master, 0.5))
  const primaryVolume = ref(readStoredNumber(STORAGE_KEYS.primary, 0.62))
  const textureVolume = ref(readStoredNumber(STORAGE_KEYS.texture, 0.28))
  const musicVolume = ref(readStoredNumber(STORAGE_KEYS.music, 0.42))
  const isPlaying = ref(false)
  const shouldResumeOnGesture = ref(readStoredBoolean(STORAGE_KEYS.resume, false))
  const manifest = ref<AudioManifest | null>(null)

  const sceneProfile = computed(() => DEFAULT_SCENE_AUDIO_PROFILES[scene.value])
  const sceneManifest = computed(() => manifest.value?.scenes?.[scene.value] ?? null)
  const sceneLabel = computed(() => sceneManifest.value?.label ?? sceneProfile.value.label)
  const primaryLabel = computed(() => sceneManifest.value?.primary?.label ?? sceneProfile.value.primary.label)
  const textureLabel = computed(() => sceneManifest.value?.texture?.label ?? sceneProfile.value.texture.label)
  const activeMusicTrack = computed<ExternalAudioTrack | null>(() => {
    const scopedTracks = sceneManifest.value?.music
    if (scopedTracks && scopedTracks.length > 0) return scopedTracks[0]
    const defaultTracks = manifest.value?.defaultMusic
    return defaultTracks && defaultTracks.length > 0 ? defaultTracks[0] : null
  })
  const musicLabel = computed(() => buildTrackLabel(activeMusicTrack.value))
  const hasMusic = computed(() => activeMusicTrack.value !== null)

  let audioCtx: AudioContext | null = null
  let masterGain: GainNode | null = null
  let primaryGain: GainNode | null = null
  let textureGain: GainNode | null = null
  let musicGain: GainNode | null = null
  let primaryLayer: LayerHandle | null = null
  let textureLayer: LayerHandle | null = null
  let musicLayer: MusicHandle | null = null
  let resumeListenersArmed = false

  function setPersistentPlaybackPreference(value: boolean) {
    shouldResumeOnGesture.value = value
    writeStorage(STORAGE_KEYS.resume, String(value))
  }

  function applyGain(node: GainNode | null, value: number) {
    if (!node || !audioCtx) return
    const now = audioCtx.currentTime
    node.gain.cancelScheduledValues(now)
    node.gain.setTargetAtTime(value, now, 0.08)
  }

  function applyUserMix() {
    applyGain(masterGain, masterVolume.value)
    applyGain(primaryGain, primaryVolume.value)
    applyGain(textureGain, textureVolume.value)
    applyGain(musicGain, musicVolume.value)
  }

  function pauseMediaElement(element: HTMLAudioElement | null) {
    if (!element) return
    element.pause()
  }

  async function playMediaElement(element: HTMLAudioElement | null) {
    if (!element) return
    try {
      await element.play()
    } catch {
      armResumeListeners()
    }
  }

  function destroyLayer(layer: LayerHandle | null) {
    if (!layer) return

    if (layer.source) {
      try {
        layer.source.stop()
      } catch {
        // Buffer sources throw if already stopped.
      }
      layer.source.disconnect()
    }

    if (layer.mediaElement) {
      layer.mediaElement.pause()
      layer.mediaElement.src = ''
      layer.mediaElement.load()
    }

    layer.mediaSource?.disconnect()
    layer.filter.disconnect()
    layer.trim.disconnect()
  }

  function destroyMusicLayer() {
    if (!musicLayer) return
    musicLayer.mediaElement.pause()
    musicLayer.mediaElement.src = ''
    musicLayer.mediaElement.load()
    musicLayer.mediaSource.disconnect()
    musicLayer.trim.disconnect()
    musicLayer = null
  }

  function disconnectNode(node: AudioNode | null) {
    if (!node) return
    node.disconnect()
  }

  function clearSceneLayers() {
    destroyLayer(primaryLayer)
    destroyLayer(textureLayer)
    primaryLayer = null
    textureLayer = null
  }

  function createExternalAudioElement(src: string, crossOrigin?: '' | 'anonymous' | 'use-credentials'): HTMLAudioElement {
    const element = new Audio(src)
    element.preload = 'auto'
    element.crossOrigin = crossOrigin ?? 'anonymous'
    ;(element as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    return element
  }

  function createExternalLayer(resource: ExternalLayerResource, output: GainNode): LayerHandle | null {
    if (!audioCtx) return null

    const mediaElement = createExternalAudioElement(resource.src, resource.crossOrigin)
    mediaElement.loop = resource.loop ?? true

    const mediaSource = audioCtx.createMediaElementSource(mediaElement)
    const filter = audioCtx.createBiquadFilter()
    applyFilterConfig(filter, resource.filter)

    const trim = audioCtx.createGain()
    trim.gain.value = resource.trim ?? 1

    mediaSource.connect(filter)
    filter.connect(trim)
    trim.connect(output)

    return {
      source: null,
      mediaElement,
      mediaSource,
      filter,
      trim,
    }
  }

  function createSynthLayer(profile: LayerProfile, output: GainNode): LayerHandle | null {
    if (!audioCtx) return null

    const source = audioCtx.createBufferSource()
    source.buffer = createLayerBuffer(audioCtx, profile)
    source.loop = true

    const filter = audioCtx.createBiquadFilter()
    applyFilterConfig(filter, profile.filter)

    const trim = audioCtx.createGain()
    trim.gain.value = profile.trim

    source.connect(filter)
    filter.connect(trim)
    trim.connect(output)
    source.start()

    return {
      source,
      mediaElement: null,
      mediaSource: null,
      filter,
      trim,
    }
  }

  function createMusicLayer(track: ExternalAudioTrack, output: GainNode): MusicHandle | null {
    if (!audioCtx) return null

    const mediaElement = createExternalAudioElement(track.src, track.crossOrigin)
    mediaElement.loop = track.loop ?? true

    const mediaSource = audioCtx.createMediaElementSource(mediaElement)
    const trim = audioCtx.createGain()
    trim.gain.value = track.gain ?? 1

    mediaSource.connect(trim)
    trim.connect(output)

    return {
      mediaElement,
      mediaSource,
      trim,
    }
  }

  function rebuildSceneLayers() {
    if (!audioCtx || !primaryGain || !textureGain || !musicGain) return

    clearSceneLayers()
    destroyMusicLayer()

    primaryLayer = sceneManifest.value?.primary
      ? createExternalLayer(sceneManifest.value.primary, primaryGain)
      : createSynthLayer(sceneProfile.value.primary, primaryGain)

    textureLayer = sceneManifest.value?.texture
      ? createExternalLayer(sceneManifest.value.texture, textureGain)
      : createSynthLayer(sceneProfile.value.texture, textureGain)

    if (activeMusicTrack.value) {
      musicLayer = createMusicLayer(activeMusicTrack.value, musicGain)
    }
  }

  function ensureGraph() {
    if (audioCtx && masterGain && primaryGain && textureGain && musicGain) return

    audioCtx = new AudioContext()
    masterGain = audioCtx.createGain()
    primaryGain = audioCtx.createGain()
    textureGain = audioCtx.createGain()
    musicGain = audioCtx.createGain()

    masterGain.gain.value = masterVolume.value
    primaryGain.gain.value = primaryVolume.value
    textureGain.gain.value = textureVolume.value
    musicGain.gain.value = musicVolume.value

    primaryGain.connect(masterGain)
    textureGain.connect(masterGain)
    musicGain.connect(masterGain)
    masterGain.connect(audioCtx.destination)

    rebuildSceneLayers()
  }

  async function playActiveMediaLayers() {
    await playMediaElement(primaryLayer?.mediaElement ?? null)
    await playMediaElement(textureLayer?.mediaElement ?? null)
    await playMediaElement(musicLayer?.mediaElement ?? null)
  }

  function pauseActiveMediaLayers() {
    pauseMediaElement(primaryLayer?.mediaElement ?? null)
    pauseMediaElement(textureLayer?.mediaElement ?? null)
    pauseMediaElement(musicLayer?.mediaElement ?? null)
  }

  async function start() {
    ensureGraph()

    if (!audioCtx) return
    if (!primaryLayer || !textureLayer) rebuildSceneLayers()

    if (audioCtx.state !== 'running') {
      await audioCtx.resume()
    }

    applyUserMix()
    await playActiveMediaLayers()
    isPlaying.value = true
    setPersistentPlaybackPreference(true)
    disarmResumeListeners()
  }

  function stop() {
    setPersistentPlaybackPreference(false)
    isPlaying.value = false
    pauseActiveMediaLayers()

    if (!audioCtx) return
    if (audioCtx.state === 'running') {
      void audioCtx.suspend()
    }
  }

  function dispose(closeContext: boolean) {
    clearSceneLayers()
    destroyMusicLayer()

    disconnectNode(primaryGain)
    disconnectNode(textureGain)
    disconnectNode(musicGain)
    disconnectNode(masterGain)

    primaryGain = null
    textureGain = null
    musicGain = null
    masterGain = null

    if (closeContext && audioCtx) {
      void audioCtx.close()
    }

    audioCtx = null
    isPlaying.value = false
  }

  function setPrimaryVolume(value: number) {
    primaryVolume.value = clamp01(value)
    writeStorage(STORAGE_KEYS.primary, String(primaryVolume.value))
    applyGain(primaryGain, primaryVolume.value)
  }

  function setTextureVolume(value: number) {
    textureVolume.value = clamp01(value)
    writeStorage(STORAGE_KEYS.texture, String(textureVolume.value))
    applyGain(textureGain, textureVolume.value)
  }

  function setMusicVolume(value: number) {
    musicVolume.value = clamp01(value)
    writeStorage(STORAGE_KEYS.music, String(musicVolume.value))
    applyGain(musicGain, musicVolume.value)
  }

  function setMasterVolume(value: number) {
    masterVolume.value = clamp01(value)
    writeStorage(STORAGE_KEYS.master, String(masterVolume.value))
    applyGain(masterGain, masterVolume.value)
  }

  async function loadManifest() {
    if (typeof window === 'undefined') return

    try {
      const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
      if (!response.ok) return

      const data = await response.json() as AudioManifest
      if (data.version !== 1) return
      manifest.value = data
    } catch {
      manifest.value = null
    }
  }

  async function handleResumeGesture() {
    resumeListenersArmed = false
    if (!shouldResumeOnGesture.value || isPlaying.value) return

    try {
      await start()
    } catch {
      armResumeListeners()
    }
  }

  function armResumeListeners() {
    if (typeof window === 'undefined' || resumeListenersArmed || !shouldResumeOnGesture.value || isPlaying.value) return
    resumeListenersArmed = true
    window.addEventListener('pointerdown', handleResumeGesture, { once: true, passive: true })
    window.addEventListener('keydown', handleResumeGesture, { once: true })
  }

  function disarmResumeListeners() {
    if (typeof window === 'undefined' || !resumeListenersArmed) return
    resumeListenersArmed = false
    window.removeEventListener('pointerdown', handleResumeGesture)
    window.removeEventListener('keydown', handleResumeGesture)
  }

  watch([scene, manifest], async () => {
    if (!audioCtx) return

    const shouldKeepPlaying = isPlaying.value
    rebuildSceneLayers()
    applyUserMix()

    if (shouldKeepPlaying) {
      if (audioCtx.state !== 'running') {
        await audioCtx.resume()
      }
      await playActiveMediaLayers()
    }
  })

  onMounted(() => {
    void loadManifest()

    if (shouldResumeOnGesture.value) {
      armResumeListeners()
    }
  })

  onBeforeUnmount(() => {
    disarmResumeListeners()
    dispose(true)
  })

  return {
    masterVolume,
    primaryVolume,
    textureVolume,
    musicVolume,
    sceneLabel,
    primaryLabel,
    textureLabel,
    musicLabel,
    hasMusic,
    isPlaying,
    start,
    stop,
    setPrimaryVolume,
    setTextureVolume,
    setMusicVolume,
    setMasterVolume,
  }
}
