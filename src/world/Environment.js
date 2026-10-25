import * as THREE from 'three';
import { createRoadSegment } from './Road';
import { createCity } from './City';
import { mergeStaticScenery } from './StaticMerge';

const ZONE_LENGTH = 280;

// A level world repeats its single zone this many times, so the run keeps
// recycling zones without ever showing another world.
const LEVEL_WORLD_ZONE_COUNT = 3;

// How far each zone's road continues past its own position (toward the
// camera). Must cover the chase camera's distance behind the runner.
const ROAD_CONTINUATION_LENGTH = 40;

// Materials are shared by colour and roughness. Creating a new
// material for every tree and rock prevented batching.
const materialCache = new Map();

const ZONE_CONFIGS = [
  {
    name: 'City',
    create: createCityZone,
  },
  {
    name: 'Jungle',
    create: createJungle,
  },
  {
    name: 'Bridge',
    create: createRiverBridge,
  },
  {
    name: 'Ancient Ruins',
    create: createAncientRuins,
  },
  {
    name: 'River',
    create: createRiverZone,
  },
];

function material(color, roughness = 0.9, extra = {}) {
  const key = `${color}|${roughness}|${JSON.stringify(extra)}`;

  if (!materialCache.has(key)) {
    materialCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        ...extra,
      })
    );
  }

  return materialCache.get(key);
}

function addBox(
  parent,
  name,
  x,
  y,
  z,
  width,
  height,
  depth,
  mat
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    mat
  );

  mesh.name = name;
  mesh.position.set(x, y + height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  return mesh;
}

function addGround(parent, color) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, ZONE_LENGTH),
    material(color)
  );

  ground.name = 'EnvironmentGround';
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.07, -ZONE_LENGTH / 2);
  ground.receiveShadow = true;
  parent.add(ground);
}

// heightScale stretches the tree only vertically. Its width and
// footprint still come from `scale`. The trunk base stays at y = 0.
function addTree(parent, x, z, scale = 1, jungle = false, heightScale = 1) {
  const tree = new THREE.Group();

  tree.name = 'EnvironmentTree';
  tree.position.set(x, 0, z);
  tree.scale.set(scale, scale * heightScale, scale);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 2.8, 8),
    material(jungle ? 0x60432b : 0x795334)
  );

  trunk.position.y = 1.4;
  trunk.castShadow = true;
  tree.add(trunk);

  if (jungle) {
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 10, 8),
      material(0x236b36)
    );

    crown.position.y = 3.1;
    crown.scale.set(1.1, 1.3, 1);
    crown.castShadow = true;
    tree.add(crown);

    const crown2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 9, 7),
      material(0x347e3e)
    );

    crown2.position.set(0.55, 3.75, 0.1);
    crown2.castShadow = true;
    tree.add(crown2);
  } else {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 3.2, 7),
      material(0x477a3c)
    );

    crown.position.y = 3.7;
    crown.castShadow = true;
    tree.add(crown);
  }

  parent.add(tree);
  return tree;
}

function addRock(
  parent,
  x,
  y,
  z,
  scale = 1,
  color = 0x77766f
) {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(scale, 0),
    material(color)
  );

  rock.name = 'EnvironmentRock';
  rock.position.set(x, y + scale * 0.5, z);
  rock.rotation.set(0.3, 0.7, 0.2);
  rock.scale.set(1.3, 0.8, 1);
  rock.castShadow = true;
  rock.receiveShadow = true;

  parent.add(rock);
  return rock;
}

function addMountain(parent, x, z, scale = 1) {
  const mountain = new THREE.Mesh(
    new THREE.ConeGeometry(13, 36, 7),
    material(0x657b79)
  );

  mountain.name = 'Mountain';
  mountain.position.set(x, 15 * scale, z);
  mountain.scale.set(scale, scale, scale);
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  parent.add(mountain);

  const snow = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 9, 7),
    material(0xdce6e8)
  );

  snow.position.set(x, 29 * scale, z);
  snow.scale.setScalar(scale);
  parent.add(snow);
}

