
import * as THREE from "three";

import { LANE_X } from "../game/GameConfig";

const LANES = LANE_X;

const COIN_COUNT = 30;
const COIN_SPACING = 5;

const INITIAL_FARTHEST_Z =
  -35 - (COIN_COUNT - 1) * COIN_SPACING;

const COIN_COLLISION_X = 0.85;
const COIN_COLLISION_Y = 1.45;
const COIN_COLLISION_Z = 1.0;

const DEFAULT_COIN_SPEED = 25;
const MAGNET_RANGE = 8;
const MAGNET_STRENGTH = 5;

// Collection effect settings
const MAX_PARTICLES_PER_BURST = 10;
const PARTICLE_LIFETIME = 0.48;
const RING_LIFETIME = 0.42;
const REWARD_LIFETIME = 0.55;

// ============================================
// RANDOM LANE
// ============================================

function randomLane() {
  return LANES[Math.floor(Math.random() * LANES.length)];
}

// ============================================
// CREATE SINGLE COIN
// ============================================

function createCoin() {
  const coin = new THREE.Group();
  coin.name = "RunnerCoin";

  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc928,
    emissive: 0xffa000,
    emissiveIntensity: 1.1,
    metalness: 0.75,
    roughness: 0.22,
  });

  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffed91,
    emissive: 0xffc928,
    emissiveIntensity: 0.7,
    metalness: 0.85,
    roughness: 0.2,
  });

  // Coin body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.075, 24),
    goldMaterial
  );

  body.rotation.x = Math.PI / 2;
  coin.add(body);

  // Outer rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.205, 0.035, 8, 24),
    edgeMaterial
  );

  rim.position.z = 0.045;
  coin.add(rim);

  // Center decoration
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 12, 12),
    edgeMaterial
  );

  center.position.z = 0.052;
  coin.add(center);

  // Ground glow
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffc928,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.4;
  coin.add(glow);

  coin.userData.body = body;
  coin.userData.rim = rim;
  coin.userData.glow = glow;
  coin.userData.phase = Math.random() * Math.PI * 2;

  return coin;
}

// ============================================
// CREATE COLLECTION EFFECT CONTAINER
// ============================================

function createEffectsGroup() {
  const group = new THREE.Group();

  group.name = "CoinCollectionEffects";
  group.userData.effects = [];

  return group;
}

// ============================================
// CREATE GOLDEN PARTICLE BURST
// ============================================

function createParticleBurst(effectsGroup, position) {
  if (!effectsGroup || !position) return;

  const particleColors = [
    0xffc928,
    0xffed91,
    0xffffff,
    0xffa000,
  ];

  for (let i = 0; i < MAX_PARTICLES_PER_BURST; i++) {
    const color =
      particleColors[
        Math.floor(Math.random() * particleColors.length)
      ];

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });

    // Mix spheres and diamond-like particles.
    const geometry =
      i % 2 === 0
        ? new THREE.OctahedronGeometry(0.075, 0)
        : new THREE.SphereGeometry(0.045, 8, 8);

    const particle = new THREE.Mesh(geometry, material);

    particle.position.copy(position);

    particle.position.x += (Math.random() - 0.5) * 0.12;
    particle.position.y += (Math.random() - 0.5) * 0.12;
    particle.position.z += (Math.random() - 0.5) * 0.12;

    const direction = new THREE.Vector3(
      (Math.random() - 0.5) * 2.4,
      0.7 + Math.random() * 2.2,
      (Math.random() - 0.5) * 1.4
    );

    particle.userData.velocity = direction;
    particle.userData.life = PARTICLE_LIFETIME;
    particle.userData.maxLife = PARTICLE_LIFETIME;
    particle.userData.spin =
      (Math.random() - 0.5) * 9;

    effectsGroup.add(particle);

    effectsGroup.userData.effects.push({
      object: particle,
      type: "particle",
      life: PARTICLE_LIFETIME,
      maxLife: PARTICLE_LIFETIME,
    });
  }
}

// ============================================
// CREATE EXPANDING GOLDEN RING
// ============================================

function createCollectionRing(effectsGroup, position) {
  if (!effectsGroup || !position) return;

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd54a,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.025, 8, 32),
    ringMaterial
  );

  ring.position.copy(position);

  // Orient the ring horizontally.
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(0.65);

  effectsGroup.add(ring);

  effectsGroup.userData.effects.push({
    object: ring,
    type: "ring",
    life: RING_LIFETIME,
    maxLife: RING_LIFETIME,
  });
}

// ============================================
// CREATE FLOATING +1 REWARD MARKER
// ============================================

