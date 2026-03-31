// Elevated terrain
// Adapted from the local Shadertoy reference "Elevated analytical normal"
// to this project's single-pass uResolution / uTime / uIntensity contract.

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

const float SC = 220.0;
const float MAX_T = 5000.0 * SC;
const mat2 M2 = mat2(0.8, -0.6, 0.6, 0.8);
const mat2 M2T = mat2(0.8, 0.6, -0.6, 0.8);

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise12(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash12(i + vec2(0.0, 0.0));
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 noised(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);

    float a = hash12(p + vec2(0.0, 0.0));
    float b = hash12(p + vec2(1.0, 0.0));
    float c = hash12(p + vec2(0.0, 1.0));
    float d = hash12(p + vec2(1.0, 1.0));

    float k0 = a;
    float k1 = b - a;
    float k2 = c - a;
    float k4 = a - b - c + d;

    return vec3(
        k0 + k1 * u.x + k2 * u.y + k4 * u.x * u.y,
        du * (vec2(k1, k2) + k4 * u.yx)
    );
}

vec3 noisedd(vec2 x, out vec4 dd) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    vec2 ddu = 6.0 - 12.0 * f;

    float a = hash12(p + vec2(0.0, 0.0));
    float b = hash12(p + vec2(1.0, 0.0));
    float c = hash12(p + vec2(0.0, 1.0));
    float d = hash12(p + vec2(1.0, 1.0));

    float k0 = a;
    float k1 = b - a;
    float k2 = c - a;
    float k4 = a - b - c + d;

    float crossTerm = du.y * k4 * du.x;
    dd = vec4(
        ddu.x * u.y * k4 + ddu.x * k1,
        crossTerm,
        crossTerm,
        ddu.y * u.x * k4 + ddu.y * k2
    );

    return vec3(
        k0 + k1 * u.x + k2 * u.y + k4 * u.x * u.y,
        du * (vec2(k1, k2) + k4 * u.yx)
    );
}

float terrainH(vec2 x) {
    vec2 p = x * 0.003 / SC;
    float a = 0.0;
    float b = 1.0;
    vec2 d = vec2(0.0);
    for (int i = 0; i < 12; i++) {
        vec3 n = noised(p);
        d += n.yz;
        a += b * n.x / (1.0 + dot(d, d));
        b *= 0.5;
        p = M2 * p * 2.0;
    }
    return SC * 120.0 * a;
}

float terrainM(vec2 x) {
    vec2 p = x * 0.003 / SC;
    float a = 0.0;
    float b = 1.0;
    vec2 d = vec2(0.0);
    for (int i = 0; i < 8; i++) {
        vec3 n = noised(p);
        d += n.yz;
        a += b * n.x / (1.0 + dot(d, d));
        b *= 0.5;
        p = M2 * p * 2.0;
    }
    return SC * 120.0 * a;
}

float terrainL(vec2 x) {
    vec2 p = x * 0.003 / SC;
    float a = 0.0;
    float b = 1.0;
    vec2 d = vec2(0.0);
    for (int i = 0; i < 3; i++) {
        vec3 n = noised(p);
        d += n.yz;
        a += b * n.x / (1.0 + dot(d, d));
        b *= 0.5;
        p = M2 * p * 2.0;
    }
    return SC * 120.0 * a;
}

float raycast(vec3 ro, vec3 rd, float tmin, float tmax) {
    float t = tmin;
    for (int i = 0; i < 220; i++) {
        vec3 pos = ro + t * rd;
        float h = pos.y - terrainM(pos.xz);
        if (abs(h) < (0.0015 * t) || t > tmax) {
            break;
        }
        t += 0.4 * h;
    }
    return t;
}

float softShadow(vec3 ro, vec3 rd, float dis) {
    float minStep = clamp(dis * 0.01, SC * 0.5, SC * 50.0);
    float res = 1.0;
    float t = 0.001;
    for (int i = 0; i < 48; i++) {
        vec3 p = ro + t * rd;
        float h = p.y - terrainM(p.xz);
        res = min(res, 16.0 * h / t);
        t += max(minStep, h);
        if (res < 0.001 || p.y > (SC * 200.0)) {
            break;
        }
    }
    return clamp(res, 0.0, 1.0);
}

