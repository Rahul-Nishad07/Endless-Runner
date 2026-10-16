// ============================================
// ADVENTURE LEVEL CONFIGURATION
//
// Pure data. Level-specific values live here, not in the game loop.
//
// Fields:
//   id              stable identifier, used in saved data. Never reuse an id.
//   order           position on the map (1 is the first level)
//   name, description, difficulty
//   environment     zone name the level uses (see src/world/Environment.js)
//   worldZone       the single world zone the level is built from, or null
//                   when that world is not built yet
//   obstacleTheme   'temple' or 'bridge': the level's own hazards (see Obstacles.js)
//   objective       { type: 'coins', count } – what must be collected
//   finishDistance  run distance (game units) at which the level is complete
//   reward          { coins } – paid once, on the first completion
//   (stars: see AdventureRules.js – 2 and 3 stars use the coin thresholds there)
//   playable        false keeps the level locked on the map
//   disabledReason  shown to the player when playable is false
// ============================================

export const ADVENTURE_LEVELS = [
  {
    id: 'lost_jungle',
    order: 1,
    name: 'Lost Jungle',
    description: 'Vines, fallen logs and rocky trails.',
    difficulty: 'Easy',
    environment: 'Jungle',
    worldZone: 'Jungle',
    objective: { type: 'coins', count: 20 },
    finishDistance: 600,
    reward: { coins: 150 },
    playable: true,
  },
  {
    id: 'temple_treasure',
    order: 2,
    name: 'Temple Treasure',
    description: 'Collect three keys to open the temple gates.',
    difficulty: 'Medium',
    environment: 'Ancient Ruins',
    worldZone: 'Ancient Ruins',
    objective: { type: 'keys', count: 3 },
    finishDistance: 800,
    reward: { coins: 250 },
    obstacleTheme: 'temple',
    playable: true,
  },
  {
    id: 'broken_bridge',
    order: 3,
    name: 'Broken Bridge',
    description: 'A river canyon with gaps in the bridge.',
    difficulty: 'Medium',
    environment: 'Bridge',
    worldZone: 'Bridge',
    objective: { type: 'coins', count: 15 },
    finishDistance: 900,
    reward: { coins: 300 },
    obstacleTheme: 'bridge',
    playable: true,
  },
  {
    id: 'desert_escape',
    order: 4,
    name: 'Desert Escape',
    description: 'Dunes, ruins and boulders under the sun.',
    difficulty: 'Hard',
    environment: 'Desert',
    worldZone: null,
    objective: { type: 'coins', count: 30 },
    finishDistance: 1100,
    reward: { coins: 400 },
    playable: false,
    disabledReason: 'Coming soon: the desert environment is not built yet.',
  },
  {
    id: 'frozen_summit',
    order: 5,
    name: 'Frozen Summit',
    description: 'Ice blocks and frozen bridges on the mountain.',
    difficulty: 'Hard',
    environment: 'Snow',
    worldZone: null,
    objective: { type: 'coins', count: 40 },
    finishDistance: 1300,
    reward: { coins: 500 },
    playable: false,
    disabledReason: 'Coming soon: the snow environment is not built yet.',
  },
];

export function findAdventureLevel(id, levels = ADVENTURE_LEVELS) {
  return levels.find((level) => level.id === id) || null;
}

// The level that comes after this one on the map, or null.
export function nextAdventureLevel(id, levels = ADVENTURE_LEVELS) {
  const current = findAdventureLevel(id, levels);
  if (!current) return null;

  return levels.find((level) => level.order === current.order + 1) || null;
}
