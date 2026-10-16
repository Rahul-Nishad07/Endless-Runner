
import * as THREE from 'three';

import {
  BASE_WORLD_SPEED,
  CRATE_HEIGHT,
  LANE_X,
  START_GRACE_DISTANCE,
  getDifficultyProfile,
} from '../game/GameConfig';

import {
  createPatternState,
  planNextPattern,
} from './ObstaclePatterns';

// ============================================
// CONFIGURATION
// ============================================

const LANES = LANE_X;

// Pool of reusable obstacle slots. Each slot holds both a crate and a
// barrier and is shown as one type. Slots are activated in rows and
// deactivated after they pass the player. SPAWN_Z to RECYCLE_Z is 190
// units, so the pool must cover that at the tightest spacing.
const OBSTACLE_POOL_SIZE = 24;

const SPAWN_Z = -180;
const RECYCLE_Z = 10;

// First row of the initial layout starts here and extends back.
const INITIAL_FRONT_Z = -START_GRACE_DISTANCE;

const LANE_COLLISION_DISTANCE = 0.85;

// A flying runner at or above this height clears ground-level obstacles.
// Crates top out at 0.5 and barrier bars start at about 0.95.
const FLY_CLEAR_HEIGHT = 1.2;
const BASE_COLLISION_DISTANCE = 0.95;

const DEFAULT_OBSTACLE_SPEED = BASE_WORLD_SPEED;

// Collision tuning
const MIN_COLLISION_PADDING = 0.05;
const MAX_COLLISION_PADDING = 0.25;

// How far past the player an obstacle must be before it counts as passed.
// Matches the widest collision zone, so the collision check has run first.
const PASS_CHECK_DISTANCE = BASE_COLLISION_DISTANCE + MAX_COLLISION_PADDING;

// ============================================
// SHARED MATERIALS
// ============================================

const WOOD_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x99602f,
  roughness: 0.85,
  metalness: 0.05,
});

const WOOD_DARK_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x54351f,
  roughness: 0.9,
});

const BARRIER_RED_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xe83c46,
  roughness: 0.5,
  metalness: 0.12,
  emissive: 0x4c0710,
  emissiveIntensity: 0.35,
});

const BARRIER_WHITE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.45,
});

const BARRIER_POST_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x343e4d,
  metalness: 0.55,
  roughness: 0.5,
});

// ============================================
// REUSABLE GEOMETRIES
// ============================================

const CRATE_GEOMETRY = new THREE.BoxGeometry(
  1.05,
  CRATE_HEIGHT,
  0.85
);

const CRATE_BRACE_GEOMETRY = new THREE.BoxGeometry(
  1.15,
  0.1,
  0.08
);

const BARRIER_BAR_GEOMETRY = new THREE.BoxGeometry(
  1.65,
  0.32,
  0.35
);

const BARRIER_STRIPE_GEOMETRY = new THREE.BoxGeometry(
  0.12,
  0.34,
  0.37
);

const BARRIER_POST_GEOMETRY = new THREE.BoxGeometry(
  0.12,
  0.85,
  0.16
);

// ============================================
// HELPERS
// ============================================

function getSafeSpeed(speed) {
  return Number.isFinite(speed)
    ? Math.max(0, speed)
    : DEFAULT_OBSTACLE_SPEED;
}

// ============================================
// CREATE CRATE OBSTACLE PARTS
// ============================================

function createCrate() {
  const parts = new THREE.Group();

  const crate = new THREE.Mesh(
    CRATE_GEOMETRY,
    WOOD_MATERIAL
  );

  crate.position.y = CRATE_HEIGHT / 2;
  crate.castShadow = true;
  crate.receiveShadow = true;

  parts.add(crate);

  const braceA = new THREE.Mesh(
    CRATE_BRACE_GEOMETRY,
    WOOD_DARK_MATERIAL
  );

  braceA.position.set(0, CRATE_HEIGHT / 2, 0.45);
  braceA.rotation.z = Math.atan2(CRATE_HEIGHT, 1.05);
  braceA.castShadow = true;

  parts.add(braceA);

  const braceB = new THREE.Mesh(
    CRATE_BRACE_GEOMETRY,
    WOOD_DARK_MATERIAL
  );

  braceB.position.set(0, CRATE_HEIGHT / 2, 0.45);
  braceB.rotation.z = -Math.atan2(CRATE_HEIGHT, 1.05);
  braceB.castShadow = true;

  parts.add(braceB);

  return parts;
}