// ==========================================
// CITY ZONE
// ==========================================

function createCityZone(zoneGroup) {
  const city = createCity();

  city.name = 'CityScenery';
  city.position.set(0, 0, 0);

  // The city is a child of the City zone.
  // It must never be moved or recycled independently.
  city.userData.isScrollingCity = false;

  zoneGroup.add(city);

  addCitySkyline(zoneGroup);
}

// Simple, low-detail towers far to each side. They read as a skyline
// through fog, and are merged with the rest of the zone.
function addCitySkyline(parent) {
  const palette = [0x6f7f96, 0x7d8b9e, 0x8593a6, 0x66758c];

  for (let i = 0; i < 25; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (24 + ((i * 7) % 5) * 2);
    const z = -i * 11 - 6;

    const width = 4 + (i % 4) * 1.2;
    const depth = 4 + ((i * 3) % 4);
    const height = 26 + ((i * 5) % 7) * 4;

    addBox(
      parent,
      'CitySkyline',
      x,
      0,
      z,
      width,
      height,
      depth,
      material(palette[i % palette.length], 0.95)
    );
  }
}

// ==========================================
// JUNGLE
// ==========================================

// ==========================================
// JUNGLE UNDERSTORY (shared geometry, merged with the zone)
// ==========================================

// One geometry per kind, built on first use and shared by every instance.
const UNDERSTORY_BUILDERS = {
  frond: () => new THREE.ConeGeometry(0.22, 1.1, 4),
  sapling: () => new THREE.ConeGeometry(0.5, 1.8, 6),
  root: () => new THREE.ConeGeometry(0.35, 1.3, 5),
  vine: () => new THREE.CylinderGeometry(0.035, 0.02, 1, 4),
};

const understoryCache = {};

function understoryGeometry(name) {
  if (!understoryCache[name]) {
    understoryCache[name] = UNDERSTORY_BUILDERS[name]();
  }

  return understoryCache[name];
}

const FROND_COLORS = [0x2f6b2a, 0x3a7a32, 0x27592a];

// A splayed fern: several thin fronds leaning out from one point.
function addFernCluster(parent, x, z, seed) {
  const geometry = understoryGeometry('frond');

  for (let k = 0; k < 5; k++) {
    const frond = new THREE.Mesh(
      geometry,
      material(FROND_COLORS[(seed + k) % FROND_COLORS.length], 0.9)
    );

    const angle = (k / 5) * Math.PI * 2;

    frond.name = 'JungleFern';
    frond.position.set(x + Math.cos(angle) * 0.3, 0.45, z + Math.sin(angle) * 0.3);
    frond.rotation.set(Math.sin(angle) * 0.7, 0, -Math.cos(angle) * 0.7);
    parent.add(frond);
  }
}

// A young tree with a short trunk, to fill the gaps between big trees.
function addSapling(parent, x, z, scale) {
  const sapling = new THREE.Mesh(
    understoryGeometry('sapling'),
    material(0x3c7a34, 0.9)
  );

  sapling.name = 'JungleSapling';
  sapling.position.set(x, 0.9 * scale, z);
  sapling.scale.setScalar(scale);
  parent.add(sapling);
}

// Roots spreading from a trunk base, lying on the ground.
function addTreeRoots(parent, x, z, scale) {
  const geometry = understoryGeometry('root');
  const rootMaterial = material(0x5c4330, 0.95);

  for (let k = 0; k < 3; k++) {
    const root = new THREE.Mesh(geometry, rootMaterial);
    const angle = (k / 3) * Math.PI * 2 + 0.6;

    root.name = 'TreeRoot';
    root.position.set(
      x + Math.cos(angle) * 1.1 * scale,
      0.18,
      z + Math.sin(angle) * 1.1 * scale
    );
    root.rotation.set(Math.PI / 2, 0, angle);
    root.scale.setScalar(scale);
    parent.add(root);
  }
}

