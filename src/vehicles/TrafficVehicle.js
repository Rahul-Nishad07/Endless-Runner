// ============================================
// TRAFFIC VEHICLES — ORIGINAL PLACEHOLDER GEOMETRY
//
// Low-poly cars and vans built from Three.js primitives. There are no
// external models, branding or copied assets. Geometry and materials are
// cached and shared by every vehicle, so creating many vehicles adds few
// new resources.
//
// Each vehicle is built along +Z. The front (headlights) faces +Z, toward
// the player, and the origin sits on the road surface between the wheels.
// ============================================

import * as THREE from 'three';

export const VEHICLE_TYPES = {
  car: {
    length: 2.6,
    width: 1.4,
    bodyHeight: 0.62,
    cabinHeight: 0.5,
    cabinLength: 1.4,
    cabinOffsetZ: -0.12,
  },
  van: {
    length: 3.2,
    width: 1.6,
    bodyHeight: 1.0,
    cabinHeight: 0.85,
    cabinLength: 2.2,
    cabinOffsetZ: -0.35,
  },
};

const WHEEL_RADIUS = 0.32;
const WHEEL_WIDTH = 0.26;
const GROUND_CLEARANCE = 0.06;

// Body colours. Each vehicle picks one by index.
export const VEHICLE_COLORS = [0xd8453b, 0x2f74c0, 0xf2c94c, 0xe9e9e4, 0x3c9c6b, 0x7c4fb0];

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
    cache.material.set(key, new THREE.MeshStandardMaterial(options));
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
  sharedMaterial('glass', { color: 0x1d2a38, roughness: 0.25, metalness: 0.3 });

const wheelMaterial = () =>
  sharedMaterial('wheel', { color: 0x191a1c, roughness: 0.9 });

const trimMaterial = () =>
  sharedMaterial('trim', { color: 0x2b2e33, roughness: 0.7 });

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

function box(parent, name, width, height, depth, x, y, z, material) {
  const geometry = sharedGeometry(`box:${width}:${height}:${depth}`, () =>
    new THREE.BoxGeometry(width, height, depth)
  );

  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  parent.add(mesh);

  return mesh;
}

/**
 * Builds one vehicle. `type` is 'car' or 'van'. `colorIndex` picks the
 * body colour. The returned group carries the collision sizes in userData.
 */
export function createTrafficVehicle(type = 'car', colorIndex = 0) {
  const spec = VEHICLE_TYPES[type] ?? VEHICLE_TYPES.car;
  const color = VEHICLE_COLORS[colorIndex % VEHICLE_COLORS.length];

  const vehicle = new THREE.Group();
  vehicle.name = `TrafficVehicle_${type}`;

  const bodyBottom = WHEEL_RADIUS + GROUND_CLEARANCE;
  const bodyTop = bodyBottom + spec.bodyHeight;

  // Lower body.
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

  // Cabin, set toward the rear.
  const cabinWidth = spec.width * 0.86;
  const cabinZ = spec.cabinOffsetZ;

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

  const glassY = bodyTop + spec.cabinHeight * 0.55;
  const glassDepth = 0.04;

  // Windscreen (front) and rear window.
  box(
    vehicle,
    'Windscreen',
    cabinWidth * 0.92,
    spec.cabinHeight * 0.6,
    glassDepth,
    0,
    glassY,
    cabinZ + spec.cabinLength / 2 + 0.01,
    glassMaterial()
  );

  box(
    vehicle,
    'RearWindow',
    cabinWidth * 0.92,
    spec.cabinHeight * 0.55,
    glassDepth,
    0,
    glassY,
    cabinZ - spec.cabinLength / 2 - 0.01,
    glassMaterial()
  );

  // Side windows, one each side.
  for (const side of [-1, 1]) {
    box(
      vehicle,
      'SideWindow',
      glassDepth,
      spec.cabinHeight * 0.5,
      spec.cabinLength * 0.8,
      side * (cabinWidth / 2 + 0.01),
      glassY,
      cabinZ,
      glassMaterial()
    );
  }

  // Bumpers.
  box(
    vehicle,
    'FrontBumper',
    spec.width * 0.95,
    0.16,
    0.14,
    0,
    bodyBottom + 0.1,
    spec.length / 2 + 0.05,
    trimMaterial()
  );

  box(
    vehicle,
    'RearBumper',
    spec.width * 0.95,
    0.16,
    0.14,
    0,
    bodyBottom + 0.1,
    -spec.length / 2 - 0.05,
    trimMaterial()
  );

  // Headlights (front) and tail lights (rear).
  for (const side of [-1, 1]) {
    box(
      vehicle,
      'Headlight',
      0.3,
      0.14,
      0.05,
      side * spec.width * 0.32,
      bodyBottom + spec.bodyHeight * 0.6,
      spec.length / 2 + 0.03,
      headlightMaterial()
    );

    box(
      vehicle,
      'Taillight',
      0.3,
      0.14,
      0.05,
      side * spec.width * 0.32,
      bodyBottom + spec.bodyHeight * 0.6,
      -spec.length / 2 - 0.03,
      taillightMaterial()
    );
  }

  // Wheels, with their axles along X.
  const wheelGeometry = sharedGeometry('wheel', () => {
    const geometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 12);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  });

  for (const side of [-1, 1]) {
    for (const along of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial());

      wheel.name = 'Wheel';
      wheel.position.set(
        side * (spec.width / 2 - WHEEL_WIDTH / 2),
        WHEEL_RADIUS,
        along * spec.length * 0.32
      );

      vehicle.add(wheel);
    }
  }

  // Collision sizes. Half-extents, in the same units as the player and
  // obstacles.
  vehicle.userData.type = 'traffic';
  vehicle.userData.vehicleType = type;
  vehicle.userData.halfWidth = spec.width / 2;
  vehicle.userData.halfLength = spec.length / 2;

  return vehicle;
}
