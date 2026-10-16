// ============================================
// GAME CONFIGURATION
//
// Single source of truth for world speed,
// difficulty stages, obstacle spacing and
// fairness validation.
//
// Distances are run distance in meters.
// Spacing is in world units along Z (1 unit ≈ 1 m).
// Time values are in seconds.
// ============================================

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const lerp = (from, to, t) => from + (to - from) * t;

// ============================================
// WORLD SPEED
// ============================================

// Speed at the start of every run. All multipliers are relative to this.
export const BASE_WORLD_SPEED = 25;

// ============================================
// LANES
//
// Single source of lane positions. The player moves between these
// X values (see Player.js), and obstacles, coins, power-ups and road
// markings all use the same values.
// ============================================

export const LANE_WIDTH = 2;

// Left, centre, right.
export const LANE_X = [-LANE_WIDTH, 0, LANE_WIDTH];

// ============================================
// CRATE
//
// Height is 0.5 (was 1.0). A jump clears the crate when the player's
// feet are at or above this height during the crossing. Geometry and
// clearance both read this value, so they cannot drift apart.
//
// Why 0.5 and not about 0.7: with the current jump (apex 0.758),
// heights of 1.0 and 0.7 leave a press window of about 0–64 ms, which
// is not playable. 0.6 leaves 82–132 ms, and 0.5 leaves 118–180 ms,
// at 30, 60 and 120 fps. See the headless sweep in the phase notes.
// ============================================

export const CRATE_HEIGHT = 0.5;

// No obstacle is placed closer than this at the start of a run. 80 units
// is about 3 seconds at the starting speed, so the player can read the
// track before the first obstacle arrives. Was -10 (about half a second).
export const START_GRACE_DISTANCE = 80;

// ============================================
// DISTANCE-BASED SPEED PROGRESSION
//
// The base speed rises by stepIncrease every stepDistance metres of run
// distance, starting from startMultiplier (1.0x = BASE_WORLD_SPEED):
//   0-499 m  1.00x     1,000-1,499 m  1.30x     2,000-2,499 m  1.60x
//   500-999  1.15x     1,500-1,999 m  1.45x     2,500-2,999 m  1.75x
// and +0.15x for every further 500 m.
//
// The multiplier never decreases during a run. The temporary booster is
// applied on top and does not change this progression.
// ============================================
export const SPEED_PROGRESSION = {
  startMultiplier: 1.0,
  stepDistance: 500,
  stepIncrease: 0.15,
  // Upper limit on the base multiplier. Set high so the progression keeps
  // rising for long runs, but finite so the game stays controllable.
  maxMultiplier: 3.0,
};

export const MAX_SPEED_MULTIPLIER = SPEED_PROGRESSION.maxMultiplier;

// How quickly the live speed eases toward its target (per second).
// Keeps speed changes smooth instead of stepping.
export const SPEED_SMOOTHING_RATE = 2;

// ============================================
// SPEED BOOSTER
//
// Collecting a booster multiplies the whole world's target speed by
// SPEED_BOOST_MULTIPLIER for SPEED_BOOST_DURATION seconds. The boost
// eases in and out at SPEED_BOOST_RAMP_RATE (per second). Another booster
// during a boost refreshes the timer; it never stacks the multiplier.
// ============================================
export const SPEED_BOOST_MULTIPLIER = 1.6;
export const SPEED_BOOST_DURATION = 6;
export const SPEED_BOOST_RAMP_RATE = 4;

// ============================================
// DIFFICULTY STAGES
//
// obstacleSpacing and obstacleJitter are reached at each stage's
// startDistance and interpolated linearly toward the next stage. The
// final stage holds its values. Speed is set separately by SPEED_TIERS.
// ============================================

export const DIFFICULTY_STAGES = [
  {
    id: 'easy',
    label: 'Easy',
    startDistance: 0,
    obstacleSpacing: 24,
    obstacleJitter: 8,
  },
  {
    id: 'medium',
    label: 'Medium',
    startDistance: 500,
    obstacleSpacing: 22,
    obstacleJitter: 7,
  },
  {
    id: 'hard',
    label: 'Hard',
    startDistance: 1500,
    obstacleSpacing: 20,
    obstacleJitter: 6,
  },
  {
    id: 'expert',
    label: 'Expert',
    startDistance: 3000,
    obstacleSpacing: 18,
    obstacleJitter: 4,
  },
];

