
 // ============================================
 // TRAFFIC VEHICLES — UPDATED LOW-POLY GEOMETRY
 //
 // Larger original Three.js cars and vans.
 // Shared geometry/materials keep memory usage low.
 // Front faces +Z; origin stays on the road surface.
 // ============================================

import * as THREE from 'three';

export const VEHICLE_TYPES = {
car: {
  length: 3.12,
  width: 1.75,
  bodyHeight: 1.05,  // was 0.72
  cabinHeight: 0.85, // was 0.58
  cabinLength: 1.65,
  cabinOffsetZ: -0.15,
},
 van: {
  length: 3.7,
  width: 1.95,
  bodyHeight: 1.40,  // was 1.10
  cabinHeight: 1.20, // was 0.95
  cabinLength: 2.45,
  cabinOffsetZ: -0.4,
},
};

const WHEEL_RADIUS = 0.34;
const WHEEL_WIDTH = 0.28;
const GROUND_CLEARANCE = 0.06;

// Original vehicle colour palette.
export const VEHICLE_COLORS = [
  0xd8453b,
  0x2f74c0,
  0xf2c94c,
  0xe9e9e4,
  0x3c9c6b,
  0x7c4fb0,
];

const cache = {
  geometry: new Map(),
  material: new Map(),
};

function sharedGeometry(key, factory) {
  if (!cache.geometry.has(key)) {
    cache.geometry.set(key, factory());
  }

  return cache.geometry.get(key);
}

function sharedMaterial(key, options) {
  if (!cache.material.has(key)) {
    cache.material.set(
      key,
      new THREE.MeshStandardMaterial(options)
    );
  }

  return cache.material.get(key);
}

function bodyMaterial(color) {
  return sharedMaterial(`body:${color}`, {
    color,
    roughness: 0.5,
    metalness: 0.15,
  });
}

const glassMaterial = () =>
  sharedMaterial('glass', {
    color: 0x1d2a38,
    roughness: 0.25,
    metalness: 0.3,
  });

const wheelMaterial = () =>
  sharedMaterial('wheel', {
    color: 0x191a1c,
    roughness: 0.9,
  });

const trimMaterial = () =>
  sharedMaterial('trim', {
    color: 0x2b2e33,
    roughness: 0.7,
  });

const headlightMaterial = () =>
  sharedMaterial('headlight', {
    color: 0xfff6d0,
    emissive: 0xfff0b0,
    emissiveIntensity: 0.6,
  });

const taillightMaterial = () =>
  sharedMaterial('taillight', {
    color: 0xb3261e,
    emissive: 0x8a120c,
    emissiveIntensity: 0.5,
  });

function box(
  parent,
  name,
  width,
  height,
  depth,
  x,
  y,
  z,
  material
) {
  const geometry = sharedGeometry(
    `box:${width}:${height}:${depth}`,
    () => new THREE.BoxGeometry(width, height, depth)
  );

  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  parent.add(mesh);

  return mesh;
}

/**
 * Creates one low-poly traffic vehicle.
 *
 * @param {'car' | 'van'} type
 * @param {number} colorIndex
 * @returns {THREE.Group}
 */
export function createTrafficVehicle(
  type = 'car',
  colorIndex = 0
) {
  const spec = VEHICLE_TYPES[type] ?? VEHICLE_TYPES.car;

  const color =
    VEHICLE_COLORS[
      Math.abs(Math.trunc(colorIndex)) % VEHICLE_COLORS.length
    ];

  const vehicle = new THREE.Group();
  vehicle.name = `TrafficVehicle_${type}`;

  const bodyBottom = WHEEL_RADIUS + GROUND_CLEARANCE;
  const bodyTop = bodyBottom + spec.bodyHeight;

  const cabinWidth = spec.width * 0.86;
  const cabinZ = spec.cabinOffsetZ;
  const glassY = bodyTop + spec.cabinHeight * 0.55;
  const glassDepth = 0.05;

  // Main body.
  box(
    vehicle,
    'Body',
    spec.width,
    spec.bodyHeight,
    spec.length,
    0,
    bodyBottom + spec.bodyHeight / 2,
    0,
    bodyMaterial(color)
  );

  // Raised cabin.
  box(
    vehicle,
    'Cabin',
    cabinWidth,
    spec.cabinHeight,
    spec.cabinLength,
    0,
    bodyTop + spec.cabinHeight / 2,
    cabinZ,
    bodyMaterial(color)
  );

  // Front windscreen.
  box(
    vehicle,
    'Windscreen',
    cabinWidth * 0.92,
    spec.cabinHeight * 0.6,
    glassDepth,
    0,
    glassY,
    cabinZ + spec.cabinLength / 2 + 0.02,
    glassMaterial()
  );

  // Rear window.
  box(
    vehicle,
    'RearWindow',
    cabinWidth * 0.92,
    spec.cabinHeight * 0.55,
    glassDepth,
    0,
    glassY,
    cabinZ - spec.cabinLength / 2 - 0.02,
    glassMaterial()
  );

  // Side windows.
  for (const side of [-1, 1]) {
    box(
      vehicle,
      'SideWindow',
      glassDepth,
      spec.cabinHeight * 0.5,
      spec.cabinLength * 0.8,
      side * (cabinWidth / 2 + 0.015),
      glassY,
      cabinZ,
      glassMaterial()
    );
  }

  // Front and rear bumpers.
  box(
    vehicle,
    'FrontBumper',
    spec.width * 0.96,
    0.18,
    0.16,
    0,
    bodyBottom + 0.1,
    spec.length / 2 + 0.05,
    trimMaterial()
  );

  box(
    vehicle,
    'RearBumper',
    spec.width * 0.96,
    0.18,
    0.16,
    0,
    bodyBottom + 0.1,
    -spec.length / 2 - 0.05,
    trimMaterial()
  );

  // Headlights and tail lights.
  for (const side of [-1, 1]) {
    box(
      vehicle,
      'Headlight',
      0.32,
      0.16,
      0.06,
      side * spec.width * 0.32,
      bodyBottom + spec.bodyHeight * 0.62,
      spec.length / 2 + 0.04,
      headlightMaterial()
    );

    box(
      vehicle,
      'Taillight',
      0.32,
      0.16,
      0.06,
      side * spec.width * 0.32,
      bodyBottom + spec.bodyHeight * 0.62,
      -spec.length / 2 - 0.04,
      taillightMaterial()
    );
  }

  // Wheels.
  const wheelGeometry = sharedGeometry(
    `wheel:${WHEEL_RADIUS}:${WHEEL_WIDTH}`,
    () => {
      const geometry = new THREE.CylinderGeometry(
        WHEEL_RADIUS,
        WHEEL_RADIUS,
        WHEEL_WIDTH,
        12
      );

      geometry.rotateZ(Math.PI / 2);
      return geometry;
    }
  );

  for (const side of [-1, 1]) {
    for (const along of [-1, 1]) {
      const wheel = new THREE.Mesh(
        wheelGeometry,
        wheelMaterial()
      );

      wheel.name = 'Wheel';

      wheel.position.set(
        side * (spec.width / 2 + 0.015),
        WHEEL_RADIUS,
        along * spec.length * 0.32
      );

      vehicle.add(wheel);
    }
  }

  // Collision dimensions: match the enlarged vehicle body.
  vehicle.userData.type = 'traffic';
  vehicle.userData.vehicleType = type;
  vehicle.userData.halfWidth = spec.width / 2;
  vehicle.userData.halfLength = spec.length / 2;

  return vehicle;
}
