<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'

const props = withDefaults(defineProps<{
  leftOffset?: number
}>(), {
  leftOffset: 20,
})

const isOpen = ref(false)

const duration = ref(25)
const remaining = ref(0)
const isRunning = ref(false)

let intervalId: ReturnType<typeof setInterval> | null = null

const progress = computed(() => {
  if (duration.value <= 0) return 0
  if (!isRunning.value && remaining.value === 0) return 0
  return 1 - remaining.value / (duration.value * 60)
})

const displayTime = computed(() => {
  const m = Math.floor(remaining.value / 60)
  const s = remaining.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const progressPercent = computed(() => Math.round(progress.value * 100))

const ringRadius = 44
const ringCircumference = 2 * Math.PI * ringRadius
const ringDashoffset = computed(() => ringCircumference * (1 - progress.value))

// Floating particles around the ring
const particles = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  delay: i * 0.4,
  duration: 3 + Math.random() * 2,
  size: 2 + Math.random() * 2,
}))

function startTimer() {
  if (isRunning.value) return
  remaining.value = duration.value * 60
  isRunning.value = true
  intervalId = setInterval(() => {
    if (remaining.value <= 0) { stopTimer(); return }
    remaining.value--
  }, 1000)
}

function pauseTimer() {
  isRunning.value = false
  if (intervalId) { clearInterval(intervalId); intervalId = null }
}

function resetTimer() { pauseTimer(); remaining.value = 0 }

function toggleTimer() {
  if (isRunning.value) {
    pauseTimer()
  } else if (remaining.value > 0) {
    isRunning.value = true
    intervalId = setInterval(() => {
      if (remaining.value <= 0) { stopTimer(); return }
      remaining.value--
    }, 1000)
  } else {
    startTimer()
  }
}

function stopTimer() { pauseTimer(); remaining.value = 0 }

function adjustDuration(delta: number) {
  if (isRunning.value) return
  duration.value = Math.max(1, Math.min(120, duration.value + delta))
}

// Scroll to adjust duration
function handleWheel(e: WheelEvent) {
  e.preventDefault()
  adjustDuration(e.deltaY > 0 ? -1 : 1)
}

onBeforeUnmount(() => { if (intervalId) clearInterval(intervalId) })
</script>

