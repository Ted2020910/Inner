// Thunderstorm shader adapted from "Zippy Zaps [394 Chars]" in /reference shadertoy

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

vec2 stanh(vec2 a) {
  vec2 x = clamp(a, -20.0, 20.0);
  vec2 ex = exp(x);
  vec2 enx = exp(-x);
  return (ex - enx) / (ex + enx);
}

void main() {
  float intensity = clamp(uIntensity, 0.0, 1.0);
  float time = uTime * mix(0.75, 1.35, intensity);

  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = mix(0.16, 0.22, intensity) * (fragCoord + fragCoord - uResolution.xy) / uResolution.y;
  vec2 v = uResolution.xy;

  vec4 z = vec4(1.0, 2.0, 3.0, 0.0);
  vec4 o = z;

  float a = 0.5;
  float t = time;

  for (float i = 1.0; i < 19.0; i += 1.0) {
    a += 0.03;
    t += 1.0;

    v = cos(t - 7.0 * uv * pow(a, i)) - 5.0 * uv;
    uv *= mat2(cos(i + 0.02 * t - z.wxzw * 11.0));
    uv += stanh(40.0 * dot(uv, uv) * cos(100.0 * uv.yx + t)) / 200.0;
    uv += 0.2 * a * uv;
    uv += cos(vec2(4.0 / exp(dot(o, o) / 100.0) + t)) / 300.0;

    float radius = 0.5 - dot(uv, uv);
    float safeRadius = sign(radius) * max(abs(radius), 0.05);
    vec2 field = (1.0 + i * dot(v, v)) * sin(1.5 * uv / safeRadius - 9.0 * uv.yx + t);
    o += (1.0 + cos(z + t)) / max(length(field), 0.02);
  }

  o = 25.6 / (min(o, 13.0) + 164.0 / max(o, vec4(0.001))) - dot(uv, uv) / 250.0;

  vec3 col = max(o.rgb, vec3(0.0));
  col *= mix(0.55, 1.15, intensity);
  col += vec3(0.01, 0.015, 0.025) * intensity;

  gl_FragColor = vec4(col, 1.0);
}
