// ============================================
// CHARACTER MODEL SETS
//
// Binds each model set to its bundled files. Metro needs static require
// paths, so they are listed here. Add a set here when a new compatible
// model is added to assets/, and reference it from the catalog.
//
// `names` are the file names the GLTF loader looks up. They must match the
// references inside the .gltf file.
// ============================================

export const MODEL_SETS = {
  soldier: {
    gltf: require('../../assets/models/player/soldier-animated/Soldier.gltf'),
    bin: require('../../assets/models/player/soldier-animated/Soldier.bin'),
    baseColor: require('../../assets/models/player/soldier-animated/baseColor_1.jpg'),
    normal: require('../../assets/models/player/soldier-animated/normal_1.jpg'),
    names: {
      gltf: 'Soldier.gltf',
      bin: 'Soldier.bin',
      baseColor: 'baseColor_1.jpg',
      normal: 'normal_1.jpg',
    },
  },
};

// Street Sprinter and Jungle Explorer use Soldier's exact mesh, rig and
// animations, so they match Soldier's size and motion. They differ only in
// body colour: `tint` maps a material name to the colour it is multiplied by.
MODEL_SETS.sprinter = {
  ...MODEL_SETS.soldier,
  tint: { VanguardBodyMat: 0x5aa0ff },
};

MODEL_SETS.explorer = {
  ...MODEL_SETS.soldier,
  tint: { VanguardBodyMat: 0x9cc96a },
};

// Used whenever a selected model is missing or fails to load.
export const DEFAULT_MODEL_SET = MODEL_SETS.soldier;