vec2 terrainHd(vec2 p) {
    float b = 1.0;
    vec2 e = vec2(0.0);
    vec2 d = vec2(0.0);
    vec4 r = vec4(0.0);
    mat2 m = mat2(1.0, 0.0, 0.0, 1.0);

    for (int i = 0; i < 12; i++) {
        vec4 dd;
        vec3 n = noisedd(p, dd);
        vec2 duxy = m * n.yz;
        r += vec4(m * dd.xy, m * dd.zw);
        e += n.yz;
        float term = 1.0 + dot(e, e);
        float x = 2.0 * (e.x * r.x + e.y * r.z);
        float y = 2.0 * (e.x * r.y + e.y * r.w);
        d += b * (term * duxy - n.x * vec2(x, y)) / (term * term);
        b *= 0.5;
        p = 2.0 * M2 * p;
        m = 2.0 * M2T * m;
    }

    return d;
}

vec3 calcNormal(vec3 pos) {
    float sca = 0.003 / SC;
    float amp = SC * 120.0;
    vec2 grad = amp * sca * terrainHd(pos.xz * sca);
    return normalize(vec3(-grad.x, 1.0, -grad.y));
}

float fbm(vec2 p) {
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        f += a * noise12(p);
        p = M2 * p * 2.02;
        a *= 0.5;
    }
    return f / 0.96875;
}

vec3 render(vec3 ro, vec3 rd) {
    float intensity = clamp(uIntensity, 0.0, 1.0);
    vec3 lightDir = normalize(vec3(-0.8, 0.42, -0.3));

    float tmin = 1.0;
    float tmax = MAX_T;
    float maxh = 250.0 * SC;
    float planeDen = rd.y;
    if (abs(planeDen) > 0.0001) {
        float tp = (maxh - ro.y) / planeDen;
        if (tp > 0.0) {
            if (ro.y > maxh) {
                tmin = max(tmin, tp);
            } else {
                tmax = min(tmax, tp);
            }
        }
    }

    float sundot = clamp(dot(rd, lightDir), 0.0, 1.0);
    float t = raycast(ro, rd, tmin, tmax);
    vec3 col;

    if (t > tmax) {
        col = vec3(0.30, 0.50, 0.85) - 0.5 * rd.y * rd.y;
        col = mix(col, 0.85 * vec3(0.70, 0.75, 0.85), pow(1.0 - max(rd.y, 0.0), 4.0));
        col += 0.25 * vec3(1.0, 0.72, 0.42) * pow(sundot, 5.0);
        col += 0.22 * vec3(1.0, 0.82, 0.60) * pow(sundot, 48.0);
        col += 0.18 * vec3(1.0, 0.86, 0.68) * pow(sundot, 320.0);

        float denom = max(abs(rd.y), 0.08);
        vec2 cloudPos = ro.xz + rd.xz * (SC * 1000.0 - ro.y) / denom;
        float clouds = smoothstep(0.50, 0.82, fbm(0.0005 * cloudPos / SC + vec2(0.0, uTime * 0.01)));
        float cloudFade = smoothstep(-0.05, 0.2, rd.y);
        col = mix(col, vec3(1.0, 0.96, 0.98), 0.38 * clouds * cloudFade);
        col = mix(col, 0.68 * vec3(0.40, 0.65, 1.0), pow(1.0 - max(rd.y, 0.0), 16.0));
    } else {
        vec3 pos = ro + t * rd;
        vec3 nor = calcNormal(pos);
        vec3 ref = reflect(rd, nor);
        vec3 halfVec = normalize(lightDir - rd);
        float fre = clamp(1.0 + dot(rd, nor), 0.0, 1.0);

        float rockNoise = noise12((7.0 / SC) * pos.xz);
        float strata = noise12(0.00007 * vec2(pos.x, pos.y * 48.0) / SC);
        col = (rockNoise * 0.25 + 0.75) * 0.9 *
              mix(vec3(0.08, 0.05, 0.03), vec3(0.10, 0.09, 0.08), strata);
        col = mix(col, 0.20 * vec3(0.45, 0.30, 0.15) * (0.50 + 0.50 * rockNoise), smoothstep(0.70, 0.90, nor.y));
        col = mix(col, 0.15 * vec3(0.30, 0.30, 0.10) * (0.25 + 0.75 * rockNoise), smoothstep(0.95, 1.0, nor.y));

        float detail = sqrt(max(fbm(pos.xz * 0.04 / SC) * fbm(pos.xz * 0.005 / SC), 0.0));
        col *= mix(0.85, 1.15, intensity) * (0.20 + 1.55 * detail);

        float snowLine = smoothstep(55.0, 80.0, pos.y / SC + 25.0 * fbm(0.01 * pos.xz / SC));
        float snowSlope = smoothstep(1.0 - 0.5 * snowLine, 1.0 - 0.1 * snowLine, nor.y);
        float snowFacing = 0.3 + 0.7 * smoothstep(0.0, 0.1, nor.x + snowLine * snowLine);
        float snowMask = snowLine * snowSlope * snowFacing;
        col = mix(col, 0.29 * vec3(0.62, 0.65, 0.70), smoothstep(0.1, 0.9, snowMask));

        float amb = clamp(0.5 + 0.5 * nor.y, 0.0, 1.0);
        float dif = clamp(dot(lightDir, nor), 0.0, 1.0);
        float bac = clamp(0.2 + 0.8 * dot(normalize(vec3(-lightDir.x, 0.0, lightDir.z)), nor), 0.0, 1.0);
        float sh = 1.0;
        if (dif >= 0.0001) {
            sh = softShadow(pos + lightDir * SC * 0.05, lightDir, t);
        }

        vec3 lin = vec3(0.0);
        lin += dif * vec3(8.0, 5.0, 3.0) * 1.2 *
               vec3(sh, sh * sh * 0.5 + 0.5 * sh, sh * sh * 0.8 + 0.2 * sh);
        lin += amb * vec3(0.40, 0.60, 1.00) * mix(0.95, 1.25, intensity);
        lin += bac * vec3(0.40, 0.50, 0.60);
        col *= lin;

        col += (0.7 + 0.3 * snowMask) *
               (0.04 + 0.96 * pow(clamp(1.0 + dot(halfVec, rd), 0.0, 1.0), 5.0)) *
               vec3(7.0, 5.0, 3.0) * dif * sh *
               pow(clamp(dot(nor, halfVec), 0.0, 1.0), 16.0);

        col += snowMask * 0.65 * pow(fre, 4.0) * vec3(0.3, 0.5, 0.6) * smoothstep(0.0, 0.6, ref.y);

        float fog = 1.0 - exp(-pow(0.001 * t / SC, 1.45));
        vec3 fogCol = 0.65 * vec3(0.40, 0.65, 1.0);
        col = mix(col, fogCol, fog * mix(0.85, 1.15, intensity));
    }

    col += 0.28 * vec3(1.0, 0.7, 0.3) * pow(sundot, 8.0);
    return sqrt(max(col, 0.0));
}

