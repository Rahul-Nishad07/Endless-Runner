// ============================================
// ENVIRONMENT WORLD EVENTS
//
// Temporary atmosphere changes tied to the current zone. Each event
// only tints the fog and background colour and nudges hemisphere light.
// It never changes physics, collisions, lane positions, or fog distance,
// so obstacles and lane boundaries stay as visible as before.
//
// Durations and cooldowns are in seconds of game time (delta based).
// Only one event runs at a time.
// ============================================

import * as THREE from 'three';

// First event waits this long after a run starts.
const INITIAL_COOLDOWN = 12;

// Fraction by which cooldowns shrink per difficulty tier (Expert = 0.45).
const COOLDOWN_REDUCTION_PER_TIER = 0.15;

// Speed of the colour fade in and out (per second).
const BLEND_RATE = 3;

export const WORLD_EVENTS = [
  {
    id: 'city_dusk',
    zone: 'City',
    minTier: 0,
    duration: 6,
    cooldown: 25,
    intensity: 0.5,
    fogColor: 0x9aa6bd,
    hemisphereScale: 0.8,
  },
  {
    id: 'jungle_mist',
    zone: 'Jungle',
    minTier: 0,
    duration: 7,
    cooldown: 30,
    intensity: 0.4,
    // Neutral mist. The old pale green also tinted the distant road green.
    fogColor: 0xd6e2e8,
    hemisphereScale: 0.9,
  },
  {
    id: 'bridge_wind',
    zone: 'Bridge',
    minTier: 1,
    duration: 5,
    cooldown: 30,
    intensity: 0.3,
    fogColor: 0xb7d4f0,
    hemisphereScale: 1.1,
  },
  {
    id: 'ruins_dust',
    zone: 'Ancient Ruins',
    minTier: 1,
    duration: 6,
    cooldown: 30,
    intensity: 0.45,
    fogColor: 0xe3c58e,
    hemisphereScale: 1.0,
  },
  {
    id: 'river_mist',
    zone: 'River',
    minTier: 2,
    duration: 7,
    cooldown: 28,
    intensity: 0.45,
    fogColor: 0xbfdde8,
    hemisphereScale: 0.95,
  },
];

/**
 * Name of the zone under the player. Zones are recycled behind the
 * farthest one, so the zone whose Z is in [0, zoneLength) is the one
 * the player is in. Only the name is returned, so no zone object is
 * kept after it is recycled.
 */
export function getActiveZoneName(environment) {
  if (!environment?.zones?.length) return null;

  const length = environment.zoneLength;

  for (const zone of environment.zones) {
    if (zone.position.z >= 0 && zone.position.z < length) {
      return zone.name;
    }
  }

  return null;
}

/**
 * Creates the event controller. `fog`, `background` and `hemisphere`
 * are the objects it tints. Their base values are copied at creation,
 * so reset() can restore them exactly.
 *
 * @param {{
 *   fog?: any,
 *   background?: any,
 *   hemisphere?: any,
 *   random?: () => number,
 * }} [options]
 */
export function createWorldEvents(options = {}) {
  const {
    fog = null,
    background = null,
    hemisphere = null,
    random = Math.random,
  } = options;

  const baseFogColor = fog ? fog.color.clone() : null;
  const baseBackground = background ? background.clone() : null;
  const baseIntensity = hemisphere ? hemisphere.intensity : 0;

  const tint = new THREE.Color();

  const state = {
    zone: null,
    active: null,
    lastEvent: null,
    remaining: 0,
    cooldown: INITIAL_COOLDOWN,
    blend: 0,
  };

  function applyColours() {
    const event = state.lastEvent;
    const strength = event ? event.intensity * state.blend : 0;

    tint.setHex(event ? event.fogColor : 0);

    if (fog && baseFogColor) {
      fog.color.copy(baseFogColor).lerp(tint, strength);
    }

    if (background && baseBackground) {
      background.copy(baseBackground).lerp(tint, strength);
    }

    if (hemisphere) {
      const scale = event ? event.hemisphereScale : 1;

      hemisphere.intensity =
        baseIntensity * (1 + (scale - 1) * state.blend);
    }
  }

  function getCooldown(event, difficultyIndex) {
    return (
      event.cooldown *
      (1 - COOLDOWN_REDUCTION_PER_TIER * difficultyIndex)
    );
  }

  function endActiveEvent(difficultyIndex) {
    if (!state.active) return;

    state.cooldown = getCooldown(state.active, difficultyIndex);
    state.active = null;
    state.remaining = 0;
  }

  return {
    /**
     * Advances events and fades colours. Call once per running frame.
     */
    update(delta, zoneName, difficultyIndex = 0) {
      const dt = Math.min(Math.max(delta || 0, 0), 0.1);

      // Leaving a zone ends its event early. The previous zone's tint is
      // also dropped at once. Fading it out would carry its green (jungle)
      // or sand (ruins) colour into the new zone for several seconds.
      if (zoneName !== state.zone) {
        state.zone = zoneName;
        endActiveEvent(difficultyIndex);
        state.lastEvent = null;
        state.blend = 0;
      }

      if (state.active) {
        state.remaining -= dt;

        if (state.remaining <= 0) {
          endActiveEvent(difficultyIndex);
        }
      } else {
        state.cooldown -= dt;

        if (state.cooldown <= 0) {
          const candidates = WORLD_EVENTS.filter(
            (event) =>
              event.zone === zoneName &&
              event.minTier <= difficultyIndex
          );

          if (candidates.length > 0) {
            const event =
              candidates[Math.floor(random() * candidates.length)];

            state.active = event;
            state.lastEvent = event;
            state.remaining = event.duration;
          } else {
            // Nothing eligible here. Check again later.
            state.cooldown = INITIAL_COOLDOWN;
          }
        }
      }

      const target = state.active ? 1 : 0;

      state.blend +=
        (target - state.blend) * (1 - Math.exp(-BLEND_RATE * dt));

      applyColours();
    },

    /**
     * Ends any event and restores base colours. Used on restart,
     * game over and unmount.
     */
    reset() {
      state.zone = null;
      state.active = null;
      state.lastEvent = null;
      state.remaining = 0;
      state.cooldown = INITIAL_COOLDOWN;
      state.blend = 0;

      applyColours();
    },

    getActiveEventId() {
      return state.active ? state.active.id : null;
    },
  };
}
