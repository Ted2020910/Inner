// "Heartfelt" adapted — frosted glass rain on window.
// Single-pass, procedural night backdrop, no texture dependencies.

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

float S(float a, float b, float t) {
  float x = clamp((t - a) / (b - a), 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

vec3 N13(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

float N(float t) {
  return fract(sin(t * 12345.564) * 7658.76);
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

float Saw(float b, float t) {
  return S(0.0, b, t) * S(1.0, b, t);
}

// ── Raindrop layers ──

vec2 DropLayer2(vec2 uv, float t) {
  vec2 UV = uv;

  uv.y += t * 0.75;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;
  vec2 id = floor(uv * grid);

  float colShift = N(id.x);
  uv.y += colShift;

  id = floor(uv * grid);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);

  float x = n.x - 0.5;

  float y = UV.y * 20.0;
  float wiggle = sin(y + sin(y));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5);
  x *= 0.7;
  float ti = fract(t + n.z);
  y = (Saw(0.85, ti) - 0.5) * 0.9 + 0.5;
  vec2 p = vec2(x, y);

  // Main drop — slightly larger for better visibility on frosted glass
  float d = length((st - p) * a.yx);
  float mainDrop = S(0.45, 0.0, d);

  // Trail behind the drop
  float r = sqrt(S(1.0, y, st.y));
  float cd = abs(st.x - x);
  float trail = S(0.23 * r, 0.15 * r * r, cd);
  float trailFront = S(-0.02, 0.02, st.y - y);
  trail *= trailFront * r * r;

  // Droplet splashes
  y = UV.y;
  float trail2 = S(0.2 * r, 0.0, cd);
  float droplets = max(0.0, sin(y * (1.0 - y) * 120.0) - st.y) * trail2 * trailFront * n.z;
  y = fract(y * 10.0) + (st.y - 0.5);
  float dd = length(st - vec2(x, y));
  droplets = S(0.3, 0.0, dd);

  float m = mainDrop + droplets * r * trailFront;
  return vec2(m, trail);
}

float StaticDrops(vec2 uv, float t) {
  uv *= 40.0;
  vec2 id = floor(uv);
  uv = fract(uv) - 0.5;
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.7;
  float d = length(uv - p);
  float fade = Saw(0.025, fract(t + n.z));
  return S(0.3, 0.0, d) * fract(n.z * 10.0) * fade;
}

vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
  float s = StaticDrops(uv, t) * l0;
  vec2 m1 = DropLayer2(uv, t) * l1;
  vec2 m2 = DropLayer2(uv * 1.85, t) * l2;

  float c = s + m1.x + m2.x;
  c = S(0.3, 1.0, c);

  return vec2(c, max(m1.y * l0, m2.y * l1));
}

// ── Background ──

vec3 SkylineLayer(
  vec2 uv, float strips, float seed,
  float baseHeight, float heightRange, float blur01,
  vec3 buildingCol, vec3 warmCol, vec3 coolCol
) {
  float colId = floor(uv.x * strips + seed);
  float height = baseHeight + heightRange * N(colId * 0.731 + seed * 4.13);
  float edge = 0.006 + blur01 * 0.05;
  float building = 1.0 - S(height - edge, height + edge, uv.y);

  vec3 col = buildingCol * building;

  vec2 grid = vec2(uv.x * strips * 4.0 + seed * 11.0, uv.y * 22.0);
  vec2 gid = floor(grid);
  vec2 gst = fract(grid) - 0.5;
  float lit = step(0.72, hash21(gid + seed * 17.0));
  float windowShape = S(0.52 + blur01 * 0.35, 0.12, max(abs(gst.x) * 1.5, abs(gst.y)));
  float rowFade = 1.0 - S(height - 0.04, height + 0.01, uv.y);
  float window = building * lit * windowShape * rowFade;
  vec3 lightCol = mix(warmCol, coolCol, N(gid.x * 1.37 + gid.y * 4.19 + seed * 7.0));

  col += lightCol * window * mix(0.28, 0.10, blur01);
  col += lightCol * window * blur01 * 0.12;
  return col;
}

vec3 Backdrop(vec2 uv, float blur, float time) {
  uv = clamp(uv, 0.0, 1.0);

  float aspect = uResolution.x / uResolution.y;
  float blur01 = clamp((blur - 2.0) / 4.5, 0.0, 1.0);

  // Sky — pale blue-grey, brighter overall
  vec3 col = mix(vec3(0.06, 0.07, 0.10), vec3(0.14, 0.16, 0.22), pow(1.0 - uv.y, 0.8));
  col += vec3(0.08, 0.10, 0.14) * exp(-8.0 * abs(uv.y - 0.3));

  // Clouds
  float cloud = noise21(vec2(uv.x * aspect * 2.6 - time * 0.01, uv.y * 4.5));
  cloud += 0.55 * noise21(vec2(uv.x * aspect * 5.1 + time * 0.015 + 8.0, uv.y * 8.0 - 2.0));
  float cloudMask = S(0.48, 1.05, cloud) * S(0.12, 0.90, uv.y);
  col += vec3(0.06, 0.07, 0.09) * cloudMask * 0.7;

  // Moon
  float moon = S(0.19 + blur01 * 0.08, 0.0, length(vec2((uv.x - 0.78) * aspect, uv.y - 0.8)));
  col += vec3(0.28, 0.30, 0.35) * moon * 0.5;

  // Skyline
  vec3 farCity = SkylineLayer(
    uv, 18.0, 1.0, 0.14, 0.18, blur01,
    vec3(0.05, 0.055, 0.07),
    vec3(1.0, 0.72, 0.38),
    vec3(0.55, 0.78, 1.0)
  );
  vec3 nearCity = SkylineLayer(
    uv, 11.0, 5.0, 0.18, 0.28, blur01,
    vec3(0.06, 0.065, 0.08),
    vec3(1.0, 0.58, 0.22),
    vec3(0.4, 0.7, 1.0)
  );
  col += farCity * 0.8 + nearCity;

  // Point lights
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float lx = fract(N(fi * 17.13 + 2.0) + 0.03 * sin(time * 0.06 + fi * 5.0));
    float ly = mix(0.05, 0.32, N(fi * 11.7 + 9.0));
    float radius = mix(0.018, 0.055, N(fi * 4.3 + 1.0)) + blur01 * 0.045;
    float d = length(vec2((uv.x - lx) * aspect, uv.y - ly));
    float glow = S(radius + blur01 * 0.08, 0.0, d);
    vec3 lightCol = mix(vec3(1.0, 0.56, 0.18), vec3(0.35, 0.72, 1.0), N(fi * 13.7 + 4.0));

    col += lightCol * glow * (0.06 + 0.20 * blur01);

    float streak = exp(-abs(uv.x - lx) * aspect * 45.0) * exp(-uv.y * 11.0);
    col += lightCol * streak * 0.025 * (0.4 + blur01);
  }

  return col;
}

