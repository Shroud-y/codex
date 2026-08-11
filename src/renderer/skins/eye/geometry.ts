/**
 * The eye's dimensions. Small enough to keep as constants, but they are shared
 * between the shader, the skin registry and the tests, so they live in one
 * place rather than three.
 */

/**
 * Unchanged from the mechanism that used to surround it: the overlay window,
 * the label alignment and the positioning code are all sized against this, and
 * the eye replacing the mechanism is a change of appearance, not of footprint.
 */
export const CANVAS = { width: 150, height: 175 };

/** With nothing else in the unit, the optic is simply its centre. */
export const CENTRE = { x: CANVAS.width / 2, y: CANVAS.height / 2 };

/**
 * The lens at full openness.
 *
 * Wider than the 62 px slit the frame used to hold — with no ribs and no ring,
 * a small lens in the middle of an empty canvas reads as a dropped highlight
 * rather than as the character. It stops well short of the canvas edge because
 * the bloom has to land somewhere: a glow that reaches the edge is clamped by
 * the blur and leaves a visible rectangle of haze.
 */
export const EYE = { width: 108, height: 28 };
