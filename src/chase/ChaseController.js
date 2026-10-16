// ============================================
// CHASE CONTROLLER
//
// Tracks how far behind the runner the chase truck is. Pure logic: no
// Three.js and no React, so it can be tested on its own.
//
// Distance changes only on gameplay events (clean dodges, hits) and on
// controlled recovery after a clean stretch. It never drops just because
// time passes, so running cleanly is not punished.
//
// Units are metres of run distance, the same units as the run's distance
// counter. All values are tuning starting points.
// ============================================

export const CHASE_CONFIG = {
  // Chase distance (metres behind the runner) at the start of each run.
  initialDistance: 12,
  minDistance: 0,
  maxDistance: 20,

  // Bands. SAFE at or above safeDistance, WARNING from criticalDistance
  // up to safeDistance, CRITICAL below criticalDistance, CAUGHT at zero.
  safeDistance: 12,
  criticalDistance: 5,

  // Run time (seconds, pauses excluded) before the truck appears and
  // starts to matter.
  startDelay: 5,

  // Gain for each obstacle passed cleanly, and loss for each hit.
  dodgeReward: 1.0,
  hitPenalty: 2.5,

  // Passive recovery: after this many seconds without a hit, distance
  // climbs back at recoveryRate metres per second. It only restores
  // distance lost to hits, up to recoveryCeiling. Dodge rewards can take
  // the distance above that, up to maxDistance.
  recoveryDelay: 3,
  recoveryRate: 0.3,
  recoveryCeiling: 12,

  // Difficulty scaling. The penalty grows and recovery slows as the
  // distance-based speed tier rises. Tier 1 (base speed) uses factor 1.
  //   factor = 1 + difficultyGain * (speedTier - 1)
  // With the default gain of 0.5 the top tier (1.8×) gives a factor of 1.4.
  difficultyGain: 0.5,
};

export const CHASE_STATE = {
  WAITING: 'WAITING',
  SAFE: 'SAFE',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
  CAUGHT: 'CAUGHT',
};

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

/**
 * Creates one chase controller. Call reset() at the start of every run.
 * Reuse the same controller across runs rather than creating new ones.
 */
export function createChaseController(config = CHASE_CONFIG) {
  let distance = config.initialDistance;
  let runTime = 0;
  let timeSinceHit = Infinity;
  let state = CHASE_STATE.WAITING;

  function stateFor(d) {
    if (d <= config.minDistance) return CHASE_STATE.CAUGHT;
    if (d < config.criticalDistance) return CHASE_STATE.CRITICAL;
    if (d < config.safeDistance) return CHASE_STATE.WARNING;
    return CHASE_STATE.SAFE;
  }

  // The chase is live once the start delay has passed. Hits before that
  // still cost distance, but the truck stays hidden and the state stays WAITING.
  function hasStarted() {
    return runTime >= config.startDelay;
  }

  function difficultyFactor(speedTier) {
    const extra = Math.max(0, (Number(speedTier) || 1) - 1);

    return 1 + config.difficultyGain * extra;
  }

  function reset() {
    distance = config.initialDistance;
    runTime = 0;
    timeSinceHit = Infinity;
    state = CHASE_STATE.WAITING;
  }

  reset();

  return {
    reset,

    /**
     * Advances run time and passive recovery. Call once per running frame
     * with the frame's delta. Not called while paused or after Game Over.
     */
    update(delta, speedTier = 1) {
      if (state === CHASE_STATE.CAUGHT) return state;

      const dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));

      runTime += dt;
      timeSinceHit += dt;

      if (runTime < config.startDelay) {
        state = CHASE_STATE.WAITING;
        return state;
      }

      if (
        timeSinceHit >= config.recoveryDelay &&
        distance < config.recoveryCeiling
      ) {
        const rate =
          config.recoveryRate / difficultyFactor(speedTier);

        distance = Math.min(
          config.recoveryCeiling,
          distance + rate * dt
        );
      }

      state = stateFor(distance);

      return state;
    },

    /**
     * A clean dodge: the runner passed an obstacle without being hit.
     * Call once per obstacle. Ignored before the chase starts.
     */
    onDodge() {
      if (!hasStarted() || state === CHASE_STATE.CAUGHT) {
        return state;
      }

      distance = clamp(
        distance + config.dodgeReward,
        config.minDistance,
        config.maxDistance
      );

      state = stateFor(distance);

      return state;
    },

    /**
     * A hit that the run survives in chase mode. Returns true if the hit
     * closed the gap to zero, which means the runner was caught.
     */
    onHit(speedTier = 1) {
      if (state === CHASE_STATE.CAUGHT) return true;

      const penalty =
        config.hitPenalty * difficultyFactor(speedTier);

      distance = clamp(
        distance - penalty,
        config.minDistance,
        config.maxDistance
      );

      timeSinceHit = 0;
      state = hasStarted() ? stateFor(distance) : CHASE_STATE.WAITING;

      return hasStarted() && distance <= config.minDistance;
    },

    /**
     * Revive after a rewarded ad. The gap goes back to its starting
     * distance and the chase is live again. Run time is kept, so the
     * start delay does not repeat.
     */
    revive() {
      distance = config.initialDistance;
      timeSinceHit = Infinity;
      state = hasStarted() ? stateFor(distance) : CHASE_STATE.WAITING;
    },

    getDistance() {
      return distance;
    },

    getState() {
      return state;
    },

    isStarted() {
      return hasStarted();
    },

    isCaught() {
      return state === CHASE_STATE.CAUGHT;
    },
  };
}