// ============================================
// CREATE BARRIER OBSTACLE PARTS
// ============================================

function createBarrier() {
  const parts = new THREE.Group();

  const bar = new THREE.Mesh(
    BARRIER_BAR_GEOMETRY,
    BARRIER_RED_MATERIAL
  );

  bar.position.y = 1.05;
  bar.castShadow = true;
  bar.receiveShadow = true;

  parts.add(bar);

  for (let i = 0; i < 4; i++) {
    const stripe = new THREE.Mesh(
      BARRIER_STRIPE_GEOMETRY,
      BARRIER_WHITE_MATERIAL
    );

    stripe.position.set(
      -0.58 + i * 0.38,
      1.05,
      0.015
    );

    stripe.rotation.z = -0.28;

    parts.add(stripe);
  }

  for (const x of [-0.68, 0.68]) {
    const post = new THREE.Mesh(
      BARRIER_POST_GEOMETRY,
      BARRIER_POST_MATERIAL
    );

    post.position.set(x, 0.43, 0);
    post.castShadow = true;
    post.receiveShadow = true;

    parts.add(post);
  }

  return parts;
}

// ============================================
// CREATE OBSTACLE SLOT
// ============================================

/**
 * One reusable slot holding both crate and barrier meshes.
 * setObstacleType() shows the part that matches the type.
 */
// Visual theme for obstacles. 'temple' shows falling stones and swinging
// blades in place of crates and barriers. The rules do not change: a stone
// is cleared by jumping like a crate, and a blade by sliding like a barrier.
let obstacleTheme = 'default';

export function setObstacleTheme(theme) {
  obstacleTheme = theme === 'temple' || theme === 'bridge' ? theme : 'default';
}

// Each theme shows its own obstacles in place of the crate and barrier.
const THEME_VISUAL = {
  temple: { crate: 'stone', barrier: 'swing' },
  bridge: { crate: 'gap', barrier: 'debris' },
};

// Which visual types are cleared by jumping, and which by sliding.
const JUMP_TYPES = ['crate', 'stone', 'gap'];
const SLIDE_TYPES = ['barrier', 'swing', 'debris'];

const GAP_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x0c0d10,
  roughness: 1,
});

const PLANK_BROKEN_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x8a5f3b,
  roughness: 0.9,
});

const DEBRIS_WOOD_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x6b4a2b,
  roughness: 0.85,
});

const ROPE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xc9b58a,
  roughness: 0.95,
});

// A missing plank section: a dark hole across the lane, with broken plank ends.
function createGap() {
  const parts = new THREE.Group();

  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.04, 1.2),
    GAP_MATERIAL
  );

  hole.position.y = 0.02;
  parts.add(hole);

  for (const x of [-0.95, 0.95]) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.2, 1.2),
      PLANK_BROKEN_MATERIAL
    );

    plank.position.set(x, 0.1, 0);
    plank.rotation.z = x < 0 ? 0.35 : -0.35;
    parts.add(plank);
  }

  return parts;
}

// A fallen beam hanging across the lane at barrier height. Slide under it.
function createDebris() {
  const parts = new THREE.Group();

  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.3, 0.3),
    DEBRIS_WOOD_MATERIAL
  );

  beam.position.y = 1.05;
  beam.rotation.z = 0.12;
  beam.castShadow = true;
  parts.add(beam);

  for (const x of [-0.7, 0.7]) {
    const rope = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1.5, 0.05),
      ROPE_MATERIAL
    );

    rope.position.set(x, 1.9, 0);
    parts.add(rope);
  }

  return parts;
}

const STONE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x6f675c,
  roughness: 0.95,
});

const SWING_METAL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x5b6269,
  roughness: 0.5,
  metalness: 0.6,
});

const SWING_BLADE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xb8c0c8,
  roughness: 0.3,
  metalness: 0.8,
});

