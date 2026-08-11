#version 300 es
precision highp float;

/*
 * The eye, as accumulated radiance. Nothing here clamps: the output is an
 * RGBA16F target and values run well past 1.0 on purpose — the white core is
 * meant to be produced by the tonemapper further down the chain, not painted.
 */

uniform vec2  uResolution;
uniform float uTime;        // already scaled on the CPU, so timeScale never jumps

uniform float uWarpAmp;
uniform float uOctaves;     // fractional: the last octave fades in
uniform float uNoiseScale;

uniform float uThickness;
uniform float uThickVar;

uniform float uCoreIntensity;
uniform float uCoreRadius;

uniform float uDispersion;
uniform float uInterior;
uniform float uOpenness;

uniform vec3  uBaseHue;
uniform vec3  uCoreHue;

out vec4 fragColor;

const float HALF_W = 0.34;          // half the long axis, in half-height units
const float ASPECT = 4.0;           // long:short at full openness

// ---------------------------------------------------------------- noise ----

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);   // quintic, C2
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);   // decorrelates successive octaves

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    float w = clamp(uOctaves - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    sum += amp * w * vnoise(p);
    norm += amp * w;
    p = ROT * p * 2.02;
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}

// ------------------------------------------------------------------ sdf ----

/* iq's vesica: a lens with points at both ends, which is the shape we want
   before anything is done to it. Written long-axis-on-y, so callers swizzle. */
float sdVesica(vec2 p, float r, float d) {
  p = abs(p);
  float b = sqrt(r * r - d * d);
  return ((p.y - b) * d > p.x * b)
    ? length(p - vec2(0.0, b))
    : length(p - vec2(-d, 0.0)) - r;
}

/* Half-height for the current openness. Never quite zero: a closed aperture is
   a slit that still has a membrane, not an absence. */
float halfHeight() {
  return mix(0.012, HALF_W / ASPECT, uOpenness);
}

float lens(vec2 p) {
  float h = halfHeight();
  float a = HALF_W;
  float r = (a * a + h * h) / (2.0 * h);
  return sdVesica(p.yx, r, r - h);
}

// --------------------------------------------------------------- warping ---

/* Displace the sample point before the SDF sees it. Amplitude grows toward the
   tips, which is what tears them; the body stays comparatively intact. */
vec2 warp(vec2 p, float t) {
  vec2 q = p * uNoiseScale;
  float wx = fbm(q + vec2(0.0, t * 0.13));
  float wy = fbm(q + vec2(5.2, 1.3) - vec2(t * 0.09, 0.0));
  float wz = fbm(q * 2.7 + vec2(t * 0.21, -t * 0.17));

  float tipward = 0.45 + 1.15 * pow(clamp(abs(p.x) / HALF_W, 0.0, 1.0), 1.6);
  vec2 d = vec2(wx - 0.5, wy - 0.5) * 2.0;
  d += (wz - 0.5) * 0.6;                       // a third, faster field on top

  return p + d * uWarpAmp * tipward * vec2(1.0, 0.55);
}

/* Band half-width at this point along the shape. Thins toward the tips and is
   pinched by a slow noise, so parts of the contour drop out entirely. */
float bandWidth(vec2 p, float t) {
  float u = clamp(abs(p.x) / HALF_W, 0.0, 1.0);
  float taper = mix(1.0, 0.22, pow(u, 1.4));
  float pinch = fbm(vec2(p.x * 4.5 + t * 0.11, t * 0.19));
  float gate = smoothstep(0.30, 0.72, pinch);
  return uThickness * taper * mix(1.0, gate, uThickVar);
}

// ---------------------------------------------------------------- field ----

/* Scalar radiance of the whole eye at p. Evaluated once per channel when
   dispersion is on, which is where the tips split. */
float field(vec2 p, float t) {
  vec2 w = warp(p, t);
  float d = lens(w);
  float a = abs(d);
  float th = max(bandWidth(p, t), 1e-4);

  // The membrane: a saturating shell plus a continuous 1/r halo. The halo is
  // what makes the value climb without bound as the contour is approached.
  // The shell edge is widened to about a pixel, or a contour thinner than one
  // crawls and stairsteps — SVG gets this free from the rasteriser, a shader
  // has to ask for it. Derived from the resolution rather than fwidth(): the
  // field is close enough to unit-gradient, and derivatives inside this
  // function measured 4.5 ms/frame at 1080p.
  float aa = 1.2 / uResolution.y;
  float shell = smoothstep(th + aa, max(th * 0.12 - aa, 0.0), a);
  float halo = th / (a + th * 0.42);
  float rad = shell * 2.4 + halo * halo * 0.9;

  // Longitudinal profile: the middle of the aperture carries the blowout. Kept
  // narrow in y so it reads as a slit of light rather than a lit disc.
  float h = halfHeight();
  vec2 k = p / vec2(HALF_W * max(uCoreRadius, 1e-3), h * max(uCoreRadius, 1e-3) * 1.5);
  float core = exp(-dot(k, k));
  rad += core * 2.6;

  // Interior: three low-amplitude sheets drifting at unrelated rates. Only
  // visible inside the aperture, and only where the aperture is actually open.
  float inside = smoothstep(0.0, -th * 1.6, d);
  if (inside > 0.0) {
    float v1 = fbm(p * 9.0 + vec2(t * 0.07, -t * 0.04));
    float v2 = fbm(p * 17.0 * vec2(1.0, 2.4) + vec2(-t * 0.13, t * 0.05));
    float v3 = fbm(p * 31.0 + vec2(t * 0.031, t * 0.11));
    float vol = v1 * 0.55 + v2 * 0.3 + v3 * 0.15;
    rad += inside * uInterior * (0.08 + vol * 0.9) * (0.25 + core * 1.1);
  }

  return rad;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime;

  // Dispersion grows with distance from centre, so the tips split and the core
  // stays clean. A radial *offset*, not a radial scale: scaling would remap far
  // pixels onto the shape and produce a ghost copy of the whole eye.
  float g = field(p, t);
  float r = g;
  float b = g;
  if (uDispersion > 1e-5) {
    float k = uDispersion * 0.5 * pow(clamp(length(p) / HALF_W, 0.0, 1.0), 2.0);
    vec2 off = normalize(p + vec2(1e-6)) * k;
    r = field(p - off, t);
    b = field(p + off, t);
  }

  vec3 I = vec3(r, g, b) * uCoreIntensity;

  // Hue by intensity: the falloff carries the base colour, the bright interior
  // pulls toward the core colour, and everything above that is left to the
  // tonemapper to desaturate into white.
  vec3 hue = mix(uBaseHue, uCoreHue, smoothstep(0.8, 5.0, I.g));
  fragColor = vec4(hue * I, 1.0);
}