// ============================================
// OBSTACLE SPACING AND FAIRNESS
// ============================================

// Smallest spacing along Z, whatever the stage.
export const MIN_OBSTACLE_SPACING = 18;

// Minimum time between consecutive obstacle rows. At high speed this
// becomes the binding limit, so the reaction time stays fair.
// Covers a crate landing and jumping again (about 0.42 s airtime).
export const MIN_OBSTACLE_TIME_GAP = 0.55;

// Minimum time after a barrier row before the next row.
// The player must finish a 0.5 s slide, then jump or slide again.
export const BARRIER_RECOVERY_TIME_GAP = 0.9;

// Run distance an obstacle covers between being placed and reaching
// the player. Speed keeps rising in that time, so time gaps are
// checked against the speed expected at arrival.
export const OBSTACLE_LOOKAHEAD_DISTANCE = 320;

// Lane-change duration used by the reachability check. Matches the
// player's MOVE_SPEED (12) across one lane width (2).
export const LANE_SWITCH_TIME = 2 / 12;

// Time the player needs to see and react before starting a lane change.
export const PLAYER_REACTION_TIME = 0.25;

// ============================================
// HELPERS
// ============================================

// Finds the stage pair around a distance and how far between them we are.
function getStageBlend(distance) {
  const safeDistance = Number.isFinite(distance)
    ? Math.max(0, distance)
    : 0;

  let index = 0;

  for (let i = 1; i < DIFFICULTY_STAGES.length; i++) {
    if (safeDistance >= DIFFICULTY_STAGES[i].startDistance) {
      index = i;
    }
  }

  const stage = DIFFICULTY_STAGES[index];
  const next = DIFFICULTY_STAGES[index + 1];

  const t = next
    ? clamp(
        (safeDistance - stage.startDistance) /
          (next.startDistance - stage.startDistance),
        0,
        1
      )
    : 0;

  return {
    safeDistance,
    index,
    stage,
    target: next ?? stage,
    t,
  };
}

/**
 * Distance-based base speed multiplier, relative to BASE_WORLD_SPEED.
 * Uses the tier that applies at this distance, clamped to
 * MAX_SPEED_MULTIPLIER. Excludes the temporary booster.
 */
export function getSpeedMultiplier(distance) {
  const safeDistance = Number.isFinite(distance)
    ? Math.max(0, distance)
    : 0;

  const { startMultiplier, stepDistance, stepIncrease, maxMultiplier } =
    SPEED_PROGRESSION;

  // Whole 500 m steps completed so far. Integer steps keep the value exact
  // at each milestone (500 m gives 1.15, 1,000 m gives 1.30, and so on).
  const steps = Math.floor(safeDistance / stepDistance);

  return clamp(
    startMultiplier + steps * stepIncrease,
    startMultiplier,
    maxMultiplier
  );
}

/**
 * Target world speed for a given run distance.
 * Callers should ease toward this value rather than snap to it.
 */
export function getTargetWorldSpeed(distance) {
  return BASE_WORLD_SPEED * getSpeedMultiplier(distance);
}

/**
 * Current difficulty for a given run distance.
 *
 * Returns the stage index, id and label for the HUD and logs, plus the
 * interpolated values used by the obstacle pattern generator.
 */
export function getDifficultyProfile(distance) {
  const { safeDistance, index, stage, target, t } =
    getStageBlend(distance);

  return {
    index,
    id: stage.id,
    label: stage.label,
    speedMultiplier: getSpeedMultiplier(safeDistance),
    spacing: Math.max(
      MIN_OBSTACLE_SPACING,
      lerp(stage.obstacleSpacing, target.obstacleSpacing, t)
    ),
    jitter: lerp(stage.obstacleJitter, target.obstacleJitter, t),
    // Speed expected when obstacles placed now reach the player.
    timeGapSpeed: getTargetWorldSpeed(
      safeDistance + OBSTACLE_LOOKAHEAD_DISTANCE
    ),
  };
}