<template>
  <div class="timer-area" :style="{ '--timer-left': `${props.leftOffset}px` }">
    <button
      class="floating-toggle"
      :class="{ active: isOpen, running: isRunning }"
      @click="isOpen = !isOpen"
      title="Zen Timer"
      :aria-expanded="isOpen"
      aria-label="Toggle zen timer"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </button>

    <transition name="panel-slide">
      <div v-show="isOpen" class="timer-panel floating-panel">

        <!-- Ring display with effects -->
        <div class="timer-ring-container" :class="{ running: isRunning }" @wheel.prevent="handleWheel">
          <svg class="ring-svg" viewBox="0 0 100 100">
            <!-- Outer glow (breathing) -->
            <circle
              v-if="isRunning"
              cx="50" cy="50" :r="ringRadius + 2"
              fill="none"
              :stroke="'var(--timer-panel-ambient-soft)'"
              stroke-width="8"
              class="ring-glow"
            />

            <!-- Background track -->
            <circle
              cx="50" cy="50" :r="ringRadius"
              fill="none"
              stroke="var(--timer-ring-track)"
              stroke-width="3.5"
            />

            <!-- Tick marks -->
            <g v-for="i in 60" :key="i">
              <line
                :x1="50 + (ringRadius - 3) * Math.cos((i * 6 - 90) * Math.PI / 180)"
                :y1="50 + (ringRadius - 3) * Math.sin((i * 6 - 90) * Math.PI / 180)"
                :x2="50 + (ringRadius - (i % 5 === 0 ? 6 : 4.5)) * Math.cos((i * 6 - 90) * Math.PI / 180)"
                :y2="50 + (ringRadius - (i % 5 === 0 ? 6 : 4.5)) * Math.sin((i * 6 - 90) * Math.PI / 180)"
                :stroke="i % 5 === 0 ? 'var(--timer-ring-major)' : 'var(--timer-ring-minor)'"
                :stroke-width="i % 5 === 0 ? 0.8 : 0.4"
              />
            </g>

            <!-- Progress arc -->
            <circle
              cx="50" cy="50" :r="ringRadius"
              fill="none"
              stroke="url(#progressGradient)"
              stroke-width="3.5"
              stroke-linecap="round"
              :stroke-dasharray="ringCircumference"
              :stroke-dashoffset="ringDashoffset"
              transform="rotate(-90 50 50)"
              class="ring-progress"
            />

            <!-- Progress head dot -->
            <circle
              v-if="progress > 0.01"
              :cx="50 + ringRadius * Math.cos((progress * 360 - 90) * Math.PI / 180)"
              :cy="50 + ringRadius * Math.sin((progress * 360 - 90) * Math.PI / 180)"
              r="3"
              fill="var(--timer-head)"
              class="ring-head"
            />

            <!-- Gradient definition -->
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" :style="{ stopColor: 'var(--timer-ring-start)', stopOpacity: 0.96 }" />
                <stop offset="48%" :style="{ stopColor: 'var(--timer-ring-mid)', stopOpacity: 0.9 }" />
                <stop offset="100%" :style="{ stopColor: 'var(--timer-ring-end)', stopOpacity: 0.62 }" />
              </linearGradient>
            </defs>
          </svg>

          <!-- Floating particles (only when running) -->
          <div v-if="isRunning" class="particles">
            <span
              v-for="p in particles"
              :key="p.id"
              class="particle"
              :style="{
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                width: `${p.size}px`,
                height: `${p.size}px`,
              }"
            />
          </div>

          <!-- Time display -->
          <div class="timer-time">
            <transition name="digit-flip" mode="out-in">
              <span v-if="isRunning || remaining > 0" :key="displayTime" class="time-digits" :class="{ glowing: isRunning }">
                {{ displayTime }}
              </span>
              <span v-else class="time-idle" :key="'idle'">
                {{ duration }}<span class="time-unit">min</span>
              </span>
            </transition>
            <span v-if="isRunning" class="time-percent">{{ progressPercent }}%</span>
          </div>

          <!-- Status label -->
          <div v-if="isRunning || remaining > 0" class="timer-status">
            <span v-if="isRunning" class="status-running">
              <span class="status-dot" /> FOCUS
            </span>
            <span v-else class="status-paused">PAUSED</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="timer-controls">
          <button class="ctrl-btn" @click="adjustDuration(-5)" :disabled="isRunning">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
          <button
            class="ctrl-btn main-btn"
            :class="{ running: isRunning }"
            @click="toggleTimer"
          >
            <svg v-if="!isRunning && remaining === 0" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <svg v-else-if="isRunning" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
          <button class="ctrl-btn" @click="adjustDuration(5)" :disabled="isRunning">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>

        <button v-if="isRunning || remaining > 0" class="reset-btn" @click="resetTimer">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
          </svg>
          Reset
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.timer-area {
  position: fixed;
  bottom: 20px;
  left: var(--timer-left, 20px);
  z-index: var(--z-controls);
  transition: left 0.22s ease;
}

/* Running state pulse for the shared toggle */
.floating-toggle.running {
  color: var(--color-accent);
  animation: pulse-btn 2s ease-in-out infinite;
}

@keyframes pulse-btn {
  0%, 100% { box-shadow: 0 0 0 0 rgba(125, 211, 252, 0); }
  50% { box-shadow: 0 0 16px 3px var(--timer-panel-ambient); }
}

@media (max-width: 900px) {
  .timer-area {
    left: 12px;
  }
}

.timer-panel {
  position: absolute;
  bottom: 52px;
  left: 0;
  width: 210px;
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  isolation: isolate;
  background: var(--timer-panel-bg);
  border-color: var(--timer-panel-border);
  box-shadow: var(--shadow-panel), var(--timer-panel-shadow);
}

.timer-panel::before {
  content: "";
  position: absolute;
  pointer-events: none;
  z-index: 0;
}

.timer-panel::before {
  right: -36px;
  bottom: 16px;
  width: 190px;
  height: 92px;
  border-radius: 999px;
  background:
    radial-gradient(ellipse at 16% 50%, var(--timer-ink-band-soft) 0%, transparent 54%),
    radial-gradient(ellipse at 46% 46%, var(--timer-ink-band-main) 0%, transparent 48%),
    radial-gradient(ellipse at 82% 58%, var(--timer-ink-band-deep) 0%, transparent 52%);
  filter: blur(20px);
  transform: rotate(-14deg);
  opacity: 0.86;
}

.timer-panel > * {
  position: relative;
  z-index: 1;
}

/* ── Ring Container ── */
.timer-ring-container {
  position: relative;
  width: 140px;
  height: 140px;
  display: grid;
  place-items: center;
  border-radius: 50%;
}

.timer-ring-container::before {
  content: "";
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.timer-ring-container::before {
  inset: 18px;
  background:
    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.12), transparent 32%),
    radial-gradient(circle at 50% 45%, transparent 0, transparent 48%, rgba(255, 255, 255, 0.03) 100%),
    var(--timer-ring-core);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -14px 24px rgba(2, 6, 23, 0.16);
}

