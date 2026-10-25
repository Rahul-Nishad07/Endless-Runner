
 // ============================================
 // TRAFFIC MANAGER
 // Fast oncoming cars and vans for the endless runner.
 //
 // Keeps existing lane selection, collision detection,
 // pooling, zone restrictions and restart behavior.
 // ============================================

import * as THREE from 'three';

import { LANE_X } from '../game/GameConfig';
import { createTrafficVehicle } from './TrafficVehicle';

export const TRAFFIC_CONFIG = {
  poolSize: 8,
  maxActive: 5,

  // Spawn and recycle positions along Z. Player is at z = 2.
  spawnZ: -150,
  recycleZ: 12,
  playerZ: 2,

  // Player collision dimensions.
  playerHalfWidth: 0.4,
  playerHalfDepth: 0.35,

 // Spawn timing
intervalEarly: 1.8,
intervalLate: 1.0,

// Extra approach speed on top of world speed
extraSpeedEarly: 14,
extraSpeedLate: 24,

// Distance over which difficulty increases
rampDistance: 2500,

  // Keep the existing spawn fairness rules.
  blockWindow: 10,
  blockedLaneLimit: 2,

  // Share of spawns that are vans.
  vanChance: 0.3,

  // Only zones with roads for traffic.
  zones: ['City', 'Bridge'],
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (from, to, t) => from + (to - from) * t;

export function getSpawnInterval(distance) {
  const t = clamp01(distance / TRAFFIC_CONFIG.rampDistance);

  return lerp(
    TRAFFIC_CONFIG.intervalEarly,
    TRAFFIC_CONFIG.intervalLate,
    t
  );
}

export function getExtraSpeed(distance) {
  const t = clamp01(distance / TRAFFIC_CONFIG.rampDistance);

  return lerp(
    TRAFFIC_CONFIG.extraSpeedEarly,
    TRAFFIC_CONFIG.extraSpeedLate,
    t
  );
}

/**
 * Creates the traffic system and adds its group to the scene.
 * @param {any} [scene]
 */
export function createTrafficManager(scene = null) {
  const threeGroup = new THREE.Group();
  threeGroup.name = 'Traffic';

  if (scene) {
    scene.add(threeGroup);
  }

  // Keep the existing pooled mix of cars and vans.
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
      if (
        Math.abs(LANE_X[i] - x) <
        Math.abs(LANE_X[best] - x)
      ) {
        best = i;
      }
    }

    return best;
  }

  /**
   * Returns lanes occupied near the spawn point.
   */
  function getBlockedLanes(obstacles) {
    const blocked = new Set();
    const { spawnZ, blockWindow } = TRAFFIC_CONFIG;

    for (const entry of pool) {
      if (!entry.active) continue;

      if (
        Math.abs(entry.vehicle.position.z - spawnZ) <
        blockWindow
      ) {
        blocked.add(entry.lane);
      }
    }

    for (const obstacle of obstacles) {
      if (!obstacle || !obstacle.visible) continue;

      if (
        Math.abs(obstacle.position.z - spawnZ) <
        blockWindow
      ) {
        blocked.add(laneIndexOf(obstacle.position.x));
      }
    }

    return blocked;
  }

  /**
   * Picks a safe lane for the next vehicle.
   */
  function chooseLane(obstacles) {
    const blocked = getBlockedLanes(obstacles);

    if (blocked.size >= TRAFFIC_CONFIG.blockedLaneLimit) {
      return null;
    }

    const free = [];

    for (let lane = 0; lane < LANE_X.length; lane++) {
      if (!blocked.has(lane)) {
        free.push(lane);
      }
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
    if (activeCount() >= TRAFFIC_CONFIG.maxActive) {
      return false;
    }

    const lane = chooseLane(obstacles);
    if (lane === null) return false;

    const wantVan = Math.random() < TRAFFIC_CONFIG.vanChance;

    const entry =
      pool.find(
        (e) => !e.active && (e.type === 'van') === wantVan
      ) || pool.find((e) => !e.active);

    if (!entry) return false;

    entry.lane = lane;
    entry.active = true;
    entry.hit = false;
    entry.passed = false;

    entry.vehicle.position.set(
      LANE_X[lane],
      0,
      TRAFFIC_CONFIG.spawnZ
    );

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
     * Call once per game-loop frame while the game is running.
     *
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
    update({
      delta,
      speed,
      distance,
      zoneName,
      obstacles = [],
      playerX = 0,
      onHit = (vehicle) => {},
      onPass = (vehicle) => {},
    }) {
      // Prevent unusually large frame steps.
      const dt = Math.min(Math.max(delta || 0, 0), 0.05);
      if (dt <= 0) return;

      const {
        recycleZ,
        playerZ,
        playerHalfWidth,
        playerHalfDepth,
      } = TRAFFIC_CONFIG;

      const zoneAllowed = TRAFFIC_CONFIG.zones.includes(zoneName);

      if (zoneAllowed) {
        spawnTimer += dt;

        if (spawnTimer >= getSpawnInterval(distance)) {
          spawnTimer = 0;

          // Retry sooner if no safe lane is available.
          if (!spawn(obstacles)) {
            spawnTimer = getSpawnInterval(distance) * 0.5;
          }
        }
      } else {
        spawnTimer = 0;
      }

      // Extra traffic speed increases as distance increases.
      const extra = getExtraSpeed(distance);
      const approachSpeed = Math.max(0, speed) + extra;

      for (const entry of pool) {
        if (!entry.active) continue;

        const vehicle = entry.vehicle;
        const previousZ = vehicle.position.z;

        // Cars and vans approach the player faster.
        vehicle.position.z += approachSpeed * dt;

        if (vehicle.position.z > recycleZ) {
          deactivate(entry);
          continue;
        }

        if (entry.hit) continue;

        const lateral =
          vehicle.userData.halfWidth + playerHalfWidth;

        const longitudinal =
          vehicle.userData.halfLength + playerHalfDepth;

        // Count a clean dodge once the vehicle passes the player.
        if (
          !entry.passed &&
          previousZ > playerZ + longitudinal
        ) {
          entry.passed = true;

          if (
            Math.abs(vehicle.position.x - playerX) < lateral
          ) {
            onPass(vehicle);
          }
        }

        const overlapX =
          Math.abs(vehicle.position.x - playerX) < lateral;

        // Swept collision check helps avoid missed hits at higher speed.
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

    /**
     * Clears all vehicles and resets the spawn timer.
     */
    reset() {
      for (const entry of pool) {
        deactivate(entry);
      }

      spawnTimer = 0;
    },

    /**
     * Removes the traffic group from the scene.
     */
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
