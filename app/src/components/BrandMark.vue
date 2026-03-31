<script setup lang="ts">
// BrandMark — always-visible floating brand identity
// Two ink whales chasing each other — 水墨鲸 style
</script>

<template>
  <div class="brand-mark" aria-label="Inner — immersive markdown editor">
    <svg
      class="brand-icon"
      width="48"
      height="48"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="ink-wash" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.3" />
        </filter>
        <filter id="eye-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Faint circular current -->
      <circle
        cx="32" cy="32" r="28"
        stroke="currentColor"
        stroke-width="0.35"
        fill="none"
        opacity="0.08"
        class="flow-ring"
      />

      <!-- ── Whale A (upper-right, swimming clockwise) ── -->
      <g class="fish fish-a" filter="url(#ink-wash)">
        <!--
          Whale body — large rounded head tapering to narrow tail peduncle.
          The dorsal line is a smooth convex hump, the belly a rounder curve.
        -->
        <path
          d="M 46 14
             C 42 7, 33 5, 26 8
             C 22 10, 18 14, 16 18
             C 22 13, 30 9, 38 10
             C 42 11, 45 12, 46 14 Z"
          fill="currentColor"
          opacity="0.8"
        />

        <!-- Tail flukes — the defining whale feature, wide horizontal fork -->
        <path
          d="M 16 18 C 13 15, 10 14.5, 7 13"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.55"
        />
        <path
          d="M 16 18 C 13 21, 10 22, 7 23"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.45"
        />
        <!-- Fluke tips — thin ink dissolving -->
        <path
          d="M 7 13 C 5.5 12, 4 12.5, 3 11.5"
          stroke="currentColor" stroke-width="0.6" stroke-linecap="round" fill="none" opacity="0.15"
        />
        <path
          d="M 7 23 C 5.5 24, 4 23.5, 3 24.5"
          stroke="currentColor" stroke-width="0.5" stroke-linecap="round" fill="none" opacity="0.12"
        />

        <!-- Dorsal fin — small curved fin on back -->
        <path
          d="M 30 7.5 C 29 5, 27 4.5, 25.5 5.5"
          stroke="currentColor" stroke-width="1" stroke-linecap="round" fill="none" opacity="0.4"
        />

        <!-- Pectoral flipper — short and rounded, slightly swept back -->
        <path
          d="M 37 13.5 C 35 16, 33 17, 31 17.5"
          stroke="currentColor" stroke-width="1.1" stroke-linecap="round" fill="none" opacity="0.3"
        />

        <!-- Eye — small and gentle, placed low on the large head -->
        <circle cx="43.5" cy="12" r="1.3" class="fish-eye" filter="url(#eye-glow)" />

        <!-- Blow spout — tiny ink dots above the head -->
        <circle cx="42" cy="8" r="0.5" fill="currentColor" opacity="0.12" />
        <circle cx="43.5" cy="6.5" r="0.35" fill="currentColor" opacity="0.08" />
        <circle cx="41" cy="6" r="0.3" fill="currentColor" opacity="0.06" />
      </g>

      <!-- ── Whale B (lower-left, 180° rotated mirror) ── -->
      <g class="fish fish-b" filter="url(#ink-wash)" transform="rotate(180 32 32)">
        <path
          d="M 46 14
             C 42 7, 33 5, 26 8
             C 22 10, 18 14, 16 18
             C 22 13, 30 9, 38 10
             C 42 11, 45 12, 46 14 Z"
          fill="currentColor"
          opacity="0.8"
        />
        <path
          d="M 16 18 C 13 15, 10 14.5, 7 13"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.55"
        />
        <path
          d="M 16 18 C 13 21, 10 22, 7 23"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.45"
        />
        <path
          d="M 7 13 C 5.5 12, 4 12.5, 3 11.5"
          stroke="currentColor" stroke-width="0.6" stroke-linecap="round" fill="none" opacity="0.15"
        />
        <path
          d="M 7 23 C 5.5 24, 4 23.5, 3 24.5"
          stroke="currentColor" stroke-width="0.5" stroke-linecap="round" fill="none" opacity="0.12"
        />
        <path
          d="M 30 7.5 C 29 5, 27 4.5, 25.5 5.5"
          stroke="currentColor" stroke-width="1" stroke-linecap="round" fill="none" opacity="0.4"
        />
        <path
          d="M 37 13.5 C 35 16, 33 17, 31 17.5"
          stroke="currentColor" stroke-width="1.1" stroke-linecap="round" fill="none" opacity="0.3"
        />
        <circle cx="43.5" cy="12" r="1.3" class="fish-eye" filter="url(#eye-glow)" />
        <circle cx="42" cy="8" r="0.5" fill="currentColor" opacity="0.12" />
        <circle cx="43.5" cy="6.5" r="0.35" fill="currentColor" opacity="0.08" />
        <circle cx="41" cy="6" r="0.3" fill="currentColor" opacity="0.06" />
      </g>

      <!-- Center dot — the stillness between two giants -->
      <circle cx="32" cy="32" r="1.4" class="center-dot" />
    </svg>

    <span class="brand-text">Inner</span>
  </div>
</template>

<style scoped>
.brand-mark {
  position: fixed;
  top: 12px;
  left: 16px;
  z-index: var(--z-controls);
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0.45;
  cursor: default;
  transition: opacity var(--transition-medium);
  user-select: none;
  pointer-events: auto;
}

.brand-mark:hover {
  opacity: 0.92;
}

.brand-icon {
  color: var(--color-text-secondary);
  transition: color var(--transition-medium);
  flex-shrink: 0;
}

.brand-mark:hover .brand-icon {
  color: var(--color-text-primary);
}

.fish-eye {
  fill: var(--color-accent);
  transition: fill var(--transition-medium);
}

.center-dot {
  fill: var(--color-accent);
  opacity: 0.5;
  transition: fill var(--transition-medium), opacity var(--transition-medium);
}

.brand-mark:hover .center-dot {
  opacity: 0.85;
}

/* Slow rotation — the eternal chase */
@keyframes fish-swim {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fish-a {
  transform-origin: 32px 32px;
  animation: fish-swim 30s linear infinite;
}

.fish-b {
  transform-origin: 32px 32px;
  animation: fish-swim 30s linear infinite;
}

.flow-ring {
  transform-origin: 32px 32px;
  animation: fish-swim 60s linear infinite reverse;
}

/* Pause animation on hover — the whales notice you */
.brand-mark:hover .fish-a,
.brand-mark:hover .fish-b,
.brand-mark:hover .flow-ring {
  animation-play-state: paused;
}

.brand-text {
  font-family: var(--font-sans);
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  transition: color var(--transition-medium);
}

.brand-mark:hover .brand-text {
  color: var(--color-text-heading);
}

@media (max-width: 768px) {
  .brand-mark {
    top: 10px;
    left: 12px;
  }

  .brand-text {
    font-size: 15px;
  }

  .brand-icon {
    width: 38px;
    height: 38px;
  }
}
</style>
