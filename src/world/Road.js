
import * as THREE from 'three';

import { LANE_WIDTH, LANE_X } from '../game/GameConfig';

// ============================================
// ROAD CONFIGURATION
// ============================================

// Narrower road while preserving the existing three lane positions.
// LANE_X remains [-2, 0, 2].
export const ROAD_WIDTH = LANE_WIDTH * 3 + 1.2;
export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;

export const ROAD_LENGTH = 300;
export const ROAD_CENTER_Z = -125;
export const LANE_POSITIONS = LANE_X;

const ZONE_ROAD_LENGTH = 280;

// Keep all road markings aligned with the existing lane layout.
const LANE_DIVIDERS = [
  -LANE_WIDTH / 2,
  LANE_WIDTH / 2,
];

// Use shared materials to avoid unnecessary duplication.
const ROAD_STYLES = {
  City: {
    surface: 0x292c31,
    marking: 0xf5f4eb,
    edge: 0xffffff,
    shoulder: 0xf0c94a,
  },
  Jungle: {
    surface: 0x343b32,
    marking: 0xf4f0d8,
    edge: 0xd8d7b8,
    shoulder: 0xb9a35b,
  },
  'Ancient Ruins': {
    surface: 0x817663,
    marking: 0xe8d8ae,
    edge: 0xc7b99b,
    shoulder: 0xb7a06b,
  },
  Bridge: {
    surface: 0x4d5257,
    marking: 0xd9d4bd,
    edge: 0xbfc3c4,
    shoulder: 0xa88f5f,
  },
  River: {
    surface: 0x6e6456,
    marking: 0xe6e0c4,
    edge: 0x9e9079,
    shoulder: 0x8b7850,
  },
  'Mountain Pass': {
    surface: 0x555a5c,
    marking: 0xf4e8c9,
    edge: 0xe3e3df,
    shoulder: 0xb4a16c,
  },
  'River Bridge': {
    surface: 0x555b60,
    marking: 0xf8f4d8,
    edge: 0xffffff,
    shoulder: 0xe0c75c,
  },
};

// ============================================
// ROAD DETAIL DECALS
// ============================================

const decalCache = {
  geometry: new Map(),
  material: new Map(),
};

function decalGeometry(kind, w, h) {
  const key = `${kind}:${w}:${h}`;

  if (!decalCache.geometry.has(key)) {
    decalCache.geometry.set(
      key,
      kind === 'disc'
        ? new THREE.CircleGeometry(w, 10)
        : new THREE.PlaneGeometry(w, h)
    );
  }

  return decalCache.geometry.get(key);
}

function decalMaterial(color, opacity = 1) {
  const key = `${color}:${opacity}`;

  if (!decalCache.material.has(key)) {
    decalCache.material.set(
      key,
      new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
    );
  }

  return decalCache.material.get(key);
}

function addDecal(
  group,
  kind,
  x,
  z,
  w,
  h,
  color,
  opacity = 1,
  rotationZ = 0
) {
  const mesh = new THREE.Mesh(
    decalGeometry(kind, w, h),
    decalMaterial(color, opacity)
  );

  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotationZ;
  mesh.position.set(x, 0.03, z);
  mesh.name = 'RoadDecal';
  mesh.receiveShadow = true;

  group.add(mesh);
}

const ZONE_DECALS = {
  City(group, length) {
    for (let i = 0; i < length / 40; i++) {
      addDecal(
        group,
        'plane',
        (i % 2 ? 1 : -1) * 1.55,
        -i * 40 - 12,
        1.1,
        1.6,
        0x1b1d20,
        0.55
      );
    }

    for (let i = 0; i < length / 60; i++) {
      addDecal(
        group,
        'disc',
        i % 2 ? 2.8 : -2.8,
        -i * 60 - 30,
        0.4,
        0,
        0x3a3d42
      );
    }
  },

  Jungle(group, length) {
    for (let i = 0; i < length / 14; i++) {
      const x = ((i * 37) % 7) - 3;

      addDecal(
        group,
        'disc',
        x,
        -i * 14 - 6,
        0.7 + (i % 3) * 0.2,
        0,
        0x3d4a22,
        0.5
      );
    }
  },

  Bridge(group, length) {
    for (let i = 0; i < length / 24; i++) {
      addDecal(
        group,
        'plane',
        0,
        -i * 24 - 12,
        ROAD_WIDTH,
        0.25,
        0x15171a,
        0.8
      );
    }

    for (let i = 0; i < length / 60; i++) {
      addDecal(
        group,
        'disc',
        i % 2 ? 2.2 : -2.2,
        -i * 60 - 40,
        0.8,
        0,
        0x6b6f72,
        0.5
      );
    }

    for (let i = 0; i < length / 46; i++) {
      addDecal(
        group,
        'plane',
        i % 2 ? 1.4 : -1.4,
        -i * 46 - 20,
        0.08,
        3.4,
        0x1b1d20,
        0.6,
        0.12
      );
    }
  },

  'Ancient Ruins'(group, length) {
    for (let i = 0; i < length / 6; i++) {
      addDecal(
        group,
        'plane',
        0,
        -i * 6,
        ROAD_WIDTH,
        0.06,
        0xb9ad8a,
        0.7
      );
    }

    for (let i = 0; i < length / 30; i++) {
      addDecal(
        group,
        'disc',
        i % 2 ? 2 : -2,
        -i * 30 - 9,
        0.55,
        0,
        0x9c8e70,
        0.6
      );
    }
  },

  River(group, length) {
    for (let i = 0; i < length / 32; i++) {
      addDecal(
        group,
        'disc',
        (i % 3) - 1,
        -i * 32 - 14,
        0.9,
        0,
        0x4f4a40,
        0.45
      );
    }
  },
};