// Vines hanging from the canopy, lengths varied by seed.
function addVines(parent, x, z, seed) {
  const geometry = understoryGeometry('vine');
  const vineMaterial = material(0x2d5a25, 0.95);

  for (let k = 0; k < 3; k++) {
    const length = 3 + ((seed + k) % 4) * 1.2;
    const vine = new THREE.Mesh(geometry, vineMaterial);

    vine.name = 'JungleVine';
    vine.scale.set(1, length, 1);
    vine.position.set(x + (k - 1) * 0.5, 7.2 - length / 2, z - k * 1.5);
    parent.add(vine);
  }
}

// Fallen log lying on the ground, with its axis pointing along the road.
function addLog(parent, x, z, side) {
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.3, 3.2, 7),
    material(0x5a4128, 0.95)
  );

  log.name = 'FallenLog';
  log.rotation.x = Math.PI / 2;
  log.rotation.z = side * 0.08;
  log.position.set(x, 0.22, z);
  parent.add(log);
}

// Low, wide bush. Stays near the ground, well below the canopy.
function addBush(parent, x, z, scale = 1) {
  const bush = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    material(0x3f7a35)
  );

  bush.name = 'EnvironmentBush';
  bush.position.set(x, 0.55 * scale, z);
  bush.scale.set(1.1 * scale, 0.7 * scale, 1.1 * scale);
  parent.add(bush);
}

// Tall conifer silhouettes far to each side. They sit outside the
// camera's near view and are softened by fog.
function addJungleSilhouettes(parent) {
  for (let i = 0; i < 20; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (26 + ((i * 5) % 4) * 2.5);
    const z = -i * 14 - 4;
    const height = 20 + ((i * 3) % 5) * 3;

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.8, height, 7),
      material(0x2c5a2f, 0.95)
    );

    cone.name = 'JungleSilhouette';
    cone.position.set(x, height / 2, z);
    parent.add(cone);
  }
}

// A second, further-back layer of canopy masses. They are wider and
// taller than the first layer and read as a continuous forest edge.
function addFarForestLayer(parent) {
  const canopy = material(0x2a5a2e, 0.95);

  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (34 + ((i * 7) % 4) * 3);
    const z = -i * 17 - 10;
    const radius = 4.5 + (i % 3) * 1.2;

    const mass = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 6),
      canopy
    );

    mass.name = 'JungleCanopyMass';
    mass.position.set(x, 14 + (i % 4) * 2.5, z);
    mass.scale.set(1.1, 1.25, 1);
    parent.add(mass);
  }
}

function createJungle(group) {
  addGround(group, 0x466c39);
  addJungleSilhouettes(group);
  addFarForestLayer(group);

  const grassMaterial = material(0x527e3d);

  for (let i = 0; i < 36; i++) {
    const z = -i * 7;

    for (const side of [-1, 1]) {
      // Taller trees set further out. The canopy reaches about 2–3
      // units inward, so it stays clear of the road edge at 4.5.
      // Three height classes, so the forest does not look uniform.
      // Tops land at roughly 11, 17 and 23 units. Width is unchanged.
      addTree(
        group,
     side * (7.8 + (i % 3) * 0.6),
        z,
        1.4 + (i % 3) * 0.15,
        true,
        [1.6, 2.2, 2.8][i % 3]
      );

      // Understory: ferns, saplings, roots and hanging vines. All sit
      // beside the road, outside the corridor, and use shared geometry.
      if (i % 2 === 0) {
        addFernCluster(
  group,
  side * (4.8 + (i % 4) * 0.15),
  z - 1.2,
  i
);
      }

      if (i % 5 === 2) {
       addSapling(
  group,
  side * (5.0 + (i % 3) * 0.2),
  z - 4,
  1 + (i % 3) * 0.25
);
      }

      if (i % 4 === 1) {
      addTree(
  group,
  side * (5.8 + (i % 3) * 0.25),
  z,
  1.3 + (i % 3) * 0.12,
  true,
  [1.6, 2.2, 2.8][i % 3]
);
      }

      if (i % 3 === 0) {
        addVines(group, side * (7.8 + (i % 2) * 0.8), z, i);
      }

      // Fallen log on the forest floor, outside the road edge.
      if (i % 5 === 4) {
        addLog(group, side * (7.6 + (i % 2) * 0.6), z - 3, side);
      }

      // Low bushes between the trees and the road.
      if (i % 2 === 1) {
     addBush(
  group,
  side * 4.9,
  z - 1.5,
  0.9 + (i % 3) * 0.2
);
      }

      if (i % 2 === 0) {
        addRock(
          group,
         side * 4.9
        );
      }
    }

    if (i % 3 === 0) {
      const grass = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.5, 5),
        grassMaterial
      );

      grass.position.set(
        i % 2 ? -5.6 : 5.6,
        0.6,
        z - 3
      );

      group.add(grass);
    }
  }

  for (let i = 0; i < 14; i++) {
    addRock(group, -22, 0, -i * 19, 3 + (i % 3), 0x53614a);
    addRock(group, 22, 0, -i * 19 - 8, 3.5, 0x53614a);
  }
}

