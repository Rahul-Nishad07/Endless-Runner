
import * as THREE from "three";

// ============================================
// CONFIGURATION
// ============================================

import { LANE_X } from "../game/GameConfig";

const LANES = LANE_X;
const POWER_UP_COUNT = 6;
const DEFAULT_POWER_UP_SPEED = 25;

const RECYCLE_Z = 10;
const INITIAL_SPAWN_Z = -65;
const INITIAL_SPAWN_SPACING = 31;

// Spawn spacing and balancing
const MIN_SPAWN_GAP = 27;
const RANDOM_SPAWN_GAP = 8;
const SAME_LANE_PENALTY_DISTANCE = 40;

const COLLECTION_DISTANCE_X = 0.85;
const COLLECTION_DISTANCE_Y = 1.3;
const COLLECTION_DISTANCE_Z = 1.0;

const MAX_DELTA = 0.05;

const BURST_PARTICLE_COUNT = 18;
const BURST_LIFETIME = 0.62;
const RING_LIFETIME = 0.48;
const REWARD_LIFETIME = 0.65;

// ============================================
// POWER-UP TYPES
// ============================================

const POWER_UP_TYPES = [
  {
    type: "magnet",
    color: 0x39a9ff,
    emissive: 0x087bff,
    label: "MAGNET",
  },
  {
    type: "shield",
    color: 0x45fff0,
    emissive: 0x00bbaa,
    label: "SHIELD",
  },
  {
    type: "multiplier",
    color: 0xffc928,
    emissive: 0xff8c00,
    label: "2X SCORE",
  },
  {
    type: "speed",
    color: 0x3df5ff,
    emissive: 0x0096ff,
    label: "SPEED BOOST",
  },
  {
    type: "fly",
    color: 0x7fe9ff,
    emissive: 0x00b3ff,
    label: "SKY FLYER",
  },
];

// ============================================
// RANDOM HELPERS
// ============================================

const randomBetween = (min, max) =>
  min + Math.random() * (max - min);

const randomLane = () =>
  LANES[Math.floor(Math.random() * LANES.length)];

const shuffle = (array) => {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
};

// ============================================
// BALANCED POWER-UP TYPE QUEUE
// ============================================

function createTypeQueue() {
  // Each cycle contains two of each power-up.
  // Shuffling preserves variety without making
  // one type dominate the entire run.
  // The Sky Flyer appears once per cycle, the other power-ups twice.
  const common = POWER_UP_TYPES.filter((type) => type.type !== "fly");
  const rare = POWER_UP_TYPES.filter((type) => type.type === "fly");

  return shuffle([...common, ...common, ...rare]);
}

function getNextPowerUpType(group) {
  if (
    !group.userData.typeQueue ||
    group.userData.typeQueueIndex >=
      group.userData.typeQueue.length
  ) {
    group.userData.typeQueue = createTypeQueue();
    group.userData.typeQueueIndex = 0;
  }

  const typeInfo =
    group.userData.typeQueue[
      group.userData.typeQueueIndex
    ];

  group.userData.typeQueueIndex += 1;

  return typeInfo;
}

// ============================================
// RESOURCE HELPERS
// ============================================

function disposeObject(object) {
  if (!object) return;

  const geometries = new Set();
  const materials = new Set();

  object.traverse((child) => {
    if (child.geometry) {
      geometries.add(child.geometry);
    }

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => {
          if (material) materials.add(material);
        });
      } else {
        materials.add(child.material);
      }
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function makeBasicMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ============================================
// GLOW
// ============================================

function makeGlow(color, size, opacity) {
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(size, 32),
    makeBasicMaterial(color, opacity)
  );

  glow.rotation.x = -Math.PI / 2;

  return glow;
}

// ============================================
// ORBITING PARTICLES
// ============================================

function makeOrbitParticles(root, color) {
  const particles = [];

  for (let i = 0; i < 8; i++) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 8),
      makeBasicMaterial(color, 0.95)
    );

    particle.userData.orbit =
      (i * Math.PI * 2) / 8;

    particle.userData.radius =
      0.56 + Math.random() * 0.13;

    particle.userData.height =
      0.12 + Math.random() * 0.16;

    root.add(particle);
    particles.push(particle);
  }

  return particles;
}

// ============================================
// LIGHTNING BOLT (speed booster core)
//
// Built once and shared by every speed booster. Disposing one booster
// does not break the others: three.js re-uploads shared geometry on use.
// ============================================

let boltGeometry = null;

