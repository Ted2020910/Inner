// Adapted from "Sunrise on saturn"

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

#define iResolution uResolution
#define iTime uTime

const vec4 hsv2rgbK = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + hsv2rgbK.xyz) * 6.0 - hsv2rgbK.www);
  return c.z * mix(hsv2rgbK.xxx, clamp(p - hsv2rgbK.xxx, 0.0, 1.0), c.y);
}

vec2 raySphere2(vec3 ro, vec3 rd, vec4 sph) {
  vec3 oc = ro - sph.xyz;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - sph.w * sph.w;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float tanhApprox(float x) {
  float x2 = x * x;
  return clamp(x * (27.0 + x2) / (27.0 + 9.0 * x2), -1.0, 1.0);
}

float rayPlane(vec3 ro, vec3 rd, vec4 p) {
  return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

const float FAR = 1E5;
const vec3 SUN_DIR = normalize(vec3(2.5, -2.0, 10.0));
const float PLANET_RADIUS = 425.0;
const vec3 PLANET_CENTER = vec3(0.0, -1.05 * PLANET_RADIUS, 0.0);
const vec4 PLANET_DIM = vec4(PLANET_CENTER, PLANET_RADIUS);
const vec4 SURFACE_DIM = vec4(PLANET_CENTER, 0.95 * PLANET_RADIUS);
const vec3 RING_NOR = normalize(vec3(-3.2, 1.0, 1.75));
const vec4 RING_DIM = vec4(RING_NOR, -dot(RING_NOR, PLANET_CENTER));

vec3 skyColor(vec3 ro, vec3 rd) {
  vec3 sunCol = hsv2rgb(vec3(0.066, 0.66, 0.000025));
  float sf = 1.001 - dot(rd, SUN_DIR);
  sf *= sf;
  return sunCol / sf;
}

vec3 applySky(vec3 col, inout float hit, vec3 ro, vec3 rd) {
  if (FAR > hit) return col;
  hit = FAR;
  col += skyColor(ro, rd);
  return col;
}

vec3 applyPlanet(vec3 col, inout float hit, vec3 ro, vec3 rd) {
  vec2 pi = raySphere2(ro, rd, PLANET_DIM);
  if (pi.x == -1.0 || pi.x > hit) return col;
  hit = pi.x;

  vec3 pos = ro + rd * pi.x;
  vec3 nor = normalize(pos - PLANET_DIM.xyz);
  float fre = 1.0 + dot(rd, nor);
  fre *= fre;
  vec3 refl = reflect(rd, nor);
  float rr = mix(1.0, 0.7, tanhApprox(0.0025 * (pi.y - pi.x)));
  vec3 refr = refract(rd, nor, rr);

  vec2 pri = raySphere2(pos, refr, PLANET_DIM);
  vec2 sri = raySphere2(pos, refr, SURFACE_DIM);
  vec3 rpos = pos + refr * pri.y;
  vec3 rnor = normalize(rpos - PLANET_DIM.xyz);
  vec3 rrefr = refract(refr, -rnor, rr);

  vec3 pcol = vec3(0.0);
  vec3 prefl = skyColor(pos, refl);
  vec3 prefr = skyColor(pos, rrefr);
  prefr = pow(prefr, vec3(1.25, 1.0, 0.75));
  pcol += prefl * fre;
  pcol += prefr * (1.0 - tanhApprox(0.004 * (sri.y - sri.x)));

  float pt = tanhApprox(0.025 * (pi.y - pi.x));
  return mix(col, pcol, pt);
}

vec3 applyRings(vec3 col, inout float hit, vec3 ro, vec3 rd) {
  float pt = rayPlane(ro, rd, RING_DIM);
  if (pt < 0.0 || pt > hit) return col;

  vec3 pos = ro + rd * pt;
  vec2 sri = raySphere2(pos, SUN_DIR, PLANET_DIM);
  vec3 spos = pos + SUN_DIR * sri.x;
  vec3 snor = normalize(spos - PLANET_DIM.xyz);
  float sfre = 1.0 + dot(SUN_DIR, snor);

  float r = length(pos - PLANET_CENTER);
  float ri0 = sin(0.5 * r);
  float ri1 = sin(0.2 * r);
  float ri2 = sin(0.12 * r);
  float ri3 = sin(0.033 * r - 2.0);
  float ri = smoothstep(-0.95, 0.75, ri0 * ri1 * ri2);
  ri = 0.5 * ri + 0.2 * ri3;
  ri *= 1.75;

  float sf = sri.x < 0.0 ? 1.0 : mix(0.05, 1.0, smoothstep(0.5, 1.0, sfre));
  float rdif = sqrt(max(dot(RING_NOR, SUN_DIR), 0.0));
  vec3 rcol = hsv2rgb(vec3(0.066, 0.85 + 0.1 * ri0 * ri1, ri)) * sf * rdif;
  rcol *= smoothstep(550.0, 560.0, r) * smoothstep(860.0, 850.0, r);
  return col + rcol;
}

vec3 render(vec3 ro, vec3 rd) {
  vec3 col = vec3(0.0);
  float hit = FAR;
  col = applySky(col, hit, ro, rd);
  col = applyPlanet(col, hit, ro, rd);
  col = applyRings(col, hit, ro, rd);
  return col;
}

vec3 effect(vec2 p) {
  vec3 ro = vec3(0.0, 0.0, -1280.0);
  vec3 la = vec3(0.0, 0.0, 0.0);
  vec3 up = vec3(0.0, 1.0, 0.0);

  vec3 ww = normalize(la - ro);
  vec3 uu = normalize(cross(up, ww));
  vec3 vv = cross(ww, uu);
  vec3 rd = normalize(-p.x * uu + p.y * vv + 4.0 * ww);

  vec3 col = render(ro, rd);
  col *= mix(0.8, 1.35, clamp(uIntensity, 0.0, 1.0));
  col = sqrt(max(col, 0.0));
  return col;
}

void main() {
  vec2 q = gl_FragCoord.xy / iResolution.xy;
  vec2 p = -1.0 + 2.0 * q;
  p.x *= iResolution.x / iResolution.y;

  vec3 col = effect(p);
  gl_FragColor = vec4(col, 1.0);
}
