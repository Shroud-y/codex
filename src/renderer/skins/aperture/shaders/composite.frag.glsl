#version 300 es
precision highp float;

/*
 * Radiance + bloom → tonemap → premultiplied alpha.
 *
 * Unlike the prototype there is no background here: the overlay window is
 * transparent and the frame and ring are DOM layers underneath this canvas.
 * Alpha is the tonemapped luminance, and the colour is written premultiplied,
 * so the canvas occludes what is behind it exactly as much as it is bright —
 * dark parts of the field stay invisible instead of painting a black box over
 * the desktop.
 */

uniform sampler2D uScene;
uniform sampler2D uBloomA;   // tight
uniform sampler2D uBloomB;   // wide

uniform vec2  uResolution;
uniform float uStrengthA;
uniform float uStrengthB;
uniform float uExposure;

out vec4 fragColor;

vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// Narkowicz's ACES fit. The desaturation toward white at high values is the
// whole reason it is here.
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  vec3 hdr = texture(uScene, uv).rgb;
  hdr += texture(uBloomA, uv).rgb * uStrengthA;
  hdr += texture(uBloomB, uv).rgb * uStrengthB;
  hdr *= uExposure;

  vec3 c = toSRGB(aces(hdr));

  // A slow falloff banks visibly at 8 bits. One LSB of noise removes the
  // contour rings and costs nothing.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;

  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), a);
}
