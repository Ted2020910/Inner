Place external ambience layers and music tracks under `app/public/audio/`.

Structure:

- `app/public/audio/manifest.json`
- `app/public/audio/ambience/*.mp3`
- `app/public/audio/music/*.mp3`

Rules:

- All `src` paths in the manifest are web paths, for example `/audio/music/theme.mp3`.
- If a referenced file is missing, the browser will fail to load that track. The app will still run, but that external layer will be silent.
- If `manifest.json` is missing or empty, the app falls back to synthesized ambience only.
- `defaultMusic` applies to every scene unless that scene defines its own `music` array.
- `scenes.<sceneId>.primary` and `scenes.<sceneId>.texture` override the synthesized layers for that scene.

Minimal example:

```json
{
  "version": 1,
  "defaultMusic": [
    {
      "id": "focus-loop",
      "title": "Focus Loop",
      "src": "/audio/music/focus-loop.mp3",
      "loop": true,
      "gain": 0.8
    }
  ],
  "scenes": {
    "ocean": {
      "primary": {
        "src": "/audio/ambience/ocean-primary.mp3",
        "label": "Wave Wash",
        "trim": 1
      },
      "texture": {
        "src": "/audio/ambience/ocean-wind.mp3",
        "label": "Sea Wind",
        "trim": 0.35
      }
    }
  }
}
```