// ==========================================
// ANCIENT RUINS
// ==========================================

// Stepped temple base with four corner columns. Shares materials with
// the rest of the zone, so the merge pass batches it with the other stone.
function addTempleLandmark(parent, x, z, color) {
  const stoneMaterial = material(color, 0.92);
  const darkStone = material(0x756751, 0.95);

  addBox(parent, 'TempleBase', x, 0, z, 6.5, 0.8, 6.5, darkStone);
  addBox(parent, 'TempleTier', x, 0.8, z, 5.2, 1.6, 5.2, stoneMaterial);
  addBox(parent, 'TempleTop', x, 2.4, z, 4.2, 1.4, 4.2, stoneMaterial);

  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    addBox(
      parent,
      'TempleColumn',
      x + dx, 0, z + dz,
      0.7, 9 + (dx + dz > 0 ? 2 : 0), 0.7,
      stoneMaterial
    );
  }
}

// Flat moss patch on the ground beside a wall base.
function addMossPatch(parent, x, z) {
  const moss = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 8),
    material(0x5b6b3a, 0.98)
  );

  moss.name = 'MossPatch';
  moss.rotation.x = -Math.PI / 2;
  moss.position.set(x, 0.02, z);
  parent.add(moss);
}

// Thin climbing plant on a wall face, starting at the ground.
function addCreeper(parent, x, z, height) {
  const creeper = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, height, 0.22),
    material(0x3e6a2e, 0.95)
  );

  creeper.name = 'WallCreeper';
  creeper.position.set(x, height / 2, z);
  parent.add(creeper);
}

