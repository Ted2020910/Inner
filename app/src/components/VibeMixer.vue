<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  sceneLabel: string
  rainAmount: number
  blurAmount: number
  masterVolume: number
  primaryLabel: string
  primaryVolume: number
  textureLabel: string
  textureVolume: number
  hasMusic: boolean
  musicLabel: string
  musicVolume: number
  isAudioPlaying: boolean
}>()

const emit = defineEmits<{
  'update:rainAmount': [value: number]
  'update:blurAmount': [value: number]
  'update:masterVolume': [value: number]
  'update:primaryVolume': [value: number]
  'update:textureVolume': [value: number]
  'update:musicVolume': [value: number]
  'toggleAudio': []
}>()

const isOpen = ref(false)

function toggle() {
  isOpen.value = !isOpen.value
}

// Accent color cycle for visual differentiation
const accentColors = [
  'var(--mixer-accent-intensity)',
  'var(--mixer-accent-blur)',
  'var(--mixer-accent-rain)',
  'var(--mixer-accent-noise)',
  'var(--mixer-accent-intensity)',
  'var(--mixer-accent-blur)',
]

const sliders = computed(() => {
  const base = [
    { key: 'rainAmount', label: 'Intensity', value: props.rainAmount, min: 0, max: 1, step: 0.01 },
    { key: 'blurAmount', label: 'Blur', value: props.blurAmount, min: 0, max: 1, step: 0.01 },
    { key: 'masterVolume', label: 'Master', value: props.masterVolume, min: 0, max: 1, step: 0.01 },
    { key: 'primaryVolume', label: props.primaryLabel, value: props.primaryVolume, min: 0, max: 1, step: 0.01 },
    { key: 'textureVolume', label: props.textureLabel, value: props.textureVolume, min: 0, max: 1, step: 0.01 },
  ] as const

  return props.hasMusic
    ? [
        ...base,
        { key: 'musicVolume', label: 'Music', value: props.musicVolume, min: 0, max: 1, step: 0.01 },
      ] as const
    : base
})

type SliderKey = (typeof sliders.value)[number]['key']

function emitSliderUpdate(key: SliderKey, value: number) {
  switch (key) {
    case 'rainAmount':
      emit('update:rainAmount', value)
      return
    case 'blurAmount':
      emit('update:blurAmount', value)
      return
    case 'masterVolume':
      emit('update:masterVolume', value)
      return
    case 'primaryVolume':
      emit('update:primaryVolume', value)
      return
    case 'textureVolume':
      emit('update:textureVolume', value)
      return
    case 'musicVolume':
      emit('update:musicVolume', value)
      return
  }
}
</script>

<template>
  <div class="vibe-mixer">
    <button
      class="floating-toggle"
      :class="{ active: isOpen }"
      @click="toggle"
      title="Vibe Mixer"
      :aria-expanded="isOpen"
      aria-label="Toggle vibe mixer"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M2 20h.01" /><path d="M7 20v-4" /><path d="M12 20v-8" /><path d="M17 20V8" /><path d="M22 20V4" />
      </svg>
    </button>

    <transition name="panel-slide">
      <div v-show="isOpen" class="vibe-panel floating-panel">
        <div class="vibe-header">
          <div class="vibe-header-copy">
            <span class="vibe-title">Vibe Mixer</span>
            <span class="vibe-scene">{{ sceneLabel }}</span>
            <span v-if="hasMusic" class="vibe-track">{{ musicLabel }}</span>
          </div>
          <div class="audio-section">
            <!-- Equalizer bars -->
            <div v-if="isAudioPlaying" class="eq-bars">
              <span class="eq-bar" />
              <span class="eq-bar" />
              <span class="eq-bar" />
            </div>
            <button
              class="audio-toggle"
              :class="{ playing: isAudioPlaying }"
              @click="$emit('toggleAudio')"
              :title="isAudioPlaying ? 'Mute ambience' : 'Play ambience'"
              :aria-label="isAudioPlaying ? 'Mute ambience' : 'Play ambience'"
            >
              <svg v-if="isAudioPlaying" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" />
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            </button>
          </div>
        </div>

        <div class="vibe-sliders">
          <div
            v-for="(slider, idx) in sliders"
            :key="slider.key"
            class="slider-row"
            :style="{ '--sl-accent': accentColors[idx] }"
          >
            <label class="slider-label">
              <span class="slider-dot" />
              {{ slider.label }}
            </label>
            <div class="slider-track-wrapper">
              <input
                type="range"
                class="slider-input"
                :min="slider.min"
                :max="slider.max"
                :step="slider.step"
                :value="slider.value"
                :aria-label="slider.label"
                @input="emitSliderUpdate(slider.key, parseFloat(($event.target as HTMLInputElement).value))"
              />
              <div class="slider-fill" :style="{ width: `${slider.value * 100}%` }" />
            </div>
            <span class="slider-value">{{ Math.round(slider.value * 100) }}</span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.vibe-mixer {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: var(--z-controls);
}

