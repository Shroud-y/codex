#version 300 es
precision highp float;

/*
 * Background, plus the eye's radiance, tonemapped together. Order matters: the
 * eye is added to the background *before* the tonemap, which is why a bright
 * background eats it — exactly the failure mode we want to be able to see.
 */

uniform sampler2D uScene;
uniform sampler2D uBloomA;   // tight
uniform sampler2D uBloomB;   // wide
uniform sampler2D uWallpaper;

uniform vec2  uResolution;
uniform float uStrengthA;
uniform float uStrengthB;
uniform float uExposure;
uniform int   uBgMode;       // 0 near-black, 1 wallpaper, 2 mid grey
uniform int   uTonemap;      // 0 ACES, 1 Reinhard

out vec4 fragColor;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c)   { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// Narkowicz's ACES fit. The desaturation toward white at high values is the
// whole reason it is here.
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 reinhard(vec3 x) { return x / (1.0 + x); }

vec3 background(vec2 uv) {
  if (uBgMode == 0) return toLinear(vec3(0.0196, 0.0392, 0.0471));   // #050A0C
  if (uBgMode == 2) return toLinear(vec3(0.5));
  return toLinear(texture(uWallpaper, uv).rgb);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  vec3 hdr = texture(uScene, uv).rgb;
  hdr += texture(uBloomA, uv).rgb * uStrengthA;
  hdr += texture(uBloomB, uv).rgb * uStrengthB;
  hdr *= uExposure;

  vec3 c = background(uv) + hdr;
  c = (uTonemap == 0) ? aces(c) : reinhard(c);

  // A slow falloff against near-black banks visibly at 8 bits. One LSB of
  // noise costs nothing and removes the contour rings.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  fragColor = vec4(toSRGB(c) + (n - 0.5) / 255.0, 1.0);
}