function createAncientRuins(group) {
  addGround(group, 0x91856b);

  // Sandstone tones. Walls alternate between them, so the structures
  // do not share one flat grey.
  const stonePalette = [0x998b72, 0xa69679, 0x8a7d66, 0xb3a489];
  const stone = material(0x998b72);
  const darkStone = material(0x756751);
  const pillarStone = material(0xb2a184);

  for (let i = 0; i < 8; i++) {
    const z = -18 - i * 32;

    for (const side of [-1, 1]) {
     const x = side * (5.2 + (i % 2) * 0.3);
      addBox(
        group,
        'AncientRuinsWall',
        x, 0, z,
    1.5, 13 + (i % 3) * 3, 6,
        material(stonePalette[(i + (side > 0 ? 1 : 0)) % stonePalette.length], 0.92)
      );

     const pillarX = x - side * 0.8;

      addBox(
        group,
        'RuinsPillar',
        pillarX, 0, z - 5,
        0.85, 16, 0.85,
        pillarStone
      );

      addBox(
        group,
        'RuinsPillarBase',
        pillarX, 0, z - 5,
        1.35, 0.4, 1.35,
        darkStone
      );

      addRock(
        group,
        side * 5.9,
        0,
        z - 11,
        0.8,
        0x857963
      );
    }

    if (i % 2 === 0) {
      addBox(
        group,
        'BrokenStoneArch',
        0, 14, z - 12,
        12, 0.8, 1.2,
        stone
      );
    }
  }

  for (let i = 0; i < 24; i++) {
    addBox(
      group,
      'FallenStone',
      (i % 2 ? 1 : -1) * (5.3 + (i % 3) * 0.5),
      0,
      -i * 10 - 5,
      0.9 + (i % 3) * 0.3,
      0.45 + (i % 2) * 0.3,
      1.2,
      darkStone
    );
  }

  for (let i = 0; i < 12; i++) {
addTree(group, -5.8, -i * 22, 0.75);
addTree(group, 5.8, -i * 22 - 8, 0.85);
    // Rubble and broken column stubs beside the paving, outside the
    // running corridor (|x| ≥ 5).
    for (const side of [-1, 1]) {
      // Rock half-width is up to about 1.05 units, so the centre sits at 5.9+.
      addRock(group, side * (5.9 + (i % 3) * 0.4), 0, -i * 22 - 3, 0.5 + (i % 2) * 0.3, 0x8f8168);

      if (i % 3 === 0) {
        addBox(
          group,
          'BrokenColumnStub',
          side * 6.6, 0, -i * 22 - 8,
          0.9, 1.6 + (i % 2) * 1.0, 0.9,
          pillarStone
        );
      }
    }

    // Temple-style landmark on each side, every fourth row. Stepped base,
    // tiers, and four corner columns. Set well outside the road.
    if (i % 4 === 0) {
      for (const side of [-1, 1]) {
addTempleLandmark(group, side * 11.5, -i * 22 - 14, stonePalette[(i + 2) % stonePalette.length]);
      }
    }

    // Moss patches at the wall bases and a creeper on the inner face.
    if (i % 2 === 0) {
      addMossPatch(group, (i % 2 ? 1 : -1) * 6.6, -i * 22 - 2);
      addCreeper(group, (i % 3 === 0 ? -1 : 1) * 6.25, -i * 22 - 6, 4 + (i % 3));
    }

    // Distant pillars on both sides for depth.
    addBox(
      group,
      'FarRuinPillar',
      -24 - (i % 2) * 3, 0, -i * 22 - 4,
      3.2, 20 + (i % 3) * 4, 3.2,
      pillarStone
    );

    addBox(
      group,
      'FarRuinPillar',
      24 + (i % 2) * 3, 0, -i * 22 - 12,
      3.2, 22 + (i % 3) * 3, 3.2,
      pillarStone
    );
  }
}

// ==========================================
// BRIDGE ZONE
// ==========================================