.vibe-panel {
  position: absolute;
  bottom: 52px;
  right: 0;
  width: 280px;
  padding: 18px 18px 20px;
  overflow: hidden;
  isolation: isolate;
}

/* Ink blob decorative background */
.vibe-panel::before {
  content: "";
  position: absolute;
  pointer-events: none;
  z-index: 0;
  left: -30px;
  bottom: 10px;
  width: 180px;
  height: 80px;
  border-radius: 999px;
  background:
    radial-gradient(ellipse at 20% 50%, var(--mixer-panel-ink-soft) 0%, transparent 54%),
    radial-gradient(ellipse at 50% 46%, var(--mixer-panel-ink-main) 0%, transparent 48%),
    radial-gradient(ellipse at 80% 58%, var(--mixer-panel-ink-deep) 0%, transparent 52%);
  filter: blur(18px);
  transform: rotate(10deg);
  opacity: 0.9;
}

.vibe-panel > * {
  position: relative;
  z-index: 1;
}

.vibe-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.vibe-header-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.vibe-title {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.vibe-scene {
  font-size: 11px;
  color: var(--color-text-primary);
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vibe-track {
  font-size: 10px;
  color: var(--color-text-muted);
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.audio-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Equalizer bars ── */
.eq-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.eq-bar {
  display: block;
  width: 2.5px;
  height: 3px;
  border-radius: 1px;
  background: var(--color-accent);
  animation: eq-bar 0.8s ease-in-out infinite;
}

.eq-bar:nth-child(1) { animation-delay: 0s; }
.eq-bar:nth-child(2) { animation-delay: 0.2s; }
.eq-bar:nth-child(3) { animation-delay: 0.4s; }

@keyframes eq-bar {
  0%, 100% { height: 3px; opacity: 0.5; }
  50% { height: 12px; opacity: 1; }
}

.audio-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.audio-toggle:hover {
  color: var(--color-text-primary);
  background: var(--color-hover-bg);
}

.audio-toggle.playing {
  color: var(--color-accent);
  border-color: var(--color-accent-border);
}

/* ── Sliders ── */
.vibe-sliders {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  min-width: 78px;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.slider-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--sl-accent);
  flex-shrink: 0;
  box-shadow: 0 0 8px var(--sl-accent);
  opacity: 1;
}

.slider-track-wrapper {
  flex: 1;
  position: relative;
  height: 22px;
  display: flex;
  align-items: center;
}

.slider-input {
  width: 100%;
  height: 5px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--slider-track-bg);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  position: relative;
  z-index: 2;
}

.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--sl-accent);
  border: 2px solid var(--slider-thumb-border);
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow: 0 0 8px var(--sl-accent);
}

.slider-input::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 16px var(--sl-accent);
}

.slider-input:active::-webkit-slider-thumb {
  transform: scale(1.15);
  box-shadow: 0 0 22px var(--sl-accent);
}

/* Firefox thumb */
.slider-input::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--sl-accent);
  border: 2px solid var(--slider-thumb-border);
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow: 0 0 8px var(--sl-accent);
}

.slider-input::-moz-range-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 16px var(--sl-accent);
}

.slider-fill {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 5px;
  background: linear-gradient(90deg,
    transparent,
    var(--sl-accent)
  );
  border-radius: 3px;
  pointer-events: none;
  z-index: 1;
  opacity: 0.8;
  transition: width 60ms linear;
}

.slider-value {
  font-size: 9px;
  color: var(--sl-accent);
  min-width: 32px;
  text-align: center;
  font-family: var(--font-mono);
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 999px;
  position: relative;
  background: transparent;
}

/* Pill background via pseudo-element for opacity control */
.slider-value::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--sl-accent);
  opacity: 0.22;
  z-index: -1;
}

@media (max-width: 768px) {
  .vibe-mixer {
    bottom: 12px;
    right: 12px;
  }

  .vibe-panel {
    width: min(280px, calc(100vw - 24px));
  }
}
</style>
