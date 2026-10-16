// ============================================
// MISSION CONFIGURATION
//
// All mission definitions live here. To add a mission, add an entry.
// No gameplay code needs to change, as long as its eventType is one of
// the events in EVENT_TYPES below.
//
// Fields:
//   id          stable identifier, used in saved data. Never reuse an id.
//   title       short name shown on the card
//   description what the player must do
//   category    'daily' (pool for the daily set) or 'general' (permanent)
//   eventType   which gameplay event moves the progress (see EVENT_TYPES)
//   target      progress needed
//   rewardCoins coins added to the balance on claim
//   icon        emoji used on the card
//   difficulty  'easy' | 'medium' | 'hard'
//   enabled     false keeps the mission out of the game
//   disabledReason  why a mission is off (documentation only)
// ============================================

// Events the gameplay sends to the mission service.
export const EVENT_TYPES = {
  coins: 'coins',                  // coins collected (run or lifetime)
  distance: 'distance',            // metres travelled
  runs: 'runs',                    // completed runs
  powerups: 'powerups',            // power-ups collected
  bestRunCoins: 'bestRunCoins',    // most coins collected in one run
  obstaclesAvoided: 'obstaclesAvoided',
  collisionFreeRuns: 'collisionFreeRuns',
};

export const DAILY_SET_SIZE = 3;

export const MISSION_DEFINITIONS = [
  // ---- Daily pool ----
  {
    id: 'daily_coins',
    title: 'Coin Collector',
    description: 'Collect 20 coins across your runs today.',
    category: 'daily',
    eventType: EVENT_TYPES.coins,
    target: 20,
    rewardCoins: 50,
    icon: '🪙',
    difficulty: 'easy',
    enabled: true,
  },
  {
    id: 'daily_distance',
    title: 'Long Runner',
    description: 'Run 500 metres today.',
    category: 'daily',
    eventType: EVENT_TYPES.distance,
    target: 500,
    rewardCoins: 75,
    icon: '🏃',
    difficulty: 'medium',
    enabled: true,
  },
  {
    id: 'daily_runs',
    title: 'Run Starter',
    description: 'Finish 3 runs today.',
    category: 'daily',
    eventType: EVENT_TYPES.runs,
    target: 3,
    rewardCoins: 40,
    icon: '🎯',
    difficulty: 'easy',
    enabled: true,
  },
  {
    id: 'daily_powerups',
    title: 'Power-Up Hunter',
    description: 'Collect 3 power-ups today.',
    category: 'daily',
    eventType: EVENT_TYPES.powerups,
    target: 3,
    rewardCoins: 50,
    icon: '⚡',
    difficulty: 'medium',
    enabled: true,
  },
  {
    id: 'daily_obstacles',
    title: 'Obstacle Dodger',
    description: 'Pass 10 obstacles without hitting them.',
    category: 'daily',
    eventType: EVENT_TYPES.obstaclesAvoided,
    target: 10,
    rewardCoins: 60,
    icon: '🛡️',
    difficulty: 'hard',
    enabled: false,
    disabledReason:
      'No obstacle-passed event exists in the game yet. Enable after one is added.',
  },

  // ---- General (permanent) ----
  {
    id: 'general_coins',
    title: 'Treasure Hunter',
    description: 'Collect 100 coins in total.',
    category: 'general',
    eventType: EVENT_TYPES.coins,
    target: 100,
    rewardCoins: 100,
    icon: '💰',
    difficulty: 'medium',
    enabled: true,
  },
  {
    id: 'general_distance',
    title: 'Marathon',
    description: 'Travel 1,000 metres in total.',
    category: 'general',
    eventType: EVENT_TYPES.distance,
    target: 1000,
    rewardCoins: 150,
    icon: '🗺️',
    difficulty: 'medium',
    enabled: true,
  },
  {
    id: 'general_runs',
    title: 'Veteran',
    description: 'Complete 10 runs.',
    category: 'general',
    eventType: EVENT_TYPES.runs,
    target: 10,
    rewardCoins: 120,
    icon: '🏅',
    difficulty: 'medium',
    enabled: true,
  },
  {
    id: 'general_run_coins',
    title: 'Coin Rush',
    description: 'Collect 25 coins in a single run.',
    category: 'general',
    eventType: EVENT_TYPES.bestRunCoins,
    target: 25,
    rewardCoins: 80,
    icon: '⚡🪙',
    difficulty: 'hard',
    enabled: true,
  },
  {
    id: 'general_powerups',
    title: 'Power Collector',
    description: 'Collect 10 power-ups in total.',
    category: 'general',
    eventType: EVENT_TYPES.powerups,
    target: 10,
    rewardCoins: 90,
    icon: '🔋',
    difficulty: 'medium',
    enabled: true,
  },
  {
    id: 'general_collision_free',
    title: 'Clean Run',
    description: 'Finish a run without a single collision.',
    category: 'general',
    eventType: EVENT_TYPES.collisionFreeRuns,
    target: 1,
    rewardCoins: 100,
    icon: '✨',
    difficulty: 'hard',
    enabled: false,
    disabledReason:
      'Needs obstacle-passed events to be reliable. Enable after they exist.',
  },
];

/** Enabled missions of one category, in definition order. */
export function getEnabledMissions(category) {
  return MISSION_DEFINITIONS.filter(
    (mission) => mission.enabled && mission.category === category
  );
}

export function findMissionDefinition(id) {
  return MISSION_DEFINITIONS.find((mission) => mission.id === id) || null;
}