// A squashed boulder whose top sits at CRATE_HEIGHT, so it matches the jump rule.
function createStone() {
  const parts = new THREE.Group();

  const stone = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 14, 10),
    STONE_MATERIAL
  );

  stone.scale.set(1.1, 0.595, 1.0);
  stone.position.y = CRATE_HEIGHT / 2;
  stone.castShadow = true;

  parts.add(stone);

  return parts;
}

// A blade at barrier height (1.05), hanging on a pivot above the lane.
function createSwing() {
  const parts = new THREE.Group();

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.42, 0.08),
    SWING_BLADE_MATERIAL
  );

  blade.position.y = 1.05;
  blade.castShadow = true;
  parts.add(blade);

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.6, 0.08),
    SWING_METAL_MATERIAL
  );

  arm.position.y = 1.875;
  parts.add(arm);

  const pivot = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.14, 0.14),
    SWING_METAL_MATERIAL
  );

  pivot.position.y = 2.7;
  parts.add(pivot);

  return parts;
}

function createObstacle() {
  const obstacle = new THREE.Group();

  obstacle.name = 'Obstacle';
  obstacle.userData.hasCollided = false;
  obstacle.userData.passRewarded = false;
  obstacle.userData.previousZ = 0;
  obstacle.userData.laneIndex = 1;

  for (const [type, parts] of [
    ['crate', createCrate()],
    ['barrier', createBarrier()],
    ['stone', createStone()],
    ['swing', createSwing()],
    ['gap', createGap()],
    ['debris', createDebris()],
  ]) {
    for (const part of [...parts.children]) {
      part.userData.partType = type;
      obstacle.add(part);
    }
  }

  setObstacleType(obstacle, 'crate');

  return obstacle;
}

function setObstacleType(obstacle, type) {
  const visual =
    (THEME_VISUAL[obstacleTheme] && THEME_VISUAL[obstacleTheme][type]) || type;

  obstacle.userData.type = visual;

  for (const part of obstacle.children) {
    part.visible = part.userData.partType === visual;
  }
}

// ============================================
// PLACE AND DEACTIVATE SLOTS
// ============================================

function placeObstacle(obstacle, laneIndex, z) {
  obstacle.userData.laneIndex = laneIndex;
  obstacle.userData.previousZ = z;
  obstacle.userData.hasCollided = false;
  obstacle.userData.passRewarded = false;

  obstacle.position.set(LANES[laneIndex], 0, z);
  obstacle.rotation.set(0, 0, 0);
  obstacle.visible = true;
}

function deactivateObstacle(obstacle) {
  obstacle.visible = false;
  obstacle.userData.hasCollided = false;
  obstacle.userData.passRewarded = false;
}

// ============================================
// PATTERN SPAWNING
// ============================================

// The rearmost active obstacle. Obstacles move toward +Z, so this is
// the one the player reaches last.
function getTailZ(items) {
  let tail = null;

  for (const obstacle of items) {
    if (!obstacle || !obstacle.visible) continue;

    if (tail === null || obstacle.position.z < tail) {
      tail = obstacle.position.z;
    }
  }

  return tail;
}

/**
 * Activates new obstacle rows behind the current tail until the tail
 * is behind SPAWN_Z. Each row comes from the pattern generator and is
 * validated for a reachable safe lane. If there are not enough free
 * slots, spawning waits for the next frame.
 */
function fillObstacles(group, difficulty) {
  const items = group.userData.items;
  const stats = group.userData.stats;

  for (let step = 0; step < 12; step++) {
    const anchorZ = getTailZ(items) ?? INITIAL_FRONT_Z;

    if (anchorZ <= SPAWN_Z) break;

    const slots = items.filter((obstacle) => !obstacle.visible);

    if (slots.length === 0) {
      stats.starved++;
      break;
    }

    const plan = planNextPattern({
      difficulty,
      state: group.userData.planner,
      anchorZ,
      slotsAvailable: slots.length,
    });

    if (!plan) {
      stats.starved++;
      break;
    }

    let slotIndex = 0;

    for (const row of plan.rows) {
      for (const { lane, type } of row.obstacles) {
        const slot = slots[slotIndex++];

        placeObstacle(slot, lane, row.z);
        setObstacleType(slot, type);
      }
    }

    group.userData.planner = plan.nextState;
  }
}