function getBoltGeometry() {
  if (!boltGeometry) {
    const shape = new THREE.Shape();

    shape.moveTo(0.04, 0.2);
    shape.lineTo(-0.12, 0.02);
    shape.lineTo(-0.01, 0.02);
    shape.lineTo(-0.06, -0.2);
    shape.lineTo(0.12, 0.0);
    shape.lineTo(0.01, 0.0);
    shape.closePath();

    boltGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.04,
      bevelEnabled: false,
    });

    boltGeometry.center();
  }

  return boltGeometry;
}

// ============================================
// CREATE ONE POWER-UP
// ============================================

// Sky Flyer icon: a pair of glowing wings. Built once and shared.
let wingsCache = null;

function makeWings() {
  if (!wingsCache) {
    const shape = new THREE.Shape();

    shape.moveTo(0, 0.02);
    shape.lineTo(-0.18, 0.2);
    shape.lineTo(-0.42, 0.26);
    shape.lineTo(-0.56, 0.12);
    shape.lineTo(-0.36, -0.02);
    shape.lineTo(-0.12, -0.1);
    shape.lineTo(0, -0.06);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.04,
      bevelEnabled: false,
    });

    geometry.center();

    wingsCache = {
      geometry,
      material: new THREE.MeshStandardMaterial({
        color: 0xbff4ff,
        emissive: 0x00b3ff,
        emissiveIntensity: 1.4,
        roughness: 0.3,
        side: THREE.DoubleSide,
      }),
    };
  }

  const wings = new THREE.Group();

  wings.name = "SkyFlyerWings";

  const left = new THREE.Mesh(wingsCache.geometry, wingsCache.material);
  const right = new THREE.Mesh(wingsCache.geometry, wingsCache.material);

  left.position.x = 0.02;
  right.position.x = -0.02;
  right.scale.x = -1;

  wings.add(left, right);
  wings.scale.setScalar(0.8);

  return wings;
}