function createRewardMarker(effectsGroup, position) {
  if (!effectsGroup || !position) return;

  const reward = new THREE.Group();
  reward.name = "CoinRewardMarker";

  const material = new THREE.MeshBasicMaterial({
    color: 0xffdf58,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Plus sign: horizontal and vertical bars.
  const plusHorizontal = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.045, 0.025),
    material.clone()
  );

  const plusVertical = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.2, 0.025),
    material.clone()
  );

  plusHorizontal.position.set(-0.12, 0, 0);
  plusVertical.position.set(-0.12, 0, 0);

  // Stylized "1": stem and small base.
  const oneStem = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.19, 0.025),
    material.clone()
  );

  const oneBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.035, 0.025),
    material.clone()
  );

  const oneTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.035, 0.025),
    material.clone()
  );

  oneStem.position.set(0.09, -0.005, 0);
  oneBase.position.set(0.09, -0.095, 0);
  oneTop.position.set(0.075, 0.08, 0);

  reward.add(
    plusHorizontal,
    plusVertical,
    oneStem,
    oneBase,
    oneTop
  );

  reward.position.copy(position);
  reward.position.y += 0.25;
  reward.scale.setScalar(0.7);

  effectsGroup.add(reward);

  effectsGroup.userData.effects.push({
    object: reward,
    type: "reward",
    life: REWARD_LIFETIME,
    maxLife: REWARD_LIFETIME,
    materials: [
      plusHorizontal.material,
      plusVertical.material,
      oneStem.material,
      oneBase.material,
      oneTop.material,
    ],
  });
}

// ============================================
// PLAY COIN COLLECTION EFFECT
// ============================================

function playCollectionEffect(effectsGroup, position) {
  if (!effectsGroup || !position) return;

  createParticleBurst(effectsGroup, position);
  createCollectionRing(effectsGroup, position);
  createRewardMarker(effectsGroup, position);
}

// ============================================
// UPDATE COLLECTION EFFECTS
// ============================================

function updateCollectionEffects(effectsGroup, delta) {
  if (!effectsGroup || !effectsGroup.userData.effects) {
    return;
  }

  const effects = effectsGroup.userData.effects;

  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    const object = effect.object;

    if (!object) {
      effects.splice(i, 1);
      continue;
    }

    effect.life -= delta;

    const progress = THREE.MathUtils.clamp(
      1 - effect.life / effect.maxLife,
      0,
      1
    );

    const remaining = 1 - progress;

    if (effect.type === "particle") {
      const velocity = object.userData.velocity;

      // Small gravity arc gives particles a satisfying burst.
      velocity.y -= 5.5 * delta;

      object.position.x += velocity.x * delta;
      object.position.y += velocity.y * delta;
      object.position.z += velocity.z * delta;

      object.rotation.x += object.userData.spin * delta;
      object.rotation.y += object.userData.spin * delta;

      const scale = Math.max(0.02, remaining);

      object.scale.setScalar(scale);

      object.material.opacity = remaining;
    }

    if (effect.type === "ring") {
      const ringScale = 0.65 + progress * 3.2;

      object.scale.setScalar(ringScale);
      object.material.opacity = remaining;
    }

    if (effect.type === "reward") {
      // Float upward while fading.
      object.position.y += delta * 0.85;
      object.scale.setScalar(0.7 + progress * 0.25);

      object.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = remaining;
        }
      });
    }

    if (effect.life <= 0) {
      effectsGroup.remove(object);

      // Dispose temporary effect resources.
      if (effect.type === "particle") {
        object.geometry?.dispose();
        object.material?.dispose();
      } else if (effect.type === "ring") {
        object.geometry?.dispose();
        object.material?.dispose();
      } else if (effect.type === "reward") {
        object.traverse((child) => {
          if (!child.isMesh) return;

          child.geometry?.dispose();

          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material?.dispose();
          }
        });
      }

      effects.splice(i, 1);
    }
  }
}

// ============================================
// CREATE COIN COLLECTION
// ============================================

export function createCoins(scene = null) {
  const group = new THREE.Group();

  group.name = "CoinCollection";
  group.userData.coins = [];
  group.userData.elapsed = 0;

  const effectsGroup = createEffectsGroup();

  group.userData.effectsGroup = effectsGroup;
  group.add(effectsGroup);

  for (let i = 0; i < COIN_COUNT; i++) {
    const coin = createCoin();

    coin.position.set(
      randomLane(),
      0.95,
      -35 - i * COIN_SPACING
    );

    group.userData.coins.push(coin);
    group.add(coin);
  }

  if (scene) {
    scene.add(group);
  }

  console.log(
    "[COINS] CREATED:",
    group.userData.coins.length
  );

  return group;
}