.ring-svg { width: 100%; height: 100%; }

.ring-svg,
.particles,
.timer-time,
.timer-status {
  position: relative;
  z-index: 1;
}

.ring-progress {
  transition: stroke-dashoffset 0.9s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 0 6px var(--timer-panel-ambient-soft)) drop-shadow(0 0 2px var(--timer-panel-ambient));
}

.ring-glow {
  animation: breathe 3s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 0.3; stroke-width: 6; }
  50% { opacity: 0.8; stroke-width: 10; }
}

.ring-head {
  filter: drop-shadow(0 0 8px var(--timer-panel-ambient));
  transition: cx 0.9s cubic-bezier(0.4, 0, 0.2, 1), cy 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Particles ── */
.particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.particle {
  position: absolute;
  top: 50%;
  left: 50%;
  border-radius: 50%;
  background: var(--timer-particle);
  box-shadow: 0 0 10px var(--timer-panel-ambient-soft);
  opacity: 0;
  animation: orbit linear infinite;
}

@keyframes orbit {
  0% {
    transform: rotate(0deg) translateX(52px) rotate(0deg);
    opacity: 0;
  }
  10% { opacity: 0.6; }
  80% { opacity: 0.3; }
  100% {
    transform: rotate(360deg) translateX(52px) rotate(-360deg);
    opacity: 0;
  }
}

/* ── Time Display ── */
.timer-time {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  z-index: 1;
}

.time-digits {
  font-size: 22px;
  font-weight: 200;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
  text-shadow: 0 0 16px rgba(255, 255, 255, 0.06);
  transition: text-shadow 0.4s ease;
}

.time-digits.glowing {
  text-shadow:
    0 0 20px rgba(125, 211, 252, 0.3),
    0 0 40px rgba(125, 211, 252, 0.1),
    0 0 6px rgba(255, 255, 255, 0.08);
}

.time-percent {
  font-size: 9px;
  font-weight: 400;
  color: var(--color-accent);
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
  opacity: 0.7;
  margin-top: 2px;
}

.time-idle {
  font-size: 28px;
  font-weight: 300;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.18);
}

.time-unit {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-left: 4px;
  font-weight: 400;
  letter-spacing: 0.08em;
}

/* Digit flip transition */
.digit-flip-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.digit-flip-leave-active {
  transition: all var(--transition-fast) ease-in;
}
.digit-flip-enter-from {
  opacity: 0;
  transform: translateY(6px) scale(0.95);
}
.digit-flip-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.95);
}

/* ── Status ── */
.timer-status {
  position: absolute;
  bottom: 18px;
  left: 0;
  right: 0;
  text-align: center;
  z-index: 1;
}

.status-running,
.status-paused {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--timer-status-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--color-border-subtle);
}

.status-running {
  color: var(--color-accent);
  gap: 4px;
}

.status-dot {
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: blink 1.5s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}

.status-paused { color: var(--color-warning); }

/* ── Controls ── */
.timer-controls {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: center;
  justify-content: center;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--timer-button-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.ctrl-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: var(--timer-button-hover);
  border-color: var(--timer-panel-border);
  transform: translateY(-1px);
}
.ctrl-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.ctrl-btn:active:not(:disabled) { transform: scale(0.92); }

.ctrl-btn.main-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
  background: linear-gradient(180deg, var(--toggle-hover-bg), var(--timer-button-bg));
  box-shadow: 0 8px 18px rgba(2, 6, 23, 0.14);
}

.ctrl-btn.main-btn:hover {
  background: linear-gradient(180deg, var(--color-surface-hover), var(--timer-button-bg));
  border-color: var(--color-border-hover);
  color: var(--color-text-heading);
  box-shadow: 0 8px 24px rgba(125, 211, 252, 0.18), 0 0 12px rgba(125, 211, 252, 0.1);
}

.ctrl-btn.main-btn.running {
  color: var(--color-accent);
  border-color: var(--timer-panel-border);
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.22), rgba(14, 165, 233, 0.14));
  box-shadow: 0 12px 26px var(--timer-panel-ambient);
}

.ctrl-btn.main-btn.running:hover {
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.3), rgba(14, 165, 233, 0.18));
  color: var(--color-text-heading);
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  transition: all var(--transition-base);
}

.reset-btn:hover {
  color: var(--color-text-secondary);
  background: var(--timer-reset-hover-bg);
  border-color: var(--timer-panel-border);
}

@media (max-width: 768px) {
  .timer-area {
    bottom: 12px;
    left: 12px;
  }
}
</style>