function makePowerUp(typeInfo) {
  const root = new THREE.Group();

  root.name = `PowerUp_${typeInfo.type}`;

  root.userData.type = typeInfo.type;
  root.userData.collected = false;
  root.userData.phase = Math.random() * Math.PI * 2;
  root.userData.typeInfo = typeInfo;

  // Energy core
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshStandardMaterial({
      color: typeInfo.color,
      emissive: typeInfo.emissive,
      emissiveIntensity: 1.8,
      metalness: 0.35,
      roughness: 0.2,
    })
  );

  root.add(core);

  // Inner crystal. Speed boosters show a lightning bolt instead.
  const innerCore =
    typeInfo.type === "fly"
      ? makeWings()
      : new THREE.Mesh(
          typeInfo.type === "speed"
            ? getBoltGeometry()
            : new THREE.OctahedronGeometry(0.17, 0),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
          })
        );

  root.add(innerCore);

  // Main ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.49, 0.055, 10, 36),
    new THREE.MeshStandardMaterial({
      color: typeInfo.color,
      emissive: typeInfo.emissive,
      emissiveIntensity: 2.2,
      metalness: 0.5,
      roughness: 0.22,
    })
  );

  ring.rotation.x = Math.PI / 2.5;
  root.add(ring);

  // Secondary ring
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.025, 8, 32),
    ring.material.clone()
  );

  ring2.rotation.x = -Math.PI / 3;
  ring2.rotation.y = Math.PI / 4;

  root.add(ring2);

  // Halo
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.59, 0.018, 6, 40),
    makeBasicMaterial(typeInfo.color, 0.55)
  );

  halo.rotation.x = Math.PI / 2.8;
  halo.rotation.y = Math.PI / 5;

  root.add(halo);

  // Ground glow
  const glow = makeGlow(typeInfo.color, 0.75, 0.3);
  glow.position.y = -0.48;

  root.add(glow);

  // Soft aura
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 16, 16),
    new THREE.MeshBasicMaterial({
      color: typeInfo.color,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  root.add(aura);

  // Orbiting particles
  const particles = makeOrbitParticles(
    root,
    typeInfo.color
  );

  root.userData.core = core;
  root.userData.innerCore = innerCore;
  root.userData.ring = ring;
  root.userData.ring2 = ring2;
  root.userData.halo = halo;
  root.userData.glow = glow;
  root.userData.aura = aura;
  root.userData.particles = particles;

  return root;
}

// ============================================
// SMART LANE SELECTION
// ============================================

function chooseSpawnLane(items, spawnZ, group) {
  const lastLane = group.userData.lastSpawnLane;

  // Prefer lanes that do not contain another
  // nearby power-up at a similar depth.
  const laneScores = LANES.map((lane) => {
    let score = Math.random() * 2;

    for (const item of items) {
      if (!item || item.userData.collected) continue;

      const zGap = Math.abs(item.position.z - spawnZ);

      if (zGap > SAME_LANE_PENALTY_DISTANCE) {
        continue;
      }

      if (Math.abs(item.position.x - lane) < 0.1) {
        score -= 5;
      }

      // Avoid repeating the previous spawn lane
      // when another lane is available nearby.
      if (
        lane === lastLane &&
        zGap < SAME_LANE_PENALTY_DISTANCE
      ) {
        score -= 3;
      }
    }

    return { lane, score };
  });

  laneScores.sort((a, b) => b.score - a.score);

  // Randomly choose between the best candidates
  // to avoid predictable placement.
  const bestScore = laneScores[0].score;

  const candidates = laneScores.filter(
    (entry) => entry.score >= bestScore - 1.5
  );

  const selected =
    candidates[Math.floor(Math.random() * candidates.length)];

  group.userData.lastSpawnLane = selected.lane;

  return selected.lane;
}

// ============================================
// FIND FARTHEST POWER-UP
// ============================================

function getFarthestPowerUpZ(items, excludedItem = null) {
  let farthestZ = INITIAL_SPAWN_Z;

  for (const item of items) {
    if (!item || item === excludedItem) continue;

    farthestZ = Math.min(
      farthestZ,
      item.position.z
    );
  }

  return farthestZ;
}

// ============================================
// SPAWN POSITION
// ============================================

function getNextSpawnPosition(group, items, excludedItem) {
  const farthestZ = getFarthestPowerUpZ(
    items,
    excludedItem
  );

  const gap =
    MIN_SPAWN_GAP +
    Math.random() * RANDOM_SPAWN_GAP;

  const spawnZ =
    Math.min(farthestZ, INITIAL_SPAWN_Z) - gap;

  const lane = chooseSpawnLane(
    items.filter((item) => item !== excludedItem),
    spawnZ,
    group
  );

  return { x: lane, z: spawnZ };
}

// ============================================
// RECYCLE / REPLACE POWER-UP
// ============================================

function recyclePowerUp(group, items, index, oldItem) {
  const position = getNextSpawnPosition(
    group,
    items,
    oldItem
  );

  const typeInfo = getNextPowerUpType(group);
  const replacement = makePowerUp(typeInfo);

  replacement.position.set(
    position.x,
    1.15,
    position.z
  );

  group.add(replacement);

  // Preserve the existing array and update interface.
  items[index] = replacement;

  group.remove(oldItem);
  disposeObject(oldItem);
}

// ============================================
// COLLECTION BURST
// ============================================

function createCollectionBurst(group, position, color) {
  const burst = new THREE.Group();

  burst.name = "PowerUpCollectionBurst";
  burst.position.copy(position);

  const particles = [];

  for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
    const geometry =
      i % 3 === 0
        ? new THREE.OctahedronGeometry(0.065, 0)
        : new THREE.SphereGeometry(0.045, 7, 7);

    const particle = new THREE.Mesh(
      geometry,
      makeBasicMaterial(
        i % 4 === 0 ? 0xffffff : color,
        1
      )
    );

    const angle =
      (i / BURST_PARTICLE_COUNT) * Math.PI * 2;

    const speed = randomBetween(1.4, 3.2);

    particle.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * speed,
      randomBetween(0.8, 2.8),
      Math.sin(angle) * speed
    );

    particle.userData.spin = randomBetween(-4, 4);

    particles.push(particle);
    burst.add(particle);
  }

  burst.userData.particles = particles;
  burst.userData.age = 0;
  burst.userData.life = BURST_LIFETIME;

  group.add(burst);
  group.userData.effects.push(burst);
}

// ============================================
// EXPANDING COLLECTION RINGS
// ============================================

function createCollectionRings(group, position, color) {
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        i === 0 ? 0.22 : 0.3,
        i === 0 ? 0.035 : 0.02,
        8,
        32
      ),
      makeBasicMaterial(
        i === 0 ? 0xffffff : color,
        0.95
      )
    );

    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;

    ring.userData.initialScale =
      i === 0 ? 0.65 : 0.45;

    ring.scale.setScalar(ring.userData.initialScale);

    ring.userData.age = 0;
    ring.userData.life = RING_LIFETIME;
    ring.userData.isCollectionRing = true;

    group.add(ring);
    group.userData.effects.push(ring);
  }
}

