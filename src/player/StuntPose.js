// ============================================
// STUNT POSE — VISUAL ONLY
//
// Pure functions that turn the player's movement state into small
// rotation offsets for the character model. Nothing here changes the
// player's position, lane, jump height, timing or collision volume.
// Player.js adds these offsets to the model's target rotation, so the
// existing smoothing applies and only one system writes model rotation.
//
// Offsets are kept small on purpose. Excessive spinning looks unnatural.
// ============================================

// Measured airtime of the jump in JumpPhysics (about 0.417 s at 60 fps).
export const JUMP_AIR_DURATION = 0.42;

export const STUNT_CONFIG = {
  // Forward pitch over the jump arc (radians). Peaks mid-air, returns
  // to zero at landing. Not a full flip.
  jumpPitch: 0.3,

  // Lean into a lane change (radians), and a small shoulder turn.
  dodgeRoll: 0.16,
  dodgeYaw: 0.08,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Forward pitch for the jump. `airTime` is seconds since takeoff, and
 * `airDuration` is the total airtime. Both come from the physics, so the
 * pitch follows the real arc.
 */
export function getJumpPitch(airborne, airTime, airDuration) {
  if (!airborne || !(airDuration > 0)) return 0;

  const progress = clamp(airTime / airDuration, 0, 1);

  return -Math.sin(Math.PI * progress) * STUNT_CONFIG.jumpPitch;
}

/**
 * Lean toward the target lane during a lane change. `laneOffset` is the
 * distance still to travel (target X minus current X). The lean follows
 * that distance, so it eases in and out with the lane movement, and
 * rapid switches stay continuous.
 */
export function getDodgeLean(laneOffset, laneWidth) {
  if (!(laneWidth > 0)) return { roll: 0, yaw: 0 };

  const ratio = clamp(laneOffset / laneWidth, -1, 1);

  return {
    roll: -ratio * STUNT_CONFIG.dodgeRoll,
    yaw: ratio * STUNT_CONFIG.dodgeYaw,
  };
}