// ============================================
// CREATE ALL OBSTACLES
// ============================================

export function createObstacles() {
  const group = new THREE.Group();

  group.name = 'Obstacles';

  const items = [];

  for (let i = 0; i < OBSTACLE_POOL_SIZE; i++) {
    const obstacle = createObstacle();

    obstacle.visible = false;

    group.add(obstacle);
    items.push(obstacle);
  }

  group.userData.items = items;
  group.userData.planner = createPatternState();
  group.userData.stats = { starved: 0 };

  fillObstacles(group, getDifficultyProfile(0));

  console.log('[OBSTACLES] CREATED:', items.length);

  return group;
}

// ============================================
// RESET EXISTING OBSTACLES
// ============================================

export function resetObstacles(group) {
  if (!group) {
    console.warn('[OBSTACLES] Cannot reset: invalid group');
    return;
  }

  const items = group.userData.items || group.children;

  for (const obstacle of items) {
    if (!obstacle) continue;

    deactivateObstacle(obstacle);
    obstacle.rotation.set(0, 0, 0);
  }

  // Restart always uses the initial difficulty and a fresh pattern state.
  group.userData.planner = createPatternState();
  group.userData.stats = { starved: 0 };

  fillObstacles(group, getDifficultyProfile(0));

  group.updateMatrixWorld(true);

  console.log('[OBSTACLES] RESET COMPLETE:', items.length);
}

// ============================================
// GET WORLD POSITION
// ============================================

// Reusable output vector for per-frame lookups. Callers that hold the
// result across another lookup must pass their own target.
const scratchObstacleWorld = new THREE.Vector3();

function getWorldPosition(object, target = new THREE.Vector3()) {
  if (!object) return null;

  object.updateWorldMatrix(true, false);

  return object.getWorldPosition(target);
}

// ============================================
// GET PLAYER POSITION AND ACTION STATE
// ============================================

function getPlayerData(player) {
  if (!player) return null;

  const object = player.group || player;
  const position = getWorldPosition(object);

  if (!position) return null;

  return {
    x: position.x,
    y: position.y,
    z: position.z,
    isJumping: player.isJumping === true,
    isSliding: player.isSliding === true,
    isFlying: player.isFlying === true,
  };
}

// ============================================
// CHECK IF PLAYER AVOIDED OBSTACLE
// ============================================

function hasAvoidedObstacle(obstacle, playerData) {
  const type = obstacle.userData.type;

  // Flying high clears any ground obstacle.
  if (playerData.isFlying && playerData.y >= FLY_CLEAR_HEIGHT) {
    return true;
  }

  // Crates must be cleared by jumping high enough.
  if (
    JUMP_TYPES.includes(type) &&
    playerData.isJumping &&
    playerData.y >= CRATE_HEIGHT
  ) {
    return true;
  }

  // Barriers must be cleared by sliding.
  if (
    SLIDE_TYPES.includes(type) &&
    playerData.isSliding
  ) {
    return true;
  }

  return false;
}

// ============================================
// UPDATE OBSTACLES AND DETECT COLLISIONS
// ============================================

/**
 * Moves active obstacles, deactivates passed ones, spawns new pattern
 * rows, and detects collisions.
 *
 * `difficulty` comes from getDifficultyProfile(distance) and controls
 * spacing for newly spawned rows.
 *
 * Compatible with the existing index.tsx call:
 *
 * updateObstacles(
 *   group,
 *   delta,
 *   currentWorldSpeed,
 *   playerRef.current,
 *   onCollision,
 *   gameOverRef.current,
 *   difficultyProfile
 * );
 */