vec3 camPath(float t) {
    return SC * 1100.0 * vec3(cos(0.23 * t), 0.0, cos(1.5 + 0.21 * t));
}

mat3 setCamera(vec3 ro, vec3 ta, float cr) {
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(cr), cos(cr), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));
    return mat3(cu, cv, cw);
}

void moveCamera(float t, out vec3 ro, out vec3 ta, out float cr, out float fl) {
    ro = camPath(t);
    ta = camPath(t + 3.0);
    ro.y = terrainL(ro.xz) + 22.0 * SC;
    ta.y = ro.y - mix(18.0, 28.0, clamp(uIntensity, 0.0, 1.0)) * SC;
    cr = 0.2 * cos(0.1 * t);
    fl = 3.0;
}

void main() {
    float time = uTime * 0.08 + 0.35;

    vec3 ro;
    vec3 ta;
    float cr;
    float fl;
    moveCamera(time, ro, ta, cr, fl);

    mat3 cam = setCamera(ro, ta, cr);
    vec2 p = (-uResolution.xy + 2.0 * gl_FragCoord.xy) / uResolution.y;
    vec3 rd = cam * normalize(vec3(p, fl));

    vec3 col = render(ro, rd);

    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    col *= 0.55 + 0.45 * pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.1);
    col = clamp(col, 0.0, 1.0);
    col = col * 0.75 + 0.25 * col * col * (3.0 - 2.0 * col);
    col *= mix(0.95, 1.08, clamp(uIntensity, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
}
