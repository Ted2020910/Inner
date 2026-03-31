import type { SceneId } from './useShader'

export type LayerKind =
  | 'rain'
  | 'storm'
  | 'wind'
  | 'snow'
  | 'waves'
  | 'drone'
  | 'pulse'
  | 'air'
  | 'rumble'

export interface LayerFilterConfig {
  type: BiquadFilterType
  frequency: number
  q?: number
}

export interface LayerProfile {
  label: string
  kind: LayerKind
  duration: number
  trim: number
  filter?: LayerFilterConfig
}

export interface ExternalAudioTrack {
  id: string
  title: string
  src: string
  artist?: string
  loop?: boolean
  gain?: number
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
}

export interface ExternalLayerResource {
  src: string
  label?: string
  trim?: number
  loop?: boolean
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
  filter?: LayerFilterConfig
}

export interface SceneAudioProfile {
  label: string
  primary: LayerProfile
  texture: LayerProfile
}

export interface SceneAudioManifestEntry {
  label?: string
  primary?: ExternalLayerResource
  texture?: ExternalLayerResource
  music?: ExternalAudioTrack[]
}

export interface AudioManifest {
  version: 1
  defaultMusic?: ExternalAudioTrack[]
  scenes?: Partial<Record<SceneId, SceneAudioManifestEntry>>
}

export const DEFAULT_SCENE_AUDIO_PROFILES: Record<SceneId, SceneAudioProfile> = {
  rain: {
    label: 'Night Rain',
    primary: { label: 'Rainfall', kind: 'rain', duration: 18, trim: 1.0, filter: { type: 'lowpass', frequency: 2600, q: 0.8 } },
    texture: { label: 'Window Hiss', kind: 'air', duration: 14, trim: 0.55, filter: { type: 'highpass', frequency: 320, q: 0.7 } },
  },
  'rain-day': {
    label: 'Rain Day',
    primary: { label: 'Mountain Wind', kind: 'wind', duration: 16, trim: 0.85, filter: { type: 'bandpass', frequency: 900, q: 0.5 } },
    texture: { label: 'Valley Rumble', kind: 'rumble', duration: 14, trim: 0.38, filter: { type: 'lowpass', frequency: 180, q: 0.9 } },
  },
  thunderstorm: {
    label: 'Thunderstorm',
    primary: { label: 'Storm Rain', kind: 'storm', duration: 18, trim: 1.05, filter: { type: 'lowpass', frequency: 2400, q: 0.9 } },
    texture: { label: 'Thunder Bed', kind: 'rumble', duration: 16, trim: 0.62, filter: { type: 'lowpass', frequency: 160, q: 1.1 } },
  },
  sunny: {
    label: 'Sunny',
    primary: { label: 'Warm Breeze', kind: 'wind', duration: 15, trim: 0.55, filter: { type: 'highpass', frequency: 550, q: 0.6 } },
    texture: { label: 'Heat Haze', kind: 'air', duration: 12, trim: 0.28, filter: { type: 'highpass', frequency: 1200, q: 0.5 } },
  },
  snow: {
    label: 'Snow Night',
    primary: { label: 'Snow Drift', kind: 'snow', duration: 16, trim: 0.52, filter: { type: 'highpass', frequency: 650, q: 0.7 } },
    texture: { label: 'Cold Air', kind: 'air', duration: 14, trim: 0.22, filter: { type: 'highpass', frequency: 1500, q: 0.6 } },
  },
  'digital-brain': {
    label: 'Digital Brain',
    primary: { label: 'Data Pulse', kind: 'pulse', duration: 12, trim: 0.42, filter: { type: 'bandpass', frequency: 780, q: 1.3 } },
    texture: { label: 'Circuit Hum', kind: 'drone', duration: 16, trim: 0.35, filter: { type: 'lowpass', frequency: 620, q: 0.8 } },
  },
  'drive-home': {
    label: 'Drive Home',
    primary: { label: 'Road Wash', kind: 'rain', duration: 16, trim: 0.7, filter: { type: 'bandpass', frequency: 1400, q: 0.7 } },
    texture: { label: 'Cabin Drone', kind: 'drone', duration: 16, trim: 0.26, filter: { type: 'lowpass', frequency: 240, q: 0.9 } },
  },
  ocean: {
    label: 'Sunrise on Saturn',
    primary: { label: 'Orbital Drone', kind: 'drone', duration: 18, trim: 0.32, filter: { type: 'lowpass', frequency: 520, q: 0.8 } },
    texture: { label: 'Solar Haze', kind: 'air', duration: 12, trim: 0.14, filter: { type: 'bandpass', frequency: 2400, q: 0.42 } },
  },
  sky: {
    label: 'Lone Planet and the Sun',
    primary: { label: 'Solar Wind', kind: 'wind', duration: 15, trim: 0.46, filter: { type: 'highpass', frequency: 900, q: 0.55 } },
    texture: { label: 'Void Haze', kind: 'air', duration: 12, trim: 0.18, filter: { type: 'highpass', frequency: 1700, q: 0.45 } },
  },
  cosmos: {
    label: 'Cosmos',
    primary: { label: 'Orbital Drone', kind: 'drone', duration: 18, trim: 0.34, filter: { type: 'lowpass', frequency: 520, q: 0.8 } },
    texture: { label: 'Radio Dust', kind: 'air', duration: 12, trim: 0.16, filter: { type: 'bandpass', frequency: 2600, q: 0.4 } },
  },
}