export function updateObstacles(
  group,
  delta,
  speed = DEFAULT_OBSTACLE_SPEED,
  player = null,
  onCollision = () => {},
  gameOver = false,
  difficulty = getDifficultyProfile(0),
  onPass = () => {}
) {
  if (!group || gameOver || delta <= 0) {
    return;
  }

  const items = group.userData.items || group.children;

  if (!items.length) return;

  // Limit movement per frame after a frame-time spike.
  const safeDelta = Math.min(delta, 0.05);
  const movementSpeed = getSafeSpeed(speed);

  const playerData = getPlayerData(player);

  // ==========================================
  // 1. MOVE ACTIVE OBSTACLES
  // ==========================================

  for (const obstacle of items) {
    if (!obstacle || !obstacle.visible) continue;

    // Preserve the previous position for swept collision checks.
    obstacle.userData.previousZ = obstacle.position.z;

    obstacle.position.z += movementSpeed * safeDelta;
  }

  // ==========================================
  // 1b. CLEAN DODGE EVENTS
  // ==========================================

  // An obstacle counts as passed once it was fully beyond the collision
  // zone at the start of this frame. Its collision check ran on an earlier
  // frame, so a hit cannot be counted as a dodge.
  if (playerData && onPass) {
    const passZ = playerData.z + PASS_CHECK_DISTANCE;

    for (const obstacle of items) {
      if (
        !obstacle ||
        !obstacle.visible ||
        obstacle.userData.hasCollided ||
        obstacle.userData.passRewarded ||
        obstacle.userData.previousZ <= passZ
      ) {
        continue;
      }

      // Each obstacle is judged once, whatever the result.
      obstacle.userData.passRewarded = true;

      // Only obstacles in the runner's lane were a real threat.
      const obstaclePosition = getWorldPosition(
        obstacle,
        scratchObstacleWorld
      );

      if (
        !obstaclePosition ||
        Math.abs(obstaclePosition.x - playerData.x) > LANE_COLLISION_DISTANCE
      ) {
        continue;
      }

      try {
        onPass(obstacle);
      } catch (error) {
        console.warn('[OBSTACLES] Pass callback failed:', error);
      }
    }
  }

  // ==========================================
  // 2. DEACTIVATE PASSED OBSTACLES
  // ==========================================

  for (const obstacle of items) {
    if (
      !obstacle ||
      !obstacle.visible ||
      obstacle.position.z <= RECYCLE_Z
    ) {
      continue;
    }

    deactivateObstacle(obstacle);
  }

  // ==========================================
  // 3. SPAWN NEW PATTERN ROWS
  // ==========================================

  fillObstacles(group, difficulty);

  if (!playerData) return;

  // ==========================================
  // 4. COLLISION DISTANCE
  // ==========================================

  const collisionPadding = Math.min(
    movementSpeed * safeDelta * 0.5,
    MAX_COLLISION_PADDING
  );

  const collisionDistance =
    BASE_COLLISION_DISTANCE +
    Math.max(
      MIN_COLLISION_PADDING,
      collisionPadding
    );

  // ==========================================
  // 5. COLLISION DETECTION
  // ==========================================

  for (const obstacle of items) {
    if (
      !obstacle ||
      !obstacle.visible ||
      obstacle.userData.hasCollided
    ) {
      continue;
    }

    const obstaclePosition = getWorldPosition(
      obstacle,
      scratchObstacleWorld
    );

    if (!obstaclePosition) continue;

    const dx = Math.abs(
      obstaclePosition.x - playerData.x
    );

    if (dx > LANE_COLLISION_DISTANCE) {
      continue;
    }

    const previousZ = Number.isFinite(
      obstacle.userData.previousZ
    )
      ? obstacle.userData.previousZ
      : obstaclePosition.z;

    // Detect when the obstacle passes through the player's
    // collision zone between frames, not just at one instant.
    const playerNearZ = playerData.z - collisionDistance;
    const playerFarZ = playerData.z + collisionDistance;

    const crossedPlayerZone =
      previousZ <= playerFarZ &&
      obstaclePosition.z >= playerNearZ;

    if (!crossedPlayerZone) {
      continue;
    }

    // ========================================
    // 6. JUMP / SLIDE AVOIDANCE
    // ========================================

    if (hasAvoidedObstacle(obstacle, playerData)) {
      continue;
    }

    // ========================================
    // 7. COLLISION CALLBACK
    // ========================================

    obstacle.userData.hasCollided = true;

    try {
      onCollision(obstacle);
    } catch (error) {
      console.warn(
        '[OBSTACLES] Collision callback failed:',
        error
      );
    }

    // Deactivate so one obstacle cannot trigger repeatedly.
    deactivateObstacle(obstacle);
  }
}