// ============================================
// ZONE ROAD SEGMENT
// ============================================

export function createRoadSegment(
  styleName,
  length = ZONE_ROAD_LENGTH
) {
  const style = ROAD_STYLES[styleName] || ROAD_STYLES.City;
  const group = new THREE.Group();

  group.name = `${styleName.replace(/\s+/g, '')}RoadSegment`;
  group.userData.isZoneRoad = true;
  group.userData.zoneName = styleName;

  // Main asphalt.
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, length),
    new THREE.MeshStandardMaterial({
      color: style.surface,
      roughness: 0.94,
      metalness: 0.02,
    })
  );

  asphalt.name = 'ZoneRoadSurface';
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, 0.012, -length / 2);
  asphalt.receiveShadow = true;

  group.add(asphalt);

  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: style.edge,
  });

  const shoulderMaterial = new THREE.MeshBasicMaterial({
    color: style.shoulder,
  });

  const laneMaterial = new THREE.MeshBasicMaterial({
    color: style.marking,
  });

  // Edge and shoulder lines follow the narrower road boundaries.
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, length),
      edgeMaterial
    );

    edge.rotation.x = -Math.PI / 2;
    edge.position.set(
      side * (ROAD_HALF_WIDTH - 0.12),
      0.025,
      -length / 2
    );
    edge.name = 'ZoneRoadEdge';

    group.add(edge);

    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(0.055, length),
      shoulderMaterial
    );

    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(
      side * (ROAD_HALF_WIDTH - 0.38),
      0.027,
      -length / 2
    );
    shoulder.name = 'ZoneRoadShoulder';

    group.add(shoulder);
  }

  // Two lane dividers between the three playable lanes.
  const dashGeometry = new THREE.PlaneGeometry(0.1, 4.2);

  for (const x of LANE_DIVIDERS) {
    for (let i = 0; i < Math.ceil(length / 9); i++) {
      const dash = new THREE.Mesh(dashGeometry, laneMaterial);

      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.032, -i * 9 - 2);
      dash.name = 'ZoneLaneMarking';

      group.add(dash);
    }
  }

  // Reflectors remain outside the asphalt.
  const reflectorMaterial = new THREE.MeshStandardMaterial({
    color: style.edge,
    emissive: style.edge,
    emissiveIntensity: 0.12,
    roughness: 0.6,
  });

  for (let i = 0; i < Math.ceil(length / 14); i++) {
    const z = -i * 14 - 5;

    for (const side of [-1, 1]) {
      const reflector = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.4),
        reflectorMaterial
      );

      reflector.position.set(
        side * (ROAD_HALF_WIDTH + 0.12),
        0.09,
        z
      );
      reflector.name = 'RoadsideReflector';

      group.add(reflector);
    }
  }

  ZONE_DECALS[styleName]?.(group, length);

  return group;
}

// ============================================
// LEGACY STANDALONE ROAD
// ============================================
// Retained for compatibility. GameWorld should not add this on top
// of the zone roads.

export function createRoad() {
  const group = new THREE.Group();
  group.name = 'RunnerRoad';

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
    new THREE.MeshStandardMaterial({
      color: ROAD_STYLES.City.surface,
      roughness: 0.94,
    })
  );

  road.name = 'MainAsphaltRoad';
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, ROAD_CENTER_Z);
  road.receiveShadow = true;

  group.add(road);

  const white = new THREE.MeshBasicMaterial({
    color: ROAD_STYLES.City.marking,
  });

  const yellow = new THREE.MeshBasicMaterial({
    color: ROAD_STYLES.City.shoulder,
  });

  const sidewalkMaterial = new THREE.MeshStandardMaterial({
    color: 0x777b80,
    roughness: 0.95,
  });

  const curbMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9d9d9,
    roughness: 0.85,
  });

  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, ROAD_LENGTH),
      white
    );

    edge.rotation.x = -Math.PI / 2;
    edge.position.set(
      side * (ROAD_HALF_WIDTH - 0.12),
      0.025,
      ROAD_CENTER_Z
    );
    edge.name = 'RoadEdgeLine';

    group.add(edge);

    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(0.055, ROAD_LENGTH),
      yellow
    );

    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(
      side * (ROAD_HALF_WIDTH - 0.38),
      0.027,
      ROAD_CENTER_Z
    );
    shoulder.name = 'RoadShoulderLine';

    group.add(shoulder);

    // Narrower sidewalks sit just outside the road.
    const sidewalk = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, ROAD_LENGTH),
      sidewalkMaterial
    );

    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(
      side * (ROAD_HALF_WIDTH + 0.5),
      0.01,
      ROAD_CENTER_Z
    );
    sidewalk.name = 'Sidewalk';

    group.add(sidewalk);

    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.14, ROAD_LENGTH),
      curbMaterial
    );

    curb.position.set(
      side * (ROAD_HALF_WIDTH + 0.08),
      0.07,
      ROAD_CENTER_Z
    );
    curb.name = 'SidewalkCurb';

    group.add(curb);
  }

  const dashMaterial = new THREE.MeshBasicMaterial({
    color: ROAD_STYLES.City.marking,
  });

  const dashGeometry = new THREE.PlaneGeometry(0.1, 4.2);

  for (const x of LANE_DIVIDERS) {
    for (let i = 0; i < 34; i++) {
      const dash = new THREE.Mesh(dashGeometry, dashMaterial);

      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.032, -i * 9 - 2);
      dash.name = 'LaneMarking';

      group.add(dash);
    }
  }

  return group;
}
