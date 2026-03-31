// Snow shader adapted from "snowy" reference in /reference shadertoy

uniform vec2 uResolution;
uniform float uTime;
uniform float uSnowAmount;

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 permute(vec4 x) {
  return mod((34.0 * x + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );

  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = mod289(i);
  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0)) +
    i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m *= m;
  m *= m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;

  return 130.0 * dot(m, g);
}

float cellular2x2(vec2 p) {
  #define K 0.142857142857
  #define K2 0.0714285714285
  #define JITTER 0.8

  vec2 pi = mod(floor(p), 289.0);
  vec2 pf = fract(p);
  vec4 pfx = pf.x + vec4(-0.5, -1.5, -0.5, -1.5);
  vec4 pfy = pf.y + vec4(-0.5, -0.5, -1.5, -1.5);
  vec4 hash = permute(pi.x + vec4(0.0, 1.0, 0.0, 1.0));
  hash = permute(hash + pi.y + vec4(0.0, 0.0, 1.0, 1.0));
  vec4 ox = mod(hash, 7.0) * K + K2;
  vec4 oy = mod(floor(hash * K), 7.0) * K + K2;
  vec4 dx = pfx + JITTER * ox;
  vec4 dy = pfy + JITTER * oy;
  vec4 d = dx * dx + dy * dy;

  d.xy = min(d.xy, d.zw);
  d.x = min(d.x, d.y);
  return d.x;
}

float fbm(vec2 p) {
  float f = 0.0;
  float w = 0.5;

  for (int i = 0; i < 5; i++) {
    f += w * snoise(p);
    p *= 2.0;
    w *= 0.5;
  }

  return f;
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = fragCoord / uResolution.xy;
  uv.x *= uResolution.x / uResolution.y;

  float snowAmount = clamp(uSnowAmount, 0.0, 1.0);
  float speed = mix(1.0, 2.6, snowAmount);

  vec2 sunCenter = vec2(0.3, 0.9);

  float suns = 1.0 - distance(uv, sunCenter);
  suns = clamp(0.2 + suns, 0.0, 1.0);
  float sunHalo = smoothstep(0.85, 0.95, suns);

  float slope = 0.8 + uv.x - (uv.y * 2.3);
  slope = 1.0 - smoothstep(0.55, 0.0, slope);

  float terrainNoise = abs(fbm(uv * 1.5));
  slope = (terrainNoise * 0.2) + (slope - ((1.0 - terrainNoise) * slope * 0.1)) * 0.6;
  slope = clamp(slope, 0.0, 1.0);

  vec2 drift = vec2(-uTime * 1.8, uTime * 0.9) * speed;

  float attenuation = clamp(uv.x - (uv.y * 0.3), 0.0, 1.0);

  float f1 = 1.0 - cellular2x2((uv + drift * 0.1) * 8.0);
  float a1 = 1.0 - attenuation;
  float n1 = smoothstep(0.998, 1.0, f1) * 1.0 * a1;

  float f2 = 1.0 - cellular2x2((uv + drift * 0.2) * 6.0);
  float a2 = 1.0 - attenuation * 0.8;
  float n2 = smoothstep(0.995, 1.0, f2) * 0.85 * a2;

  float f3 = 1.0 - cellular2x2((uv + drift * 0.4) * 4.0);
  float a3 = 1.0 - attenuation * 0.6;
  float n3 = smoothstep(0.99, 1.0, f3) * 0.65 * a3;

  float f4 = 1.0 - cellular2x2((uv + drift * 0.6) * 3.0);
  float a4 = 1.0 - attenuation;
  float n4 = smoothstep(0.98, 1.0, f4) * 0.4 * a4;

  float f5 = 1.0 - cellular2x2((uv + drift) * 1.2);
  float a5 = 1.0 - attenuation;
  float n5 = smoothstep(0.98, 1.0, f5) * 0.25 * a5;

  float snowLayers = (n1 + n2 + n3 + n4 + n5) * mix(0.15, 1.0, snowAmount);
  float baseScene = 0.35 + (slope * (suns + 0.3)) + (sunHalo * 0.6);
  float snowOut = baseScene + snowLayers;

  vec3 col = vec3(snowOut * 0.9, snowOut, snowOut * 1.1);
  gl_FragColor = vec4(col, 1.0);
}
