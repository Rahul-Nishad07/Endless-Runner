// ============================================
// PLAYER JUMP AND SLIDE PHYSICS
//
// Pure logic with no Three.js or React Native imports, so it can be
// tested headlessly and runs the same way at any frame rate.
//
// Physics runs in fixed steps of PHYSICS_STEP seconds. Frame time goes
// into an accumulator, and each whole step is applied once. Rendering
// uses whatever state the last step left, so jump height and airtime
// stay the same at 30, 60 or 120 fps.
// ============================================

// Jump: initial upward speed (units/s).
export const JUMP_VELOCITY = 7.2;
export const GRAVITY = 25;
export const FALL_GRAVITY = 55;

// Slide length in seconds.
export const SLIDE_DURATION = 0.5;

// Fixed physics step. 1/60 s gives a stable integration at the speeds
// used here.
export const PHYSICS_STEP = 1 / 60;

// Caps the number of steps in one frame. This stops a long stall from
// causing a catch-up spiral. Excess time is dropped, not replayed.
export const MAX_PHYSICS_STEPS = 4;

export function createMotionState() {
  return {
    height: 0,
    velocity: 0,
    airborne: false,
    descending: false,
    airTime: 0,
    sliding: false,
    slideTime: 0,
    accumulator: 0,
  };
}

export function startJump(state) {
  if (state.airborne || state.sliding) return false;

  state.airborne = true;
  state.descending = false;
  state.velocity = JUMP_VELOCITY;
  state.airTime = 0;

  return true;
}

export function startSlide(state) {
  if (state.airborne || state.sliding) return false;

  state.sliding = true;
  state.slideTime = SLIDE_DURATION;

  return true;
}

/**
 * Advances the simulation by exactly one fixed step.
 * Returns the events that happened: 'fall', 'land' and 'slideEnd'.
 */
export function stepMotion(state, dt = PHYSICS_STEP) {
  const events = [];

  if (state.airborne) {
    state.airTime += dt;

    // Semi-implicit Euler: velocity first, then position.
    const gravity = state.velocity > 0 ? GRAVITY : FALL_GRAVITY;

    state.velocity -= gravity * dt;
    state.height += state.velocity * dt;

    if (state.velocity < 0 && !state.descending) {
      state.descending = true;
      events.push('fall');
    }

    if (state.height <= 0) {
      state.height = 0;
      state.velocity = 0;
      state.airborne = false;
      state.descending = false;
      state.airTime = 0;
      events.push('land');
    }
  }

  if (state.sliding) {
    state.slideTime -= dt;

    if (state.slideTime <= 0) {
      state.slideTime = 0;
      state.sliding = false;
      events.push('slideEnd');
    }
  }

  return events;
}

/**
 * Adds frame time to the accumulator and runs whole fixed steps.
 * Returns { steps, events }.
 */
export function advanceMotion(state, frameDt) {
  const dt = Math.min(Math.max(frameDt || 0, 0), 0.05);

  state.accumulator += dt;

  let steps = 0;
  const events = [];

  while (
    state.accumulator >= PHYSICS_STEP &&
    steps < MAX_PHYSICS_STEPS
  ) {
    events.push(...stepMotion(state, PHYSICS_STEP));
    state.accumulator -= PHYSICS_STEP;
    steps++;
  }

  // After a long stall, drop the rest of the backlog rather than
  // replaying it.
  if (steps === MAX_PHYSICS_STEPS) {
    state.accumulator = Math.min(state.accumulator, PHYSICS_STEP);
  }

  return { steps, events };
}