function createRiverBridge(group) {
  // Valley layout. The land beside the deck sits at road level. The valley
  // floor is far below, and the river runs along it.
  //   deck top -0.07, deck bottom -0.52
  //   river    -4.5  (below the deck, above the valley floor)
  //   floor    -6.0
  // The old water sat at -0.8 under a ground plane at -0.07, so it could
  // never be seen. The ground plane is replaced here, not added to.
  const valleyMaterial = material(0x4d4a40, 0.98);
  const landMaterial = material(0x537b48);

  const valley = new THREE.Mesh(
    new THREE.PlaneGeometry(90, ZONE_LENGTH),
    valleyMaterial
  );

  valley.name = 'BridgeValleyFloor';
  valley.rotation.x = -Math.PI / 2;
  valley.position.set(0, -6, -ZONE_LENGTH / 2);
  valley.receiveShadow = true;
  group.add(valley);

  // Abutments at road level, from x 6.5 to 12.5 on each side. Scenery
  // beside the bridge stands on these.
  for (const side of [-1, 1]) {
    const abutment = new THREE.Mesh(
      new THREE.PlaneGeometry(6, ZONE_LENGTH),
      landMaterial
    );

    abutment.name = 'BridgeAbutment';
    abutment.rotation.x = -Math.PI / 2;
    abutment.position.set(side * 9.5, -0.07, -ZONE_LENGTH / 2);
    abutment.receiveShadow = true;
    group.add(abutment);
  }

  // River in the valley. It reuses the River's wave system, so it is
  // excluded from merging and its waves are set on group.userData.water.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(70, ZONE_LENGTH, 12, 48),
    material(0x258db7, 0.28, { metalness: 0.12 })
  );

  water.name = 'BridgeZoneWater';
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -4.5, -ZONE_LENGTH / 2);
  water.userData.noMerge = true;
  water.userData.waterBase = Float32Array.from(
    water.geometry.attributes.position.array
  );
  group.add(water);
  group.userData.water = water;

  const bridgeMaterial = material(0x777a7d);
  const railMaterial = material(0xb7b9b8);
  const supportMaterial = material(0x6d7275);

  addBox(
    group,
    'BridgeDeck',
    0, -0.52, -ZONE_LENGTH / 2,
  9.6, 0.45, ZONE_LENGTH,
    bridgeMaterial
  );

  // Rust and dirt variants for the railings. A few sections are rusted,
  // so the rails do not look uniform. Shared, so this adds no new geometry.
  const rustMaterial = material(0x8a5a3c, 0.85);
  const grimeMaterial = material(0x5c5f5e, 0.9);
  const parapetMaterial = material(0x9a9893, 0.92);

  for (const side of [-1, 1]) {
    // Concrete parapet cap along the deck edge, outside the road corridor.
    addBox(
      group,
      'BridgeParapet',
    side * 4.65, -0.07, -ZONE_LENGTH / 2,
0.35, 0.35, ZONE_LENGTH,
      parapetMaterial
    );

    // Railing in 20-unit sections, with every fifth section missing.
    // Railings have no collision, so the gaps are visual only.
    for (let s = 0; s < ZONE_LENGTH; s += 20) {
      if (Math.floor(s / 20) % 5 === 2) continue;

      const section = Math.floor(s / 20);
      const variant = section % 4 === 1 ? rustMaterial : section % 4 === 3 ? grimeMaterial : railMaterial;

      addBox(
        group,
        'BridgeRail',
      side * 4.5, 0.12, -s - 10,
0.3, 1.1, 20,
        variant
      );
    }

    for (let i = 0; i < 18; i++) {
      addBox(
        group,
        'BridgeSupport',
        side * 6.1, -14, -i * 16 - 6,
        0.9, 13.4, 0.9,
        supportMaterial
      );

      // Tall pylons above the rails, every third support row.
      // They stay on the rail line, outside the road.
      if (i % 3 === 0) {
        addBox(
          group,
          'BridgeTower',
          side * 6.1, 1.22, -i * 16 - 6,
          0.8, 14.8, 0.8,
          supportMaterial
        );
      }

      // Pillars run down into the water. Cross beams tie them together
      // under the deck, once per support row (on the left pass only).
      if (side < 0) {
        addBox(
          group,
          'BridgeCrossBeam',
          0, -1.1, -i * 16 - 6,
          12.6, 0.35, 0.7,
          supportMaterial
        );
      }
    }
  }

  for (let i = 0; i < 24; i++) {
    const z = -i * 12;

    addTree(group, -10 - (i % 3) * 0.5, z, 0.8);
    addTree(group, 10 + (i % 2) * 0.5, z - 5, 0.85);

    if (i % 2 === 0) {
      addRock(group, -7.8, 0, z - 4, 0.8, 0x77766f);
      addRock(group, 7.8, 0, z - 7, 0.8, 0x77766f);
    }
  }
}

// ==========================================
// SEPARATE RIVER ZONE
// ==========================================

