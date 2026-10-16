// ============================================
// OBSTACLE PATTERN GENERATOR
//
// Pure logic, no Three.js. Obstacles.js owns the meshes and
// calls these functions to decide where obstacle rows go.
//
// A "row" is one or more obstacles at the same Z. Lanes are
// indices: 0 = left, 1 = centre, 2 = right (same order as LANES
// in Obstacles.js).
//
// Every accepted pattern is checked with a reachability test:
// the player must be able to reach a free lane in each row, given
// the time between rows, lane-switch duration and reaction time.
// If no template passes, a single-obstacle fallback is used.
// ============================================

import {
  BARRIER_RECOVERY_TIME_GAP,
  LANE_SWITCH_TIME,
  MIN_OBSTACLE_TIME_GAP,
  PLAYER_REACTION_TIME,
} from '../game/GameConfig';

const ALL_LANES = [0, 1, 2];

const obs = (lane, type) => ({ lane, type });

// Templates use the left/centre/right lanes and are unlocked by
// difficulty index (minTier: 0 = Easy … 3 = Expert).
export const PATTERN_TEMPLATES = [
  // Easy: isolated obstacles
  { id: 'single_crate', minTier: 0, rows: [[obs(1, 'crate')]] },
  { id: 'single_barrier', minTier: 0, rows: [[obs(1, 'barrier')]] },
  { id: 'side_crate', minTier: 0, rows: [[obs(0, 'crate')]] },

  // Medium: occasional lane switching
  {
    id: 'side_pair',
    minTier: 1,
    rows: [[obs(0, 'crate')], [obs(2, 'crate')]],
  },
  {
    id: 'zigzag_barriers',
    minTier: 1,
    rows: [
      [obs(0, 'barrier')],
      [obs(1, 'barrier')],
      [obs(2, 'barrier')],
    ],
  },

  // Hard: two obstacles in one row, leaving one safe lane
  {
    id: 'two_barriers',
    minTier: 2,
    rows: [[obs(0, 'barrier'), obs(1, 'barrier')]],
  },
  {
    id: 'crate_barrier_row',
    minTier: 2,
    rows: [[obs(0, 'crate'), obs(1, 'barrier')]],
  },
  {
    id: 'crate_stagger',
    minTier: 2,
    rows: [[obs(0, 'crate')], [obs(1, 'crate')], [obs(2, 'crate')]],
  },

  // Expert: combinations of jumping and sliding
  {
    id: 'jump_then_slide',
    minTier: 3,
    rows: [[obs(1, 'crate')], [obs(1, 'barrier')]],
  },
  {
    id: 'slide_then_jump',
    minTier: 3,
    rows: [[obs(0, 'barrier'), obs(2, 'barrier')], [obs(1, 'crate')]],
  },
  {
    id: 'split_gauntlet',
    minTier: 3,
    rows: [[obs(0, 'crate'), obs(2, 'crate')], [obs(1, 'barrier')]],
  },
];

// Known-safe last resort: one obstacle in one lane, deterministic order.
const FALLBACK_ROWS = [];

for (const lane of ALL_LANES) {
  // A pattern is a list of rows, and each row is a list of obstacles.
  // So each fallback is wrapped as one row inside a pattern.
  FALLBACK_ROWS.push([[obs(lane, 'crate')]]);
  FALLBACK_ROWS.push([[obs(lane, 'barrier')]]);
}

// ============================================
// STATE
// ============================================

export function createPatternState() {
  return {
    // Lanes the player can be in at the most recent row.
    // Starts with every lane, since the first row is far away.
    reachable: ALL_LANES.slice(),

    // Obstacle types in the most recent planned row, or null.
    lastRowTypes: null,
  };
}

// ============================================
// REACHABILITY
// ============================================

/**
 * True if the player can move from one lane to another in `time` seconds.
 * Covers the reaction time plus one lane-switch per lane crossed.
 */
