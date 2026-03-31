// Adapted from "Lone Planet and the Sun"

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

float hash12(vec2 v) {
  vec3 v3 = fract(vec3(v.x, v.y, v.x) * 0.1031);
  v3 += dot(v3, v3.yzx + 33.33);
  return fract((v3.x + v3.y) * v3.z);
}

float hash13(vec3 v) {
  vec3 v3 = fract(v * 0.1031);
  v3 += dot(v3, v3.yzx + 33.33);
  return fract((v3.x + v3.y) * v3.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec3 j = i + 1.0;

  float a1 = hash13(i);
  float b1 = hash13(vec3(j.x, i.y, i.z));
  float c1 = hash13(vec3(i.x, j.y, i.z));
  float d1 = hash13(vec3(j.x, j.y, i.z));
  float a2 = hash13(vec3(i.x, i.y, j.z));
  float b2 = hash13(vec3(j.x, i.y, j.z));
  float c2 = hash13(vec3(i.x, j.y, j.z));
  float d2 = hash13(j);

  float z0 = mix(mix(a1, b1, u.x), mix(c1, d1, u.x), u.y);
  float z1 = mix(mix(a2, b2, u.x), mix(c2, d2, u.x), u.y);
  return mix(z0, z1, u.z);
}

float sphereIntersect(vec3 ro, vec3 rd, vec3 p, float r) {
  vec3 oc = ro - p;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - r * r;
  float h = b * b - c;
  if (h < 0.0) return -1.0;
  return -b - sqrt(h);
}

float fbm3(vec3 p) {
  float a = 1.0;
  float t = 0.0;
  for (int i = 0; i < 6; i++) {
    t += a * noise3(p);
    a *= 0.5;
    p = 2.0 * p + 100.0;
  }
  return t;
}

vec3 planetPalette(float x) {
  vec3 col = vec3(0.1, 0.6, 0.9);
  col += 0.2 * sin(6.28318531 * x + vec3(0.3, 0.2, 0.1));
  col += 0.1 * sin(14.4513262 * x + vec3(0.1, 0.2, 0.3));
  return col;
}

vec3 planetColor(vec3 p) {
  p *= 2.0;
  float t = uTime;
  vec3 q = vec3(
    fbm3(p + t * 0.03) * 0.5,
    fbm3(p) * 0.5,
    fbm3(p + 33.33) * 0.5
  );
  vec3 r = vec3(
    fbm3(p + q + t * 0.01) * 0.5,
    fbm3(p + q) * 0.5,
    fbm3(p + q + 33.33) * 0.6
  );
  float f = fbm3(p + 5.0 * r + t * 0.02) * 0.5;

  vec3 col = planetPalette(r.y);
  col *= clamp(f * f, 0.0, 1.0) * 0.9 + 0.1;
  return clamp(col, 0.0, 1.0);
}

vec3 shade(vec3 rd, vec3 p) {
  vec3 normal = normalize(p);
  vec3 dif = vec3(0.03);
  vec3 sunDir = vec3(0.0, 0.0, 1.0);
  vec3 sunCol = vec3(1.0, 0.9, 0.9) * 4.0;
  float sunDif = clamp(dot(normal, sunDir) * 0.9 + 0.1, 0.0, 1.0);
  dif += sunCol * sunDif;

  vec3 mate = planetColor(p) * 0.4;
  vec3 col = mate * dif;
  float fres = clamp(1.0 + dot(normal, rd), 0.0, 1.0);
  float sunFres = fres * clamp(dot(rd, sunDir), 0.0, 1.0);
  col *= 1.0 - fres;
  col += pow(sunFres, 8.0) * vec3(0.4, 0.3, 0.1) * 5.0;
  return col;
}

vec3 perspectiveCamera(vec3 lookfrom, vec3 lookat, float tilt, float vfov, vec2 uv) {
  vec2 sc = vec2(sin(tilt), cos(tilt));
  vec3 vup = normalize(vec3(sc.x, sc.y, 0.0));
  vec3 w = normalize(lookat - lookfrom);
  vec3 u = cross(w, vup);
  vec3 v = cross(u, w);
  float wf = 1.0 / tan(vfov * 3.14159265 / 360.0);
  return normalize(uv.x * u + uv.y * v + wf * w);
}

float expstep(float x, float k) {
  return exp(k * x - k);
}

vec3 getBackground(vec3 rd) {
  vec3 sunDir = vec3(0.0, 0.0, 1.0);
  float sunDif = dot(rd, sunDir);
  vec3 col = vec3(1.0, 0.9, 0.9) * expstep(sunDif, 600.0);
  col += vec3(1.0, 1.0, 0.1) * expstep(sunDif, 100.0);
  col += vec3(1.0, 0.7, 0.7) * expstep(sunDif, 50.0);
  col += vec3(1.0, 0.6, 0.05) * expstep(sunDif, 10.0);
  return col;
}

vec3 tonemapAces(vec3 col) {
  return clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
}

vec3 saturateColor(vec3 col, float sat) {
  float grey = dot(col, vec3(0.2125, 0.7154, 0.0721));
  return grey + sat * (col - grey);
}

vec3 toneColor(vec3 col, float gain, float lift, float invgamma) {
  col = pow(col, vec3(invgamma));
  return (gain - lift) * col + lift;
}

vec3 gammaCorrection(vec3 col) {
  return pow(col, vec3(0.454545455));
}

vec3 vignette(vec3 col, vec2 coord, float strength, float amount) {
  float v = pow(16.0 * coord.x * coord.y * (1.0 - coord.x) * (1.0 - coord.y), strength);
  return col * ((1.0 - amount) + amount * v);
}

vec3 dither(vec3 col, vec2 coord, float amount) {
  return clamp(col + hash12(coord) * amount, 0.0, 1.0);
}

vec3 sunGlare(vec3 rd) {
  vec3 sunDir = vec3(0.0, 0.0, 1.0);
  vec3 glareCol = vec3(1.0, 0.6, 0.2);
  return glareCol * pow(max(dot(sunDir, rd), 0.0), 2.0);
}

void main() {
  vec2 res = uResolution;
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 coord = (2.0 * (fragCoord - res * 0.5)) / uResolution.y;

  float intensity = clamp(uIntensity, 0.0, 1.0);
  float theta = 1.88495559 + uTime * mix(0.12, 0.24, intensity);
  vec2 sc = vec2(sin(theta), cos(theta)) * mix(2.2, 1.8, intensity);
  vec3 ro = vec3(sc.x, mix(0.45, 0.65, intensity), sc.y);
  vec3 rd = perspectiveCamera(ro, vec3(0.0), 0.0, 50.0, coord);

  float t = sphereIntersect(ro, rd, vec3(0.0), 0.6);
  vec3 p = ro + rd * t;
  vec3 col = getBackground(rd);

  if (t >= 0.0) {
    col = shade(rd, p);
  }

  col += 0.2 * sunGlare(rd);
  col = tonemapAces(col);
  col = toneColor(col, mix(1.45, 1.8, intensity), 0.002, 1.2);
  col = saturateColor(col, 0.9);
  col = gammaCorrection(col);
  col = vignette(col, fragCoord / res, 0.25, 0.7);
  col = dither(col, fragCoord, 0.01);

  gl_FragColor = vec4(col, 1.0);
}