// ============================================
// FLOATING REWARD MARKER
// ============================================

function createRewardMarker(group, position, color, label) {
  const reward = new THREE.Group();

  reward.name = `Reward_${label}`;

  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12, 0),
    makeBasicMaterial(color, 1)
  );

  const sparkle = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.065, 0),
    makeBasicMaterial(0xffffff, 0.95)
  );

  sparkle.position.set(0.16, 0.12, 0);

  const smallSparkle = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.04, 0),
    makeBasicMaterial(color, 1)
  );

  smallSparkle.position.set(-0.14, 0.08, 0);

  reward.add(diamond, sparkle, smallSparkle);

  reward.position.copy(position);
  reward.position.y += 0.35;
  reward.scale.setScalar(0.65);

  reward.userData.age = 0;
  reward.userData.life = REWARD_LIFETIME;
  reward.userData.isReward = true;

  group.add(reward);
  group.userData.effects.push(reward);
}

// ============================================
// PLAY COLLECTION EFFECT
// ============================================

function playCollectionEffect(group, position, typeInfo) {
  if (!group || !position || !typeInfo) return;

  createCollectionBurst(group, position, typeInfo.color);
  createCollectionRings(group, position, typeInfo.color);

  createRewardMarker(
    group,
    position,
    typeInfo.color,
    typeInfo.label
  );
}

// ============================================
// UPDATE COLLECTION EFFECTS
// ============================================

function updateEffects(group, delta) {
  const effects = group?.userData?.effects;

  if (!effects) return;

  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];

    effect.userData.age += delta;

    const progress = THREE.MathUtils.clamp(
      effect.userData.age / effect.userData.life,
      0,
      1
    );

    const remaining = 1 - progress;

    // Particle burst
    if (effect.userData.particles) {
      for (const particle of effect.userData.particles) {
        const velocity = particle.userData.velocity;

        velocity.y -= 4.5 * delta;
        particle.position.addScaledVector(velocity, delta);

        particle.rotation.x +=
          particle.userData.spin * delta;

        particle.rotation.y +=
          particle.userData.spin * delta * 0.7;

        particle.scale.setScalar(
          Math.max(0.025, 1 - progress * 0.8)
        );

        particle.material.opacity = remaining;
      }
    }

    // Expanding rings
    if (effect.userData.isCollectionRing) {
      effect.scale.setScalar(
        effect.userData.initialScale + progress * 3
      );

      effect.material.opacity = remaining;
      effect.rotation.z += delta * 1.4;
    }

    // Floating reward
    if (effect.userData.isReward) {
      effect.position.y += delta * 0.75;

      effect.scale.setScalar(0.65 + progress * 0.3);
      effect.rotation.y += delta * 1.2;

      effect.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = remaining;
        }
      });
    }

    // Remove expired effects
    if (effect.userData.age >= effect.userData.life) {
      group.remove(effect);
      disposeObject(effect);
      effects.splice(i, 1);
    }
  }
}

// ============================================
// ANIMATE POWER-UP
// ============================================

function animatePowerUp(item, time, delta) {
  const data = item.userData;
  const phase = data.phase;

  // Floating
  item.position.y =
    1.15 + Math.sin(time * 3 + phase) * 0.13;

  // Main crystal
  data.core.rotation.x += delta * 1.1;
  data.core.rotation.y += delta * 1.8;

  // Inner crystal
  data.innerCore.rotation.x -= delta * 1.4;
  data.innerCore.rotation.y += delta * 2.2;

  // Rings
  data.ring.rotation.z += delta * 1.6;
  data.ring2.rotation.y += delta * 1.2;

  data.halo.rotation.z -= delta * 0.8;

  data.halo.rotation.x =
    Math.PI / 2.8 +
    Math.sin(time * 1.7 + phase) * 0.12;

  // Ground glow
  data.glow.scale.setScalar(
    1 + Math.sin(time * 5 + phase) * 0.1
  );

  // Aura
  data.aura.scale.setScalar(
    1 + Math.sin(time * 4 + phase) * 0.09
  );

  // Orbiting particles
  data.particles.forEach((particle) => {
    const angle =
      particle.userData.orbit + time * 1.8;

    const radius = particle.userData.radius;

    particle.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle * 1.5) *
        particle.userData.height,
      Math.sin(angle) * radius
    );
  });
}

// ============================================
// CREATE POWER-UPS
// ============================================