// ============================================
// RESET COINS ON RESTART
// ============================================

export function resetCoins(group) {
  if (!group || !group.userData.coins) {
    console.warn("[COINS] Cannot reset: invalid coin group");
    return;
  }

  const coins = group.userData.coins;

  group.userData.elapsed = 0;

  coins.forEach((coin, index) => {
    if (!coin) return;

    coin.position.set(
      randomLane(),
      0.95,
      -35 - index * COIN_SPACING
    );

    coin.rotation.set(0, 0, 0);
    coin.scale.set(1, 1, 1);
    coin.visible = true;

    if (coin.userData.body) {
      coin.userData.body.rotation.set(
        Math.PI / 2,
        0,
        0
      );
    }

    if (coin.userData.rim) {
      coin.userData.rim.rotation.set(0, 0, 0);
    }

    if (coin.userData.glow) {
      coin.userData.glow.scale.set(1, 1, 1);
    }

    coin.userData.phase = Math.random() * Math.PI * 2;
  });

  // Remove any effects left from the previous game.
  const effectsGroup = group.userData.effectsGroup;

  if (effectsGroup?.userData?.effects) {
    const effects = effectsGroup.userData.effects;

    for (const effect of effects) {
      const object = effect.object;

      if (!object) continue;

      effectsGroup.remove(object);

      if (effect.type === "reward") {
        object.traverse((child) => {
          if (!child.isMesh) return;

          child.geometry?.dispose();

          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material?.dispose();
          }
        });
      } else {
        object.geometry?.dispose();

        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material?.dispose();
        }
      }
    }

    effects.length = 0;
  }

  group.updateMatrixWorld(true);

  console.log("[COINS] RESET COMPLETE:", coins.length);
}

// ============================================
// GET WORLD POSITION
// ============================================

// Reusable output vector for the per-coin lookup. The player's position
// is held across the whole coin loop, so it keeps its own allocation.
const scratchCoinWorld = new THREE.Vector3();

function getWorldPosition(object, target = new THREE.Vector3()) {
  if (!object) return null;

  object.updateWorldMatrix(true, false);

  return object.getWorldPosition(target);
}

// ============================================
// GET PLAYER POSITIONS
// ============================================

function getPlayerPositions(player, coinGroup) {
  if (!player || !coinGroup) return null;

  const playerObject = player.group || player;
  const worldPosition = getWorldPosition(playerObject);

  if (!worldPosition) return null;

  coinGroup.updateWorldMatrix(true, false);

  const localPosition = coinGroup.worldToLocal(
    worldPosition.clone()
  );

  return {
    world: worldPosition,
    local: localPosition,
  };
}

// ============================================
// FIND FARTHEST COIN
// ============================================

function getFarthestCoinZ(coins, excludedCoin = null) {
  let farthestZ = INITIAL_FARTHEST_Z;

  for (const coin of coins) {
    if (
      !coin ||
      coin === excludedCoin ||
      !coin.visible
    ) {
      continue;
    }

    farthestZ = Math.min(
      farthestZ,
      coin.position.z
    );
  }

  return farthestZ;
}

// ============================================
// RECYCLE COIN
// ============================================

// When true, some coins are keys (used by levels that need keys).
let keyCoinsEnabled = false;

const KEY_CHANCE = 0.12;

export function setKeyCoinsEnabled(enabled) {
  keyCoinsEnabled = enabled === true;
}

// A key is a larger, cyan coin. Each coin owns its materials, so changing
// one never changes another.
function applyKeyLook(coin, isKey) {
  coin.userData.isKey = isKey;

  const scale = isKey ? 1.3 : 1;
  coin.scale.set(scale, scale, scale);

  coin.traverse((child) => {
    if (!child.isMesh || !child.material || !child.material.color) return;

    if (child.userData.baseColor === undefined) {
      child.userData.baseColor = child.material.color.getHex();
    }

    child.material.color.setHex(isKey ? 0x3df5ff : child.userData.baseColor);
  });
}

function recycleCoin(coin, farthestZ) {
  if (!coin) return;

  coin.position.x = randomLane();
  coin.position.y = 0.95;

  coin.position.z =
    Math.min(farthestZ, INITIAL_FARTHEST_Z) -
    15 -
    Math.random() * 10;

  coin.rotation.set(0, 0, 0);
  coin.scale.set(1, 1, 1);
  coin.visible = true;

  applyKeyLook(coin, keyCoinsEnabled && Math.random() < KEY_CHANCE);

  coin.userData.phase = Math.random() * Math.PI * 2;
}

