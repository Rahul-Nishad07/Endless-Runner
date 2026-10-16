// ============================================
// CHASE TRUCK
//
// A box truck built from primitives: a red cab with glazing, mirrors,
// roof lights and grille, and a white box trailer with rear doors,
// reflectors, fuel tanks and wheel arches. Geometries and materials are
// created once and shared. A soft contact shadow sits under the truck, and
// dust puffs trail the rear wheels while it is chasing. Nothing is
// allocated per frame.
//
// The truck is drawn at a visual gap behind the runner, not at the full
// gameplay distance (see visualGap). The chase rules are unchanged.
//
// The model faces -Z, the same direction as the runner. The camera sees
// its rear, so the trailer doors and tail lights are the main detail.
// ============================================

import * as THREE from 'three';

export const CHASE_TRUCK_CONFIG = {
  // Lane-follow smoothing (per second). Higher snaps faster.
  laneFollowRate: 8,

  // How fast the shown gap follows the target (per second). Slow enough
  // that a hit closes the gap in a smooth move, not a jump.
  distanceFollowRate: 2.5,

  // When the truck first appears it starts this far back and closes in,
  // so it approaches from behind instead of popping in.
  approachOffset: 3,

  // Final visual gap during the catch. The truck stops just behind the
  // runner, so it never intersects the runner's body.
  catchGap: 3.4,
  catchFollowRate: 5,

  // Small body bounce while moving, in units.
  bounceHeight: 0.03,
  bounceRate: 14,

  wheelRadius: 0.42,

  // Overall size of the model.
  scale: 0.6,

  // Gameplay gap (0 to visualGapRange metres) maps onto this visual range.
  visualGapNear: 5.6,
  visualGapFar: 6.4,
  visualGapRange: 20,

  // Dust trailing the rear wheels while the truck is chasing.
  dustPuffs: 8,
  dustRate: 5,
};

// Maps the gameplay chase distance onto the visual gap behind the runner.
function visualGap(chaseDistance) {
  const t = Math.max(0, Math.min(1, (Number(chaseDistance) || 0) / CHASE_TRUCK_CONFIG.visualGapRange));

  return (
    CHASE_TRUCK_CONFIG.visualGapNear +
    (CHASE_TRUCK_CONFIG.visualGapFar - CHASE_TRUCK_CONFIG.visualGapNear) * t
  );
}

const HEADLIGHT_INTENSITY = {
  WAITING: 0,
  SAFE: 0.8,
  WARNING: 1.6,
  CRITICAL: 2.6,
  CAUGHT: 3.2,
};

const COLOR = {
  cab: 0xb8322a,
  trailer: 0xe9eef3,
  trailerShade: 0xc9d2dc,
  chassis: 0x2a2e33,
  trim: 0x1c1f23,
  chrome: 0xb9c2cb,
  glass: 0x7fb8d8,
  tyre: 0x141414,
  rim: 0x9aa3ad,
  tail: 0xff3b2f,
  amber: 0xffb020,
  flap: 0x101112,
  dust: 0xd9c8a0,
};

/**
 * Builds the truck and adds it to the scene. Call dispose() when the
 * game screen unmounts.
 */