function createRiverZone(group) {
  addGround(group, 0x537b48);

  // The water used to sit at y -0.75, under the ground plane at -0.07,
  // so it was never visible. It now sits just above the ground (0.004),
  // below the road (0.012) and the sand strips (0.01 is above it).
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(76, ZONE_LENGTH, 12, 48),
    material(0x168bbd, 0.24, {
      metalness: 0.16,
    })
  );

  water.name = 'RiverWater';
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.004, -ZONE_LENGTH / 2);

  // Waves are applied to vertices each frame, so this mesh must not be
  // merged into the static scenery batch.
  water.userData.noMerge = true;
  water.userData.waterBase = Float32Array.from(
    water.geometry.attributes.position.array
  );

  group.add(water);
  group.userData.water = water;

  // Raised banks beside the water, outside the road corridor.
  const bankMaterial = material(0x6b6a58, 0.95);

  for (let i = 0; i < 24; i++) {
    for (const side of [-1, 1]) {
      addBox(
        group,
        'RiverBank',
        side * 11, -0.3, -i * 12 - 2,
        4, 1.2, 10,
        bankMaterial
      );
    }
  }

  // Sandy shore strips between the road edge and the low banks.
  const sandMaterial = material(0xc2a878, 0.98);

  for (let i = 0; i < 24; i++) {
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 12),
        sandMaterial
      );

      strip.rotation.x = -Math.PI / 2;
      strip.position.set(side * 6.8, 0.01, -i * 12 - 6);
      strip.name = 'RiverSand';
      group.add(strip);
    }
  }

  // Tall cliffs further back. The low shore banks above stay in front,
  // so the water remains visible from the camera.
  for (let i = 0; i < 24; i++) {
    for (const side of [-1, 1]) {
      addBox(
        group,
        'RiverCliff',
        side * 17, -0.3, -i * 12 - 2,
        6, 8 + (i % 3) * 2, 10,
        bankMaterial
      );
    }
  }

  // Riverbanks and scenery remain inside this zone.
  for (let i = 0; i < 24; i++) {
    const z = -i * 12;
addTree(group, -8.8 - (i % 3) * 0.3, z, 0.85, true, 2.2 + (i % 3) * 0.3);
addTree(group, 8.8 + (i % 2) * 0.3, z - 5, 0.9, true, 2.5 + (i % 2) * 0.3);
    if (i % 2 === 0) {
  addRock(group, -6.9, 0, z - 4, 0.8, 0x77766f);
addRock(group, 6.9, 0, z - 7, 0.8, 0x77766f);
    }
  }
}

// ==========================================
// CREATE ZONE
// ==========================================

function createZone(config, index) {
  const group = new THREE.Group();

  group.name = config.name;
  group.userData.zoneName = config.name;
  group.userData.zoneIndex = index;
  group.userData.initialZ = -index * ZONE_LENGTH;

  // Scenery is built first, then merged while the zone is still at
  // the origin. Merging needs local space, so the zone is positioned
  // only after this.
  config.create(group);

  // Scenery is static and decorative. Turning off its shadows removes
  // most of the shadow-pass draw calls. The player, obstacles and coins
  // still cast shadows.
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
    }
  });

  mergeStaticScenery(group);

  // Road and scenery belong to the same zone.
  const zoneRoad = createRoadSegment(config.name, ZONE_LENGTH);

  zoneRoad.position.z = 0;
  group.add(zoneRoad);

  // The zone road ends at its own position, so the stretch just behind the
  // runner (between that end and the camera) had no road and showed the
  // green world ground, at every zone change and at the start. This short
  // continuation closes that gap with the same road style.
  const roadContinuation = createRoadSegment(config.name, ROAD_CONTINUATION_LENGTH);

  roadContinuation.position.z = ROAD_CONTINUATION_LENGTH;
  group.add(roadContinuation);
  group.userData.roadContinuation = roadContinuation;

  group.position.set(0, 0, group.userData.initialZ);

  return group;
}

// ==========================================
// CREATE ENVIRONMENT
// ==========================================

// worldZone: name of one zone (for example 'Jungle'). When given, the
// environment is that single world. When null, all zones cycle (classic).
export function createEnvironment(scene, worldZone = null) {
  const worldConfig = worldZone
    ? ZONE_CONFIGS.find((config) => config.name === worldZone)
    : null;

  const configs = worldConfig
    ? Array.from({ length: LEVEL_WORLD_ZONE_COUNT }, () => worldConfig)
    : ZONE_CONFIGS;

  const zones = configs.map((config, index) => {
    const zone = createZone(config, index);
    scene.add(zone);

    console.log(
      `[ENVIRONMENT] Created ${zone.name} at Z=${zone.position.z}`
    );

    return zone;
  });

  const environment = {
    zones,
    zoneLength: ZONE_LENGTH,
    zoneCount: zones.length,
    zoneNames: zones.map((zone) => zone.name),
    scene,
    worldZone: worldConfig ? worldZone : null,
  };

  console.log(
    '[ENVIRONMENT] ORDER:',
    environment.zoneNames.join(' → ')
  );

  return environment;
}