export function isTransitionFeasible(fromLane, toLane, time) {
  const needed =
    PLAYER_REACTION_TIME +
    Math.abs(fromLane - toLane) * LANE_SWITCH_TIME;

  return needed <= time + 1e-9;
}

/**
 * Lanes free in the next row that the player can reach.
 * Lanes blocked in this row are never safe.
 */
export function advanceReachable(reachable, rowLanes, time) {
  return ALL_LANES.filter(
    (lane) =>
      !rowLanes.includes(lane) &&
      reachable.some((from) =>
        isTransitionFeasible(from, lane, time)
      )
  );
}

/**
 * Minimum time after a row before the next row can start.
 * Barriers need longer because the player must finish a slide.
 */
export function getRequiredTimeGap(types) {
  return types.includes('barrier')
    ? BARRIER_RECOVERY_TIME_GAP
    : MIN_OBSTACLE_TIME_GAP;
}

// ============================================
// PATTERN PLANNING
// ============================================

function mirrorRows(rows) {
  return rows.map((row) =>
    row.map((o) => obs(2 - o.lane, o.type))
  );
}

function shuffle(items, random) {
  const copy = items.slice();

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function getCandidateRows(tier, random) {
  const eligible = shuffle(
    PATTERN_TEMPLATES.filter((t) => t.minTier <= tier),
    random
  );

  const candidates = eligible.map((template) =>
    random() < 0.5 ? mirrorRows(template.rows) : template.rows
  );

  // Fallbacks are tried last, in fixed order.
  return candidates.concat(FALLBACK_ROWS);
}

/**
 * Z distance between the previous row and the next one.
 * Starts from the difficulty spacing plus jitter, then enforces the
 * minimum time gap at the speed expected on arrival.
 */
function getRowGap(prevTypes, difficulty, random) {
  const baseGap =
    difficulty.spacing + random() * difficulty.jitter;

  return Math.max(
    baseGap,
    difficulty.timeGapSpeed * getRequiredTimeGap(prevTypes)
  );
}

/**
 * Checks one candidate pattern against the current state.
 * Returns the planned rows and next state, or null if no lane stays
 * reachable.
 */
function evaluatePattern(rows, state, anchorZ, difficulty, random) {
  let reachable = state.reachable;
  let prevTypes = state.lastRowTypes;
  let prevZ = anchorZ;

  const planned = [];

  for (const rowObstacles of rows) {
    // Time is unlimited before the very first row.
    const gap = prevTypes ? getRowGap(prevTypes, difficulty, random) : 0;
    const time = prevTypes ? gap / difficulty.timeGapSpeed : Infinity;

    const z = prevZ - gap;
    const rowLanes = rowObstacles.map((o) => o.lane);

    reachable = advanceReachable(reachable, rowLanes, time);

    if (reachable.length === 0) {
      return null;
    }

    planned.push({ z, obstacles: rowObstacles });

    prevZ = z;
    prevTypes = rowObstacles.map((o) => o.type);
  }

  return {
    rows: planned,
    nextState: {
      reachable,
      lastRowTypes: prevTypes,
    },
  };
}

/**
 * Plans the next pattern behind `anchorZ`.
 *
 * - `anchorZ`: Z of the last obstacle in line (or the start point).
 * - `slotsAvailable`: inactive obstacle slots that can be used.
 * - `random`: function returning [0, 1).
 *
 * Returns { rows, nextState } or null if the pool is too small.
 * Pure: state is not changed. The caller commits nextState.
 */
export function planNextPattern({
  difficulty,
  state,
  anchorZ,
  slotsAvailable,
  random = Math.random,
}) {
  const candidates = getCandidateRows(difficulty.index, random);

  for (const rows of candidates) {
    const size = rows.reduce((sum, row) => sum + row.length, 0);

    if (size > slotsAvailable) continue;

    const plan = evaluatePattern(
      rows,
      state,
      anchorZ,
      difficulty,
      random
    );

    if (plan) {
      return plan;
    }
  }

  return null;
}