// ============================================
// UPDATE COINS
// ============================================

export function updateCoins(
  group,
  delta,
  speed = DEFAULT_COIN_SPEED,
  player = null,
  onCollect = () => {},
  powerUpState = {}
) {
  if (
    !group ||
    !group.userData.coins ||
    delta <= 0
  ) {
    return;
  }

  const safeDelta = Math.min(delta, 0.05);

  const movementSpeed = Number.isFinite(speed)
    ? Math.max(0, speed)
    : DEFAULT_COIN_SPEED;

  group.userData.elapsed += safeDelta;

  const elapsed = group.userData.elapsed;
  const coins = group.userData.coins;
  const effectsGroup = group.userData.effectsGroup;

  // Keep the collection animations independent of coin movement.
  updateCollectionEffects(effectsGroup, safeDelta);

  const positions = getPlayerPositions(player, group);

  const magnetActive =
    powerUpState.magnetActive === true;

  const magnetPullStrength =
    1 - Math.exp(-MAGNET_STRENGTH * safeDelta);

  // ==========================================
  // UPDATE EACH COIN
  // ==========================================

  for (const coin of coins) {
    if (!coin || !coin.visible) continue;

    // 1. Move according to the current world speed.
    coin.position.z += movementSpeed * safeDelta;

    // 2. Coin face animation.
    if (coin.userData.body) {
      coin.userData.body.rotation.y =
        Math.sin(
          elapsed * 3 + coin.userData.phase
        ) * 0.22;
    }

    // 3. Rotate the outer rim.
    if (coin.userData.rim) {
      coin.userData.rim.rotation.z += safeDelta * 0.8;
    }

    // 4. Floating motion.
    coin.position.y =
      0.95 +
      Math.sin(
        elapsed * 4 + coin.userData.phase
      ) * 0.09;

    // 5. Pulsing ground glow.
    if (coin.userData.glow) {
      const glowScale =
        1 +
        Math.sin(
          elapsed * 5 + coin.userData.phase
        ) * 0.12;

      coin.userData.glow.scale.setScalar(glowScale);
    }

    // Recycle passed coins even if the player is unavailable.
    if (!positions) {
      if (coin.position.z > 10) {
        recycleCoin(
          coin,
          getFarthestCoinZ(coins, coin)
        );
      }

      continue;
    }

    // ========================================
    // 6. MAGNET ATTRACTION
    // ========================================

    if (magnetActive) {
      const dx =
        positions.local.x - coin.position.x;

      const dz =
        positions.local.z - coin.position.z;

      if (
        Math.abs(dx) < MAGNET_RANGE &&
        Math.abs(dz) < MAGNET_RANGE
      ) {
        coin.position.x += dx * magnetPullStrength;
        coin.position.z += dz * magnetPullStrength;
      }
    }

    // ========================================
    // 7. PLAYER-COIN COLLISION
    // ========================================

    const coinPosition = getWorldPosition(coin, scratchCoinWorld);

    if (!coinPosition) continue;

    const dx = Math.abs(
      positions.world.x - coinPosition.x
    );

    const dy = Math.abs(
      positions.world.y - coinPosition.y
    );

    const dz = Math.abs(
      positions.world.z - coinPosition.z
    );

    // Allow for the distance a coin moves this frame, so a fast coin at
    // boosted speed cannot slip past the pickup zone between frames.
    const coinPadding = Math.min(
      movementSpeed * safeDelta * 0.5,
      0.5
    );

    if (
      dx < COIN_COLLISION_X &&
      dy < COIN_COLLISION_Y &&
      dz < COIN_COLLISION_Z + coinPadding
    ) {
      // Save the position before recycling the coin.
      const collectedPosition = coin.position.clone();

      // Trigger the collection effect at the coin's location.
      playCollectionEffect(
        effectsGroup,
        collectedPosition
      );

      // Hide first to prevent duplicate collection.
      coin.visible = false;

      try {
        onCollect(1, coin.userData.isKey === true);
      } catch (error) {
        console.warn(
          "[COINS] Collection callback failed:",
          error
        );
      }

      // Reuse this coin further down the road.
      recycleCoin(
        coin,
        getFarthestCoinZ(coins, coin)
      );

      continue;
    }

    // ========================================
    // 8. RECYCLE PASSED COINS
    // ========================================

    if (coin.position.z > 10) {
      recycleCoin(
        coin,
        getFarthestCoinZ(coins, coin)
      );
    }
  }
}