export function createChaseTruck(scene) {
  const group = new THREE.Group();
  group.name = 'ChaseTruck';
  group.visible = false;

  // Shared geometry, one per distinct box size.
  const boxCache = new Map();
  const box = (w, h, d) => {
    const key = `${w}x${h}x${d}`;

    if (!boxCache.has(key)) {
      boxCache.set(key, new THREE.BoxGeometry(w, h, d));
    }

    return boxCache.get(key);
  };

  const wheelGeometry = (() => {
    // Lay the cylinder on its side so its axis is X, then spin about X.
    const geometry = new THREE.CylinderGeometry(
      CHASE_TRUCK_CONFIG.wheelRadius,
      CHASE_TRUCK_CONFIG.wheelRadius,
      0.26,
      18
    );

    geometry.rotateZ(Math.PI / 2);

    return geometry;
  })();

  const rimGeometry = (() => {
    const geometry = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 12);

    geometry.rotateZ(Math.PI / 2);

    return geometry;
  })();

  const tankGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.9, 12);
  const stackGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 10);
  const glassGeometry = new THREE.PlaneGeometry(1, 1);
  const shadowGeometry = new THREE.CircleGeometry(1, 20);
  const dustGeometry = new THREE.CircleGeometry(0.5, 10);

  // Shared materials.
  const materials = {
    cab: new THREE.MeshStandardMaterial({ color: COLOR.cab, roughness: 0.42, metalness: 0.15 }),
    trailer: new THREE.MeshStandardMaterial({ color: COLOR.trailer, roughness: 0.6, metalness: 0.05 }),
    trailerShade: new THREE.MeshStandardMaterial({ color: COLOR.trailerShade, roughness: 0.65 }),
    chassis: new THREE.MeshStandardMaterial({ color: COLOR.chassis, roughness: 0.8 }),
    trim: new THREE.MeshStandardMaterial({ color: COLOR.trim, roughness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: COLOR.chrome, roughness: 0.25, metalness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({
      color: COLOR.glass,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    }),
    tyre: new THREE.MeshStandardMaterial({ color: COLOR.tyre, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: COLOR.rim, roughness: 0.35, metalness: 0.6 }),
    flap: new THREE.MeshStandardMaterial({ color: COLOR.flap, roughness: 0.9 }),
    headlight: new THREE.MeshStandardMaterial({
      color: 0xfff7d6,
      emissive: 0xfff1b0,
      emissiveIntensity: HEADLIGHT_INTENSITY.SAFE,
    }),
    tail: new THREE.MeshStandardMaterial({
      color: COLOR.tail,
      emissive: 0xff2a1a,
      emissiveIntensity: 0.6,
    }),
    amber: new THREE.MeshStandardMaterial({
      color: COLOR.amber,
      emissive: COLOR.amber,
      emissiveIntensity: 0.9,
    }),
    shadow: new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
    dust: new THREE.MeshBasicMaterial({
      color: COLOR.dust,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    }),
  };

  function addBox(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(box(w, h, d), material);

    mesh.position.set(x, y, z);
    group.add(mesh);

    return mesh;
  }

  // A flat glass or plate panel.
  function addPanel(w, h, material, x, y, z, rotX = 0, rotY = 0) {
    const mesh = new THREE.Mesh(glassGeometry, material);

    mesh.scale.set(w, h, 1);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, 0);
    group.add(mesh);

    return mesh;
  }

  // ---- Contact shadow (flat, cheap, under the whole truck) -------------
  const contactShadow = new THREE.Mesh(shadowGeometry, materials.shadow);

  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(1.5, 2.9, 1);
  contactShadow.position.set(0, 0.012, 0.2);
  group.add(contactShadow);

  // ---- Chassis, underbody and fuel tanks -------------------------------
  addBox(1.3, 0.14, 4.6, materials.chassis, 0, 0.42, 0.3);
  addBox(1.2, 0.08, 4.2, materials.trim, 0, 0.3, 0.3);

  for (const side of [-1, 1]) {
    const tank = new THREE.Mesh(tankGeometry, materials.chassis);

    tank.rotation.z = Math.PI / 2;
    tank.position.set(side * 0.7, 0.42, -0.4);
    group.add(tank);
  }

  // ---- Cab ------------------------------------------------------------
  addBox(1.44, 0.82, 1.3, materials.cab, 0, 0.9, -1.85);

  const bonnet = addBox(1.38, 0.3, 0.95, materials.cab, 0, 0.92, -2.6);

  bonnet.rotation.x = 0.08;

  addBox(1.4, 0.1, 1.3, materials.cab, 0, 1.36, -1.85);

  // Cab sides stepping in toward the roof.
  addBox(0.06, 0.6, 1.1, materials.cab, -0.74, 1.12, -1.85);
  addBox(0.06, 0.6, 1.1, materials.cab, 0.74, 1.12, -1.85);

  // Sun visor and roof light bar.
  addBox(1.36, 0.05, 0.25, materials.trim, 0, 1.44, -2.22);
  addBox(0.9, 0.06, 0.1, materials.amber, 0, 1.44, -2.4);

  // Windscreen, raked back, and side windows with frames.
  addPanel(1.26, 0.56, materials.glass, 0, 1.13, -2.5, -0.5);
  addPanel(0.9, 0.44, materials.glass, -0.755, 1.14, -1.9, 0, -Math.PI / 2);
  addPanel(0.9, 0.44, materials.glass, 0.755, 1.14, -1.9, 0, Math.PI / 2);
  addBox(0.08, 0.6, 0.08, materials.trim, -0.66, 1.12, -2.45);
  addBox(0.08, 0.6, 0.08, materials.trim, 0.66, 1.12, -2.45);

  // Door seams and handles.
  addBox(0.02, 0.8, 0.02, materials.trim, -0.735, 0.9, -1.5);
  addBox(0.02, 0.8, 0.02, materials.trim, 0.735, 0.9, -1.5);
  addBox(0.04, 0.06, 0.2, materials.chrome, -0.75, 0.94, -1.7);
  addBox(0.04, 0.06, 0.2, materials.chrome, 0.75, 0.94, -1.7);

  // Side mirrors on stalks.
  for (const side of [-1, 1]) {
    addBox(0.14, 0.32, 0.08, materials.trim, side * 0.92, 1.36, -2.3);
    addBox(0.22, 0.04, 0.04, materials.chrome, side * 0.8, 1.36, -2.3);
  }

  // Front: grille with chrome bars, headlights and bumper.
  addBox(1.2, 0.36, 0.06, materials.trim, 0, 0.78, -2.99);
  addBox(1.1, 0.05, 0.08, materials.chrome, 0, 0.98, -3.0);
  addBox(1.1, 0.03, 0.08, materials.chrome, 0, 0.7, -3.0);
  addBox(0.3, 0.16, 0.06, materials.headlight, -0.5, 0.98, -2.98);
  addBox(0.3, 0.16, 0.06, materials.headlight, 0.5, 0.98, -2.98);
  addBox(1.56, 0.2, 0.2, materials.chassis, 0, 0.48, -3.05);

  // Exhaust stack on the passenger side, with a warm tip.
  const stack = new THREE.Mesh(stackGeometry, materials.chrome);

  stack.position.set(0.7, 1.4, -1.0);
  group.add(stack);

  addBox(0.12, 0.05, 0.12, materials.amber, 0.7, 1.96, -1.0);

  // Steps under each door.
  addBox(0.18, 0.05, 0.5, materials.chassis, -0.8, 0.5, -1.9);
  addBox(0.18, 0.05, 0.5, materials.chassis, 0.8, 0.5, -1.9);

  // ---- Box trailer ----------------------------------------------------
  addBox(1.5, 1.85, 3.2, materials.trailer, 0, 1.45, 1.0);

  for (const z of [-0.2, 0.6, 1.4, 2.2]) {
    addBox(0.04, 1.7, 0.08, materials.trailerShade, -0.77, 1.45, z);
    addBox(0.04, 1.7, 0.08, materials.trailerShade, 0.77, 1.45, z);
  }

  addBox(1.56, 0.12, 3.2, materials.chassis, 0, 0.5, 1.0);

  // Rear doors with a seam, handles and a rubber seal.
  addBox(0.72, 1.7, 0.06, materials.trailerShade, -0.37, 1.45, 2.63);
  addBox(0.72, 1.7, 0.06, materials.trailerShade, 0.37, 1.45, 2.63);
  addBox(0.04, 1.7, 0.08, materials.chassis, 0, 1.45, 2.66);
  addBox(0.06, 0.2, 0.06, materials.chrome, -0.06, 1.2, 2.7);
  addBox(0.06, 0.2, 0.06, materials.chrome, 0.06, 1.2, 2.7);
  addBox(1.4, 0.06, 0.04, materials.trim, 0, 0.6, 2.68);

  // Tail lights and small red reflectors on the doors.
  addBox(0.18, 0.4, 0.06, materials.tail, -0.66, 1.55, 2.68);
  addBox(0.18, 0.4, 0.06, materials.tail, 0.66, 1.55, 2.68);
  addBox(0.08, 0.08, 0.04, materials.tail, -0.66, 0.9, 2.68);
  addBox(0.08, 0.08, 0.04, materials.tail, 0.66, 0.9, 2.68);

  // Rear bumper, mud flaps and registration plate.
  addBox(1.6, 0.2, 0.2, materials.chassis, 0, 0.45, 2.72);
  addBox(0.44, 0.34, 0.03, materials.flap, -0.7, 0.24, 2.78);
  addBox(0.44, 0.34, 0.03, materials.flap, 0.7, 0.24, 2.78);
  addBox(0.46, 0.14, 0.02, materials.chrome, 0, 0.72, 2.74);

  // ---- Wheels and arches ----------------------------------------------
  // Front axle under the cab. Tandem rear axles under the trailer.
  const wheelAxles = [
    { z: -2.0, x: 0.7 },
    { z: 1.8, x: 0.7 },
    { z: 2.5, x: 0.7 },
  ];

  const wheels = [];

  for (const axle of wheelAxles) {
    // Wheel arch: a dark lip above each tyre.
    for (const side of [-1, 1]) {
      addBox(0.5, 0.08, 0.7, materials.trim, side * 0.82, 0.78, axle.z);
    }

    for (const side of [-1, 1]) {
      const x = side * axle.x;
      const y = CHASE_TRUCK_CONFIG.wheelRadius;

      const tyre = new THREE.Mesh(wheelGeometry, materials.tyre);

      tyre.position.set(x, y, axle.z);
      group.add(tyre);
      wheels.push(tyre);

      const rim = new THREE.Mesh(rimGeometry, materials.rim);

      rim.position.set(x + side * 0.02, y, axle.z);
      group.add(rim);
      wheels.push(rim);
    }
  }

  // ---- Dust puffs behind the rear wheels --------------------------------
  // Pooled flat discs. They rise, grow and fade while the truck is chasing.
  const dustPuffs = [];

  for (let i = 0; i < CHASE_TRUCK_CONFIG.dustPuffs; i++) {
    const puff = new THREE.Mesh(dustGeometry, materials.dust);

    puff.visible = false;
    puff.userData.life = 1;
    puff.userData.offset = (i / CHASE_TRUCK_CONFIG.dustPuffs) * Math.PI * 2;
    group.add(puff);
    dustPuffs.push(puff);
  }

  group.scale.setScalar(CHASE_TRUCK_CONFIG.scale);
  scene.add(group);

  let laneX = 0;
  let shownDistance = null;
  let bounceTime = 0;
  let dustClock = 0;
  let dustNext = 0;
  let impactTimer = 0;

  return {
    group,

    /**
     * Places and animates the truck. Call once per frame from the game
     * loop. Pass visible: false while the chase has not started or the
     * mode is off.
     *
     * @param {{
     *   visible: boolean,
     *   playerX: number,
     *   playerZ: number,
     *   chaseDistance: number,
     *   speed: number,
     *   delta: number,
     *   state: string,
     * }} input
     */
    update(input) {
      const { visible, playerX, playerZ, chaseDistance, speed, delta, state } = input;

      group.visible = visible;

      if (!visible) {
        shownDistance = null;
        impactTimer = 0;

        for (const puff of dustPuffs) puff.visible = false;

        return;
      }

      const dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));

      // Follow the player's lane smoothly. Frame-rate independent.
      const alpha = 1 - Math.exp(-CHASE_TRUCK_CONFIG.laneFollowRate * dt);

      laneX += (playerX - laneX) * alpha;

      bounceTime += dt * CHASE_TRUCK_CONFIG.bounceRate;

      const catching = state === 'CAUGHT';
      const targetDistance = catching
        ? CHASE_TRUCK_CONFIG.catchGap
        : visualGap(chaseDistance);
      const followRate = catching
        ? CHASE_TRUCK_CONFIG.catchFollowRate
        : CHASE_TRUCK_CONFIG.distanceFollowRate;

      if (shownDistance === null) {
        shownDistance = targetDistance + CHASE_TRUCK_CONFIG.approachOffset;
      }

      shownDistance +=
        (targetDistance - shownDistance) * (1 - Math.exp(-followRate * dt));

      // Impact jolt: a short forward shove that rings out and settles.
      let jolt = 0;

      if (impactTimer > 0) {
        impactTimer = Math.max(0, impactTimer - dt);
        jolt = 0.3 * Math.sin(impactTimer * 40) * (impactTimer / 0.4);
      }

      group.position.set(
        laneX,
        Math.abs(Math.sin(bounceTime)) * CHASE_TRUCK_CONFIG.bounceHeight,
        playerZ + shownDistance - jolt
      );

      // Wheels turn with the road speed.
      const spin = (speed * dt) / CHASE_TRUCK_CONFIG.wheelRadius;

      for (const wheel of wheels) {
        wheel.rotation.x += spin;
      }

      // Headlights and tail lights brighten as the truck closes in.
      const intensity = HEADLIGHT_INTENSITY[state] ?? HEADLIGHT_INTENSITY.SAFE;

      materials.headlight.emissiveIntensity = intensity;
      materials.tail.emissiveIntensity = intensity * 0.5 + 0.3;

      // Dust: puffs are spawned at the rear wheels, and each one rises,
      // grows and fades. Only while moving and not in the caught pose.
      dustClock += dt;

      const dusting = speed > 0 && !catching && state !== 'WAITING';

      if (dusting && dustClock >= dustNext) {
        dustNext = dustClock + 1 / CHASE_TRUCK_CONFIG.dustRate;

        const puff = dustPuffs.find((p) => !p.visible);

        if (puff) {
          puff.visible = true;
          puff.userData.life = 0;
          puff.userData.side = Math.random() < 0.5 ? -0.8 : 0.8;
        }
      }

      for (const puff of dustPuffs) {
        if (!puff.visible) continue;

        puff.userData.life += dt * 1.6;

        const life = puff.userData.life;

        if (life >= 1) {
          puff.visible = false;
          continue;
        }

        puff.position.set(puff.userData.side, 0.1 + life * 0.5, 2.9 + life * 1.2);
        puff.scale.setScalar(0.4 + life * 1.4);
        materials.dust.opacity = 0.35 * (1 - life);
      }
    },

    /** Called at the moment of impact: jolt the truck and throw dust. */
    impact() {
      impactTimer = 0.4;

      for (const puff of dustPuffs) {
        puff.visible = true;
        puff.userData.life = Math.random() * 0.3;
        puff.userData.side = (Math.random() * 2 - 1) * 1.2;
      }
    },

    dispose() {
      scene.remove(group);

      for (const geometry of boxCache.values()) geometry.dispose();
      wheelGeometry.dispose();
      rimGeometry.dispose();
      tankGeometry.dispose();
      stackGeometry.dispose();
      glassGeometry.dispose();
      shadowGeometry.dispose();
      dustGeometry.dispose();

      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