export function createPowerUps(scene) {
  const group = new THREE.Group();

  group.name = "PowerUpCollectibles";

  group.userData.items = [];
  group.userData.effects = [];
  group.userData.elapsed = 0;

  group.userData.typeQueue = createTypeQueue();
  group.userData.typeQueueIndex = 0;
  group.userData.lastSpawnLane = null;

  // Distribute all three types across the initial pool.
  const initialTypes = shuffle([
    ...POWER_UP_TYPES,
    ...POWER_UP_TYPES,
  ]);

  for (let i = 0; i < POWER_UP_COUNT; i++) {
    const item = makePowerUp(initialTypes[i]);

    const z =
      INITIAL_SPAWN_Z - i * INITIAL_SPAWN_SPACING;

    const lane = chooseSpawnLane(
      group.userData.items,
      z,
      group
    );

    item.position.set(lane, 1.15, z);

    group.userData.items.push(item);
    group.add(item);
  }

  if (scene) {
    scene.add(group);
  }

  console.log(
    "[POWER-UPS] CREATED:",
    group.userData.items.length
  );

  return group;
}

// ============================================
// WORLD POSITION
// ============================================

// Reusable output vector for the per-item lookup. The player's position
// is held across the item loop, so it keeps its own allocation.
const scratchItemWorld = new THREE.Vector3();

function getWorldPosition(object, target = new THREE.Vector3()) {
  if (!object) return null;

  object.updateWorldMatrix(true, false);

  return object.getWorldPosition(target);
}

// ============================================
// UPDATE POWER-UPS
// ============================================

/**
 * Moves and animates power-ups, checks collection,
 * plays effects and recycles collected/passed objects.
 *
 * Existing API is preserved:
 * updatePowerUps(group, delta, speed, player, onCollect)
 */
/**
 * @param {THREE.Group} group
 * @param {number} delta
 * @param {number} speed
 * @param {THREE.Object3D | { group: THREE.Object3D } | null} player
 * @param {(type: string) => void} onCollect
 */
export function updatePowerUps(
  group,
  delta,
  speed = DEFAULT_POWER_UP_SPEED,
  player = null,
 onCollect = (type) => {}
) {
  if (!group?.userData?.items || delta <= 0) {
    return;
  }

  const safeDelta = Math.min(delta, MAX_DELTA);

  const movementSpeed = Number.isFinite(speed)
    ? Math.max(0, speed)
    : DEFAULT_POWER_UP_SPEED;

  group.userData.elapsed += safeDelta;

  const time = group.userData.elapsed;
  const items = group.userData.items;

  updateEffects(group, safeDelta);

  // Accept either a player controller or a Three.js object.
  const playerObject = player
    ? player.group || player
    : null;

  const playerPosition = playerObject
    ? getWorldPosition(playerObject)
    : null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item || item.userData.collected) {
      continue;
    }

    // Move towards the player.
    const previousZ = item.position.z;

    item.position.z += movementSpeed * safeDelta;

    // Animate visual effects.
    animatePowerUp(item, time, safeDelta);

    // Collection detection
    if (playerPosition) {
      const itemPosition = getWorldPosition(item, scratchItemWorld);

      if (itemPosition) {
        const dx = Math.abs(
          itemPosition.x - playerPosition.x
        );

        const dy = Math.abs(
          itemPosition.y - playerPosition.y
        );

        const dz = Math.abs(
          itemPosition.z - playerPosition.z
        );

        // Account for movement between frames so
        // fast-moving power-ups are less likely to
        // pass through the collection zone.
        const movementPadding = Math.min(
          movementSpeed * safeDelta * 0.65,
          0.6
        );

        const zLimit =
          COLLECTION_DISTANCE_Z + movementPadding;

        if (
          dx < COLLECTION_DISTANCE_X &&
          dy < COLLECTION_DISTANCE_Y &&
          dz < zLimit
        ) {
          const collectedType = item.userData.type;
          const collectedInfo = item.userData.typeInfo;

          const effectPosition = group.worldToLocal(
            itemPosition.clone()
          );

          item.userData.collected = true;

          playCollectionEffect(
            group,
            effectPosition,
            collectedInfo
          );

          try {
            onCollect(collectedType);
          } catch (error) {
            console.warn(
              "[POWER-UPS] Collection callback failed:",
              error
            );
          }

          recyclePowerUp(group, items, i, item);
          continue;
        }
      }
    }

    // Recycle power-ups that passed the player.
    if (
      item.position.z > RECYCLE_Z &&
      item.position.z >= previousZ
    ) {
      recyclePowerUp(group, items, i, item);
    }
  }
}
