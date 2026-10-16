// ============================================
// ADVENTURE RULES
//
// Pure functions over the saved adventure state. No storage, no game
// objects, so they can be tested without a device.
//
// Saved shape (adventure.json):
//   version         ADVENTURE_SCHEMA_VERSION
//   completed       { [levelId]: { stars, bestCoins, bestDistance, runs } }
//   rewardPending   [levelId]  first completions whose coins are not yet credited
// ============================================

import { ADVENTURE_LEVELS, findAdventureLevel } from './AdventureConfig';

export const ADVENTURE_SCHEMA_VERSION = 1;

const MAX_COUNT = 1000000;

const count = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_COUNT) : 0;
};

export function defaultAdventureState() {
  return {
    version: ADVENTURE_SCHEMA_VERSION,
    completed: {},
    rewardPending: [],
  };
}

// Safe for missing or older files. Unknown level ids are dropped.
export function sanitizeAdventureState(raw, levels = ADVENTURE_LEVELS) {
  const state = defaultAdventureState();
  if (!raw || typeof raw !== 'object') return state;

  const known = (id) => typeof id === 'string' && findAdventureLevel(id, levels) !== null;

  if (raw.completed && typeof raw.completed === 'object') {
    for (const [id, entry] of Object.entries(raw.completed)) {
      if (!known(id) || !entry || typeof entry !== 'object') continue;

      state.completed[id] = {
        stars: Math.min(3, Math.max(1, count(entry.stars))),
        bestCoins: count(entry.bestCoins),
        bestDistance: count(entry.bestDistance),
        runs: count(entry.runs),
      };
    }
  }

  if (Array.isArray(raw.rewardPending)) {
    state.rewardPending = [...new Set(raw.rewardPending.filter((id) => known(id) && state.completed[id]))];
  }

  return state;
}

// Reward keys include the account, so every account can earn each level's
// first-completion reward once. The guest key keeps the original format.
export function rewardKey(levelId, owner = 'guest') {
  if (!owner || owner === 'guest') return `adventure:${levelId}:complete`;

  return `adventure:${owner}:${levelId}:complete`;
}

/**
 * 'completed' | 'unlocked' | 'locked'.
 * A level unlocks when the one before it on the map is completed.
 * A level that is not playable yet is always 'locked'.
 */
export function levelStatus(state, level, levels = ADVENTURE_LEVELS) {
  if (state.completed[level.id]) return 'completed';
  if (!level.playable) return 'locked';
  if (level.order === 1) return 'unlocked';

  const previous = levels.find((other) => other.order === level.order - 1);
  return previous && state.completed[previous.id] ? 'unlocked' : 'locked';
}

/**
 * Stars for a finished run: 1 for completing the level, 2 and 3 for coins
 * above the objective. Thresholds are the objective plus 5 and plus 15.
 */
export function starsFor(level, coins) {
  const collected = count(coins);
  const target = level.objective.count;

  if (collected >= target + 15) return 3;
  if (collected >= target + 5) return 2;
  return 1;
}

/**
 * Applies a completed run. Returns the next state, without changing the
 * input. A first completion queues the level reward. Nothing is credited here.
 * `result` is { coins, distance }.
 */
export function applyCompletion(state, level, result) {
  const coins = count(result?.coins);
  const distance = count(result?.distance);
  const stars = starsFor(level, coins);
  const previous = state.completed[level.id];
  const firstCompletion = !previous;

  const next = {
    ...state,
    completed: {
      ...state.completed,
      [level.id]: {
        stars: Math.max(stars, previous?.stars || 0),
        bestCoins: Math.max(coins, previous?.bestCoins || 0),
        bestDistance: Math.max(distance, previous?.bestDistance || 0),
        runs: (previous?.runs || 0) + 1,
      },
    },
    rewardPending: firstCompletion
      ? [...state.rewardPending.filter((id) => id !== level.id), level.id]
      : state.rewardPending,
  };

  return {
    state: next,
    firstCompletion,
    stars,
    rewardCoins: firstCompletion ? count(level.reward?.coins) : 0,
  };
}
