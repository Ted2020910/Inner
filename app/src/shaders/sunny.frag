// Sunny shader adapted from "Binary star" in /reference shadertoy

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

#define PI 3.14159265

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.55;

  for (int i = 0; i < 5; i++) {
    value += amp * noise3(p);
    p *= 2.02;
    amp *= 0.5;
  }

  return value;
}

float length8(vec2 p) {
  p = p * p;
  p = p * p;
  p = p * p;
  return pow(p.x + p.y, 1.0 / 8.0);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float turbulence(vec3 p, float minFreq, float maxFreq, float width) {
  float value = 0.0;
  float cutoff = clamp(0.5 / width, 0.0, maxFreq);
  float f = minFreq;

  for (int i = 0; i < 6; i++) {
    if (f >= cutoff) break;
    value += abs(noise3(p * f) * 2.0 - 1.0) / f;
    f *= 2.0;
  }

  float fade = clamp(2.0 * (cutoff - f) / max(cutoff, 0.001), 0.0, 1.0);
  value += fade * abs(fbm(p * f) * 2.0 - 1.0) / max(f, 0.001);
  return 1.0 - value;
}

float sphereDist(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

float starDist(vec3 p, vec3 center, float radius, float spin, vec3 swirlAxis) {
  vec3 q = p - center;
  vec2 rz = rot(spin * 0.22 + swirlAxis.y * 0.8) * q.zx;
  q.z = rz.x;
  q.x = rz.y;
  float n = turbulence(vec3(q.zx * 24.0, q.y * 22.0 + spin), 0.1, 1.6, 0.03) * 0.12;
  return sphereDist(p, center, radius) - clamp(abs(n), 0.0, 1.0);
}

float diskDist(vec3 p, vec3 torus) {
  vec3 q = p;
  q.yz = rot(-0.5 * PI) * q.yz;
  vec2 w = vec2(length(q.xz) - torus.x, q.y * 0.5);
  return max(length8(w) - torus.y, abs(q.y) - torus.z);
}

float vortexDist(vec3 q, float spin) {
  q.y -= 2.2;
  q.x += 0.8;
  float h = 9.0;
  if (q.y < 0.0) return length(q) - 1.4;

  vec3 spinPos = vec3(rot(spin - sqrt(max(q.y, 0.0))) * q.xz, q.y - spin * 4.5);
  float curve = pow(q.y, 1.35) * 0.13;
  float shell = abs(length(q.xz) - curve) - 1.15;
  float noise = noise3(spinPos * vec3(0.22, 0.18, 0.22));
  shell -= clamp(curve * 0.16, 0.08, 0.55) * noise * 2.5;
  return max(shell, q.y - h);
}

float sceneSdf(vec3 p, float time, out vec4 d) {
  float orbit = time * 0.45;
  vec3 starA = vec3(cos(orbit) * 1.8, sin(orbit * 0.7) * 0.4 + 1.2, sin(orbit) * 0.8);
  vec3 starB = vec3(-cos(orbit) * 1.4, -sin(orbit * 0.8) * 0.3 - 0.8, -sin(orbit) * 0.65);

  float d1 = starDist(p, starA, 1.65, time, p);
  float d2 = starDist(p, starB, 1.05, -time * 1.1, p.yzx);
  float d3 = vortexDist(p / 0.24, time) * 0.24;
  float d4 = diskDist(p, vec3(2.4, 0.95, 0.32)) + (fbm(vec3((rot(time * 0.16 + p.z * 0.6) * p.xy) * 9.0, p.z * 4.0 - time)) - 0.5) * 0.38;

  d = vec4(d1, d2, d3, d4);
  float stars = smin(d1, d2, 1.25);
  float disk = smin(d4, d3, 0.9);
  return smin(stars, disk, 1.1);
}

vec3 firePalette(float i) {
  float T = 1500.0 + 1400.0 * i;
  vec3 L = vec3(7.4, 5.6, 4.4);
  L = pow(L, vec3(5.0)) * (exp(1.43876719683e5 / (T * L)) - 1.0);
  return 1.0 - exp(-5e8 / L);
}

float starfield(vec3 rd) {
  float n = noise3(rd * 260.0 + vec3(0.0, 0.0, uTime * 0.02));
  float m = noise3(rd * 520.0 - vec3(uTime * 0.03));
  float stars = smoothstep(0.82, 0.98, n) * smoothstep(0.74, 0.98, m);
  return stars;
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;

  float intensity = clamp(uIntensity, 0.0, 1.0);
  float time = uTime * mix(0.45, 0.95, intensity);

  vec3 ro = vec3(0.0, 0.1, -7.5 + intensity * 1.5);
  vec3 rd = normalize(vec3(uv, 1.2));

  float camYaw = 0.35 + time * 0.08;
  float camPitch = -0.18 + 0.08 * sin(time * 0.3);
  rd.xz = rot(camYaw) * rd.xz;
  ro.xz = rot(camYaw) * ro.xz;
  rd.yz = rot(camPitch) * rd.yz;
  ro.yz = rot(camPitch) * ro.yz;

  float td = 0.0;
  float t = 0.0;
  float d = 1.0;
  float ld = 0.0;
  const float h = 0.12;

  vec3 col = vec3(0.0);

  for (int i = 0; i < 56; i++) {
    if (td > 0.995 || t > 18.0 || d < 0.0015 * max(t, 1.0)) break;

    vec3 pos = ro + rd * t;
    vec4 parts;
    d = sceneSdf(pos, time, parts);

    ld = (h - d) * step(d, h);
    float w = (1.0 - td) * ld;

    float s1 = exp(-abs(parts.x) * 5.5);
    float s2 = exp(-abs(parts.y) * 6.0);
    float vx = exp(-abs(parts.z) * 4.0);
    float dk = exp(-abs(parts.w) * 4.8);

    vec3 hotA = firePalette(clamp(0.8 + s1 * 0.35, 0.0, 1.0));
    vec3 hotB = mix(vec3(0.65, 0.82, 1.3), vec3(1.0), firePalette(clamp(0.55 + s2 * 0.25, 0.0, 1.0)));
    vec3 diskCol = vec3(1.25, 0.55, 0.18);
    vec3 vortexCol = vec3(1.1, 0.52, 0.22);

    vec3 local = hotA * s1 + hotB * s2 + diskCol * dk + vortexCol * vx;
    col += local * (0.32 * w + 0.02);
    td += w + 1.0 / 240.0;

    float jitter = 0.85 + 0.25 * hash13(vec3(fragCoord.xy, float(i) + floor(time * 10.0)));
    d = max(abs(d) * jitter, 0.04);
    t += d * 0.5;
  }

  if (ld <= 0.001) {
    float stars = starfield(rd);
    vec3 bg = mix(vec3(0.01, 0.015, 0.03), vec3(0.03, 0.05, 0.10), 0.5 + 0.5 * rd.y);
    bg += vec3(0.8, 0.9, 1.0) * stars * 0.9;
    col += bg;
  }

  col *= mix(0.7, 1.2, intensity);
  col = col / (1.0 + col * 0.22);
  col = pow(max(col, 0.0), vec3(0.9));

  gl_FragColor = vec4(col, 1.0);
}
