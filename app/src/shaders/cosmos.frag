// Adapted from the local Shadertoy reference "Light Circles".
// Project version: procedural orbit in place of iMouse, driven by uTime and uIntensity.

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uBlurAmount;

vec2 safeNormalize(vec2 v) {
  float len = length(v);
  return len > 0.0001 ? v / len : vec2(0.0, 1.0);
}

float invDistanceGlow(vec2 uv, vec2 center, float power) {
  float d = max(length(uv - center), 0.0005);
  return power / d;
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float ringBlur(float radial, float radius, float width) {
  return 1.0 - smoothstep(width, width * 3.0, abs(radial - radius));
}

void main() {
  float intensity = clamp(uIntensity, 0.0, 1.0);
  float blurAmount = clamp(uBlurAmount, 0.0, 1.0);
  float matte = 0.25 + 0.75 * blurAmount;
  vec2 fragCoord = gl_FragCoord.xy;
  float aspect = uResolution.x / uResolution.y;
  vec2 baseUv = (2.0 * fragCoord - uResolution.xy) / uResolution.y;
  float time = uTime * mix(0.7, 1.25, intensity);
  vec2 frostOffset = (
    vec2(
      noise21(baseUv * 4.2 + vec2(time * 0.030, -time * 0.022)),
      noise21(baseUv.yx * 4.8 - vec2(time * 0.024, time * 0.016) + 7.4)
    ) - 0.5
  ) * (0.014 + matte * 0.040);
  float fitScale = mix(1.06, 0.98, intensity) / length(vec2(aspect, 1.0));
  vec2 uv = (baseUv + frostOffset) * fitScale;

  float orbitRadius = mix(0.06, 0.16, intensity);
  vec2 orbit = vec2(cos(time * 0.5), sin(time * 0.5)) * orbitRadius;
  orbit += vec2(sin(time * 0.23), cos(time * 0.37)) * (0.03 + 0.04 * intensity);

  vec3 lightColor = vec3(0.9, 0.65, 0.5);
  vec3 hazeColor = vec3(0.08, 0.055, 0.045);

  vec3 col = vec3(0.01, 0.008, 0.008);
  float radial = length(uv);
  float mainRadius = 0.98 + 0.03 * intensity;
  float orbitRadiusField = 0.92 + 0.02 * intensity;

  float outerGlow = invDistanceGlow(uv, safeNormalize(uv) * mainRadius, 0.048 + 0.008 * intensity);
  float outerSoft = ringBlur(radial, mainRadius, 0.060 + 0.018 * intensity + matte * 0.060);
  col += lightColor * outerGlow * mix(0.26, 0.12, matte);
  col += lightColor * outerSoft * (0.08 + 0.07 * matte);
  col += hazeColor * (0.10 + 0.14 * matte) * (1.0 - smoothstep(0.0, mainRadius + 0.10, radial));

  float circleMask = 1.0 - smoothstep(mainRadius - 0.04, mainRadius + 0.04, radial);
  if (radial < mainRadius + 0.08) {
    vec2 orbitUv = uv - orbit;
    float orbitRadial = length(orbitUv);
    float orbitGlow = invDistanceGlow(
      orbitUv,
      safeNormalize(orbitUv) * orbitRadiusField,
      0.04 + intensity * 0.008
    );
    float orbitSoft = ringBlur(orbitRadial, orbitRadiusField, 0.075 + intensity * 0.018 + matte * 0.055);
    col += lightColor * orbitGlow * mix(0.22, 0.10, matte);
    col += lightColor * orbitSoft * (0.07 + 0.06 * matte);

    float overlap = exp(-4.8 * dot(orbitUv, orbitUv));
    col += lightColor * overlap * (0.02 + intensity * 0.03) * (1.0 - 0.35 * matte);
  }

  float ring = smoothstep(0.14 + matte * 0.05, 0.0, abs(radial - mainRadius));
  col += lightColor * ring * (0.018 + 0.028 * intensity) * (1.0 - 0.4 * matte);

  float pulse = 0.5 + 0.5 * sin(time * 1.4 + length(uv) * 8.0);
  col *= 0.94 + 0.03 * pulse;

  float frostNoise = noise21(baseUv * 3.5 + vec2(time * 0.016, -time * 0.013));
  frostNoise = mix(
    frostNoise,
    noise21(baseUv * 7.1 - vec2(time * 0.018, time * 0.014) + 11.2),
    0.45
  );
  float frostMask = smoothstep(0.24, 0.92, frostNoise);
  col += hazeColor * frostMask * (0.02 + 0.08 * matte);

  vec2 screenUv = fragCoord / uResolution.xy - 0.5;
  col *= 1.0 - dot(screenUv, screenUv) * 0.18;
  col += hazeColor * circleMask * (0.04 + 0.04 * matte);

  col *= mix(1.0, 0.76, matte);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(luma) * vec3(1.0, 0.9, 0.84), 0.18 * matte);
  col = col / (1.0 + col * (0.45 + 0.35 * matte));

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
