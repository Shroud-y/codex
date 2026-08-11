#version 300 es
precision highp float;

/*
 * One axis of a separable gaussian, 13 taps folded into 7 linear fetches.
 *
 * Offsets are in *destination* texels, which is what makes this safe to use as
 * a downsample step as well as a blur: halving the target automatically doubles
 * the reach in source texels, and the source is read with linear filtering.
 * Widening a blur by raising the radius instead of by downsampling is what
 * produces comb ringing — seven taps cannot cover thirty texels.
 */

uniform sampler2D uSrc;
uniform vec2 uDstSize;
uniform vec2 uDir;       // (1,0) or (0,1)
uniform float uRadius;   // in destination texels

out vec4 fragColor;

const float OFF[4] = float[4](0.0, 1.4117647, 3.2941176, 5.1764706);
const float WGT[4] = float[4](0.19648255, 0.29690696, 0.09447040, 0.01038136);

/*
 * A tap that reads nothing outside the texture.
 *
 * The wrap mode is CLAMP_TO_EDGE, which does not mean "empty" — it means the
 * edge texel repeated forever. On a canvas this small the glow reaches the
 * border, and every out-of-range tap then re-samples the brightest thing near
 * it, which builds a bright rectangle of haze around the whole unit. Dropping
 * those taps loses a little energy at the border, which is correct: there is
 * genuinely nothing out there.
 */
vec3 tap(vec2 uv) {
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return texture(uSrc, uv).rgb * inside.x * inside.y;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uDstSize;
  vec2 step = uDir * uRadius / uDstSize;

  vec3 sum = texture(uSrc, uv).rgb * WGT[0];
  for (int i = 1; i < 4; i++) {
    sum += tap(uv + step * OFF[i]) * WGT[i];
    sum += tap(uv - step * OFF[i]) * WGT[i];
  }
  fragColor = vec4(sum, 1.0);
}