// ==========================================
// MOVE AND RECYCLE ZONES
// ==========================================

// Only the zone nearest the camera needs its road continuation. Any other
// continuation would overlap the zone ahead and flicker (z-fighting).
function updateRoadContinuations(environment) {
  let front = null;

  for (const zone of environment.zones) {
    if (!front || zone.position.z > front.position.z) front = zone;
  }

  for (const zone of environment.zones) {
    const continuation = zone.userData.roadContinuation;

    if (continuation) continuation.visible = zone === front;
  }
}

export function updateEnvironment(environment, delta, speed) {
  if (!environment?.zones?.length) return;

  const moveDistance =
    Math.max(0, speed) * Math.min(delta, 0.05);

  const length = environment.zoneLength;

  // All five zones move together.
  for (const zone of environment.zones) {
    zone.position.z += moveDistance;
  }

  // Recycle a zone behind the farthest-back zone.
  // Its road and scenery move together because they share a parent.
  for (const zone of environment.zones) {
    if (zone.position.z < length) continue;

    let farthestBackZ = Infinity;

    for (const other of environment.zones) {
      if (other === zone) continue;

      farthestBackZ = Math.min(
        farthestBackZ,
        other.position.z
      );
    }

    zone.position.z = farthestBackZ - length;

    if (__DEV__) {
      console.log(`[ENVIRONMENT] RECYCLED ${zone.name} to Z=${zone.position.z}`);
    }
  }

  updateRoadContinuations(environment);
}

// ==========================================
// RESET ENVIRONMENT
// ==========================================

/**
 * Ripples the River water. Only vertex Z changes, along the surface normal.
 * The amplitude is zero under the road and grows toward the banks, so the
 * road stays clean. It reads a time value passed in by the game loop, so it
 * stops while the game is paused. It never touches collision or zone
 * positions, and allocates nothing per frame.
 */
export function updateWaterAnimation(environment, time) {
  if (!environment?.zones) return;

  for (const zone of environment.zones) {
    const water = zone.userData.water;
    if (!water) continue;

    const position = water.geometry.attributes.position;
    const base = water.userData.waterBase;
    const out = position.array;

    for (let i = 0; i < position.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];

      const edge = Math.min(1, Math.max(0, (Math.abs(x) - 5) / 3));
      const wave =
        Math.sin(x * 0.35 + time * 1.4) *
        Math.cos(y * 0.22 + time * 0.9);

      out[i * 3 + 2] = base[i * 3 + 2] + 0.02 * edge * wave;
    }

    position.needsUpdate = true;
  }
}

/**
 * Places the zones for a fresh start. `startIndex` is the zone the player
 * begins in; the zones after it follow in their normal order. The default
 * (0) is the ordinary endless start.
 */
export function resetEnvironment(environment, startIndex = 0) {
  if (!environment?.zones?.length) return;

  const count = environment.zones.length;
  const start = ((startIndex % count) + count) % count;

  environment.zones.forEach((zone, index) => {
    const offset = (index - start + count) % count;

    zone.position.set(
      0,
      0,
      -offset * environment.zoneLength
    );
  });

  updateRoadContinuations(environment);

  console.log('[ENVIRONMENT] RESET COMPLETE, starting in zone', start);
}

// ==========================================
// DISPOSE ENVIRONMENT
// ==========================================

export function disposeEnvironment(scene, environment) {
  if (!environment?.zones) return;

  for (const zone of environment.zones) {
    scene?.remove(zone);

    zone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.geometry?.dispose();

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      materials.forEach((mat) => mat?.dispose());
    });
  }

  environment.zones.length = 0;

  console.log('[ENVIRONMENT] DISPOSED');
}