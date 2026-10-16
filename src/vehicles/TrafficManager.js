// ============================================
// TRAFFIC MANAGER
//
// Oncoming cars that spawn ahead of the player and drive toward them.
// Runs inside the existing game loop, with delta-time movement and no
// timers of its own.
//
// Fairness rules:
// - A car spawns only in a lane that has no car or obstacle near the
//   spawn point.
// - Spawning stops once two lanes are blocked near the spawn point, so
//   there is always a lane to move into.
// - Cars only spawn in zones that have roads for them (City and Bridge).
//
// Pooled: a fixed set of vehicles is created once and reused. Nothing is
// created or destroyed during a run.
// ============================================

import * as THREE from 'three';

import { LANE_X } from '../game/GameConfig';
import { createTrafficVehicle } from './TrafficVehicle';

export const TRAFFIC_CONFIG = {
  poolSize: 8,
  maxActive: 5,

  // Spawn and recycle positions along Z. The player is at z = 2.
  spawnZ: -150,
  recycleZ: 12,
  playerZ: 2,

  // Half-width of the player's collision box, and half the depth.
  playerHalfWidth: 0.4,
  playerHalfDepth: 0.35,

  // Spawn timing, in seconds: slower early, faster later.
  intervalEarly: 2.6,
  intervalLate: 1.5,

  // Extra approach speed on top of the world speed (units/s).
  extraSpeedEarly: 4,
  extraSpeedLate: 9,

  // Distance (m) over which difficulty rises from early to late values.
  rampDistance: 3000,

  // Blocking check around the spawn point.
  blockWindow: 10,
  blockedLaneLimit: 2,

  // Share of spawns that are vans rather than cars.
  vanChance: 0.3,

  // Zones with traffic. Other zones have no road for it.
  zones: ['City', 'Bridge'],
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (from, to, t) => from + (to - from) * t;

export function getSpawnInterval(distance) {
  const t = clamp01(distance / TRAFFIC_CONFIG.rampDistance);

  return lerp(TRAFFIC_CONFIG.intervalEarly, TRAFFIC_CONFIG.intervalLate, t);
}

export function getExtraSpeed(distance) {
  const t = clamp01(distance / TRAFFIC_CONFIG.rampDistance);

  return lerp(TRAFFIC_CONFIG.extraSpeedEarly, TRAFFIC_CONFIG.extraSpeedLate, t);
}

/**
 * Creates the traffic system and adds its group to the scene.
 * `scene` may be null in tests.
 */
/**
 * @param {any} [scene]
 */
export function createTrafficManager(scene = null) {
  const threeGroup = new THREE.Group();
  threeGroup.name = 'Traffic';

  if (scene) {
    scene.add(threeGroup);
  }

  // Alternate car and van types so the pool holds both.
  const pool = [];

  for (let i = 0; i < TRAFFIC_CONFIG.poolSize; i++) {
    const type = i % 3 === 2 ? 'van' : 'car';
    const vehicle = createTrafficVehicle(type, i);

    vehicle.visible = false;
    threeGroup.add(vehicle);

    pool.push({
      vehicle,
      type,
      lane: 1,
      active: false,
      hit: false,
      passed: false,
    });
  }

  let spawnTimer = 0;
  let spawned = 0;
  let hits = 0;

  function laneIndexOf(x) {
    let best = 0;

    for (let i = 1; i < LANE_X.length; i++) {
      if (Math.abs(LANE_X[i] - x) < Math.abs(LANE_X[best] - x)) best = i;
    }

    return best;
  }

  /**
   * Lanes that have a car or obstacle near the spawn point.
   * Returns a Set of lane indices.
   */
  function getBlockedLanes(obstacles) {
    const blocked = new Set();
    const { spawnZ, blockWindow } = TRAFFIC_CONFIG;

    for (const entry of pool) {
      if (!entry.active) continue;

      if (Math.abs(entry.vehicle.position.z - spawnZ) < blockWindow) {
        blocked.add(entry.lane);
      }
    }

    for (const obstacle of obstacles) {
      if (!obstacle || !obstacle.visible) continue;

      if (Math.abs(obstacle.position.z - spawnZ) < blockWindow) {
        blocked.add(laneIndexOf(obstacle.position.x));
      }
    }

    return blocked;
  }

  /** Picks a lane for a new car, or null if no spawn is safe right now. */
  function chooseLane(obstacles) {
    const blocked = getBlockedLanes(obstacles);

    // Adding one more lane must keep the blocked count within the limit.
    if (blocked.size >= TRAFFIC_CONFIG.blockedLaneLimit) return null;

    const free = [];

    for (let lane = 0; lane < LANE_X.length; lane++) {
      if (!blocked.has(lane)) free.push(lane);
    }

    if (free.length === 0) return null;

    return free[Math.floor(Math.random() * free.length)];
  }

  function activeCount() {
    let count = 0;

    for (const entry of pool) {
      if (entry.active) count++;
    }

    return count;
  }

  function spawn(obstacles) {
    if (activeCount() >= TRAFFIC_CONFIG.maxActive) return false;

    const lane = chooseLane(obstacles);
    if (lane === null) return false;

    const wantVan = Math.random() < TRAFFIC_CONFIG.vanChance;
    const entry =
      pool.find((e) => !e.active && (e.type === 'van') === wantVan) ||
      pool.find((e) => !e.active);

    if (!entry) return false;

    entry.lane = lane;
    entry.active = true;
    entry.hit = false;
    entry.passed = false;

    entry.vehicle.position.set(LANE_X[lane], 0, TRAFFIC_CONFIG.spawnZ);
    entry.vehicle.visible = true;

    spawned++;

    return true;
  }

  function deactivate(entry) {
    entry.active = false;
    entry.hit = false;
    entry.passed = false;
    entry.vehicle.visible = false;
  }

  return {
    group: threeGroup,

    /**
     * Advances traffic by one frame. Call from the game loop only while
     * the game is running. `onHit(vehicle)` runs at most once per car.
     * `onPass(vehicle)` runs once per car that the runner dodges cleanly.
     */
    /**
     * @param {{
     *   delta: number,
     *   speed: number,
     *   distance: number,
     *   zoneName: string | null,
     *   obstacles?: any[],
     *   playerX?: number,
     *   onHit?: (vehicle: any) => void,
     *   onPass?: (vehicle: any) => void,
     * }} frame
     */
    update({ delta, speed, distance, zoneName, obstacles = [], playerX = 0, onHit = (vehicle) => {}, onPass = (vehicle) => {} }) {
      const dt = Math.min(Math.max(delta || 0, 0), 0.05);
      if (dt <= 0) return;

      const { recycleZ, playerZ, playerHalfWidth, playerHalfDepth } = TRAFFIC_CONFIG;
      const zoneAllowed = TRAFFIC_CONFIG.zones.includes(zoneName);

      if (zoneAllowed) {
        spawnTimer += dt;

        if (spawnTimer >= getSpawnInterval(distance)) {
          spawnTimer = 0;

          // If the spawn was blocked, retry soon instead of waiting a full interval.
          if (!spawn(obstacles)) {
            spawnTimer = getSpawnInterval(distance) * 0.5;
          }
        }
      } else {
        spawnTimer = 0;
      }

      const extra = getExtraSpeed(distance);

      for (const entry of pool) {
        if (!entry.active) continue;

        const vehicle = entry.vehicle;

        // Cars approach the player at world speed plus their own speed.
        const previousZ = vehicle.position.z;
        vehicle.position.z += (speed + extra) * dt;

        if (vehicle.position.z > recycleZ) {
          deactivate(entry);
          continue;
        }

        if (entry.hit) continue;

        const lateral = vehicle.userData.halfWidth + playerHalfWidth;
        const longitudinal = vehicle.userData.halfLength + playerHalfDepth;

        // Clean dodge: the car has fully passed the player, without a hit.
        // Counted once per car, and only if it was in the runner's lane.
        if (!entry.passed && previousZ > playerZ + longitudinal) {
          entry.passed = true;

          if (Math.abs(vehicle.position.x - playerX) < lateral) {
            onPass(vehicle);
          }
        }

        const overlapX = Math.abs(vehicle.position.x - playerX) < lateral;
        // Swept test: the car's path this step must reach the player's
        // zone. A single end-of-step check could skip over the player at
        // boosted speed.
        const overlapZ =
          previousZ < playerZ + longitudinal &&
          vehicle.position.z > playerZ - longitudinal;

        if (overlapX && overlapZ) {
          entry.hit = true;
          hits++;

          deactivate(entry);
          onHit(vehicle);
        }
      }
    },

    /** Clears every car and the spawn timer. Used on restart. */
    reset() {
      for (const entry of pool) {
        deactivate(entry);
      }

      spawnTimer = 0;
    },

    /** Removes the traffic group from the scene. */
    dispose() {
      for (const entry of pool) {
        deactivate(entry);
      }

      threeGroup.removeFromParent?.();
    },

    getStats() {
      return {
        active: activeCount(),
        spawned,
        hits,
        poolSize: pool.length,
      };
    },

    // Exposed for tests.
    _pool: pool,
  };
}