// ── Main ──

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;
  vec2 UV = fragCoord / uResolution.xy;

  float rainAmount = clamp(uIntensity, 0.0, 1.0);
  // Offset time so rain is already falling on first frame (no cold start)
  float T = (uTime + 20.0) * mix(0.85, 1.15, rainAmount);
  float t = T * 0.2;

  float maxBlur = mix(3.0, 6.0, rainAmount);
  float minBlur = 2.0;

  float zoom = -cos(T * 0.2);
  uv *= 0.7 + zoom * 0.3;
  UV = (UV - 0.5) * (0.9 + zoom * 0.1) + 0.5;

  float staticDrops = S(-0.5, 1.0, rainAmount) * 2.0;
  float layer1 = S(0.25, 0.75, rainAmount);
  float layer2 = S(0.0, 0.5, rainAmount);

  vec2 c = Drops(uv, t, staticDrops, layer1, layer2);

  // Normals for refraction — amplified for stronger drop lensing on frosted glass
  vec2 e = vec2(0.001, 0.0);
  float cx = Drops(uv + e, t, staticDrops, layer1, layer2).x;
  float cy = Drops(uv + e.yx, t, staticDrops, layer1, layer2).x;
  vec2 n = vec2(cx - c.x, cy - c.x) * 1.5;

  float focus = mix(maxBlur - c.y, minBlur, S(0.1, 0.2, c.x));

  // Multi-sample blur to simulate textureLod mipmap
  float blurRadius = focus * 0.008;
  vec2 refUV = UV + n;
  vec3 col = vec3(0.0);
  col += Backdrop(refUV + vec2(-blurRadius, -blurRadius), focus, T);
  col += Backdrop(refUV + vec2( 0.0,        -blurRadius), focus, T);
  col += Backdrop(refUV + vec2( blurRadius, -blurRadius), focus, T);
  col += Backdrop(refUV + vec2(-blurRadius,  0.0),        focus, T);
  col += Backdrop(refUV,                                   focus, T);
  col += Backdrop(refUV + vec2( blurRadius,  0.0),        focus, T);
  col += Backdrop(refUV + vec2(-blurRadius,  blurRadius), focus, T);
  col += Backdrop(refUV + vec2( 0.0,         blurRadius), focus, T);
  col += Backdrop(refUV + vec2( blurRadius,  blurRadius), focus, T);
  col /= 9.0;

  // ── Post-processing ──

  // Frosted glass layer — heavy frost, pale blue-grey
  vec3 frost = vec3(0.20, 0.22, 0.27);
  float frostAmount = mix(0.45, 0.60, rainAmount);
  col = mix(col, frost, frostAmount);

  // Where drops are, glass is clearer — drops "wipe" the frost
  float clearAmount = c.x * 0.35;
  col = mix(col, col * 1.3 + vec3(0.02), clearAmount);

  // Subtle warm/cool shift over time
  float postTime = (T + 3.0) * 0.5;
  float colFade = sin(postTime * 0.2) * 0.5 + 0.5;
  col *= mix(vec3(1.0), vec3(0.94, 0.96, 1.06), colFade);

  // Very soft vignette
  vec2 vigUV = UV - 0.5;
  col *= 1.0 - dot(vigUV, vigUV) * 0.3;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
