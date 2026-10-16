// ============================================
// CHARACTER CATALOG
//
// Pure data, with no asset imports, so it can be tested without a device.
// Asset files are bound separately in CharacterModels.js, through the
// `modelSet` key below.
//
// Fields:
//   id           stable identifier, used in saved data. Never reuse an id.
//   name         display name
//   description  short description
//   unlockCost   coins to unlock (0 for the default)
//   isDefault    available from the start, and the fallback
//   assetType    'original' | 'compatible' | 'placeholder'
//   modelSet     key into MODEL_SETS (CharacterModels.js), or null
//   enabled      false keeps the character locked and unselectable
//   disabledReason  why it is not available yet (shown to the player)
//
// A character is only enabled when its model exists AND uses the same
// animated rig as the running system. Otherwise run, jump, slide and
// stunt animations would break.
// ============================================

export const DEFAULT_CHARACTER_ID = 'runner';

export const CHARACTERS = [
  {
    id: 'runner',
    name: 'Runner',
    description: 'The original soldier. Fully animated.',
    unlockCost: 0,
    isDefault: true,
    assetType: 'original',
    modelSet: 'soldier',
    enabled: true,
  },
  {
    id: 'street_sprinter',
    name: 'Street Sprinter',
    description: 'A city runner in street clothes.',
    unlockCost: 500,
    isDefault: false,
    assetType: 'compatible',
    modelSet: 'sprinter',
    enabled: true,
  },
  {
    id: 'jungle_explorer',
    name: 'Jungle Explorer',
    description: 'Ready for the forest trails.',
    unlockCost: 1000,
    isDefault: false,
    assetType: 'compatible',
    modelSet: 'explorer',
    enabled: true,
  },
  {
    id: 'urban_racer',
    name: 'Urban Racer',
    description: 'Built for speed on the streets.',
    unlockCost: 1500,
    isDefault: false,
    assetType: 'placeholder',
    modelSet: null,
    enabled: false,
    disabledReason: 'No animated model with the required rig yet.',
  },
  {
    id: 'golden_champion',
    name: 'Golden Champion',
    description: 'A rare finish for the best runners.',
    unlockCost: 2500,
    isDefault: false,
    assetType: 'placeholder',
    modelSet: null,
    enabled: false,
    disabledReason: 'No animated model with the required rig yet.',
  },
];

export function findCharacter(id, catalog = CHARACTERS) {
  return catalog.find((character) => character.id === id) || null;
}
