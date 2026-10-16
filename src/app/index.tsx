
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ActivityIndicator,
  AppState,
  ScrollView,
} from 'react-native';

import { useGoogleAuth } from '../service/googleAuth';
import {
  createEnvironment,
  disposeEnvironment,
  updateEnvironment,
  updateWaterAnimation,
  resetEnvironment,
} from '../world/Environment';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLView } from 'expo-gl';
import { StatusBar } from 'expo-status-bar';
import * as THREE from 'three';

import GameHUD from '../hud/GameHUD';
import PerfOverlay from '../hud/PerfOverlay';
import { createGameWorld } from '../game/GameWorld';
import {
  createThreeRenderer,
  runRendererSelfTest,
} from '../game/utils/ThreeRenderer';
import {
  BASE_WORLD_SPEED,
  SPEED_BOOST_DURATION,
  SPEED_BOOST_MULTIPLIER,
  SPEED_BOOST_RAMP_RATE,
  SPEED_SMOOTHING_RATE,
  getDifficultyProfile,
  getSpeedMultiplier,
  getTargetWorldSpeed,
} from '../game/GameConfig';
import {
  MILESTONE_REWARDS_ENABLED,
  collectCrossedMilestones,
  createMilestoneTracker,
} from '../game/Milestones';
import {
  createWorldEvents,
  getActiveZoneName,
} from '../world/WorldEvents';
import MilestoneBanner from '../hud/MilestoneBanner';
import { createFrameTimer } from '../utils/FrameTimer';
import { probeFailingMaterials } from '../utils/RenderProbe';
import audioManager from '../audio/AudioManager';
import progressManager from '../game/ProgressManager';
import missionService from '../missions/MissionStore';
import characterService from '../characters/CharacterStore';
import adventureService, { setAdventureUser } from '../adventure/AdventureStore';
import { nextAdventureLevel } from '../adventure/AdventureConfig';
import { DEFAULT_MODEL_SET } from '../characters/CharacterModels';
import { createTrafficManager } from '../vehicles/TrafficManager';
import { router } from 'expo-router';
import AdventureMapScreen from '../screens/AdventureMapScreen';
import CharactersScreen from '../screens/CharactersScreen';
import MissionsScreen from '../screens/MissionsScreen';
import Player from '../player/Player';
import { DEFAULT_CHARACTER_ID } from '../characters/CharacterCatalog';

// Development-only frame timing. No-op in production builds.
const frameTimer = createFrameTimer('run');

// Dev-only clock for hit timing. Read outside the component so the hit
// handler itself stays free of impure calls.
const devNow = () => performance.now();

// Run state. The one authoritative value for where the run is.
//   READY       before the first run starts
//   RUNNING     gameplay is live
//   TRUCK_CATCH second collision: gameplay frozen, truck closes in
//   GAME_OVER   scorecard shown; nothing else may change the run
type RunState = 'READY' | 'RUNNING' | 'TRUCK_CATCH' | 'GAME_OVER';

// Two collisions closer together than this (run seconds) count as one.
const COLLISION_COOLDOWN_SECONDS = 0.3;

// Brief truck catch before the scorecard appears (500-900 ms range).
const TRUCK_CATCH_DURATION_MS = 850;

// Truck speed during the catch, for the wheels only.
const TRUCK_CATCH_SPEED = 30;

// Seconds of invulnerability after a rewarded revive, so obstacles that are
// still close cannot end the run straight away.
const REVIVE_INVULNERABLE_SECONDS = 2.5;

type MilestoneNotice = {
  id: number;
  distance: number;
  message: string;
  reward: number;
};

import { resetObstacles, setObstacleTheme, updateObstacles } from '../world/Obstacles';
import { resetCoins, setKeyCoinsEnabled, updateCoins } from '../world/Coins';
import FollowCamera from '../camera/FollowCamera';
import { createPowerUps, updatePowerUps } from '../world/PowerUps';
import { CHASE_CONFIG, createChaseController } from '../chase/ChaseController';
import { createChaseTruck } from '../chase/ChaseTruck';
import { AdBanner } from '../ads/AdBanner';
import { useGameOverInterstitial } from '../ads/useGameOverInterstitial';
import { useGameRewardedAd } from '../ads/useRewardedAd';

type PowerUpTimers = {
  magnet: number;
  shield: number;
  multiplier: number;
  speed: number;
  fly: number;
};

type AuraObject = THREE.Group & {
  userData: {
    auraType?: string;
    auraOpacity?: number;
    targetOpacity?: number;
    auraPhase?: number;
    [key: string]: any;
  };
};

type EnvironmentController = {
  zones: THREE.Group[];
  zoneLength: number;
  zoneCount: number;
  zoneNames: string[];
};

// Sky Flyer duration in run seconds. Pauses stop the countdown.
const FLY_DURATION = 4;

const EMPTY_POWER_UPS: PowerUpTimers = {
  magnet: 0,
  shield: 0,
  multiplier: 0,
  speed: 0,
  fly: 0,
};

const POWER_UP_DURATION: Record<keyof PowerUpTimers, number> = {
  magnet: 2,
  shield: 2,
  multiplier: 2,
  speed: SPEED_BOOST_DURATION,
  fly: FLY_DURATION,
};

// ============================================
// POWER-UP AURA MATERIALS
// ============================================

function createAuraMaterial(
  color: number,
  opacity: number,
  wireframe = false
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    wireframe,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  material.userData.baseOpacity = opacity;
  return material;
}

function addAuraRing(
  parent: THREE.Group,
  color: number,
  radius: number,
  tube: number,
  opacity: number,
  rotationX = Math.PI / 2
): THREE.Mesh {
  const geometry = new THREE.TorusGeometry(radius, tube, 8, 48);
  const material = createAuraMaterial(color, opacity);
  const ring = new THREE.Mesh(geometry, material);

  ring.rotation.x = rotationX;
  ring.userData.auraBaseOpacity = opacity;
  parent.add(ring);

  return ring;
}

function addAuraParticle(
  parent: THREE.Group,
  color: number,
  radius: number,
  angle: number,
  height: number,
  size: number,
  opacity: number
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(size, 8, 8);
  const material = createAuraMaterial(color, opacity);
  const particle = new THREE.Mesh(geometry, material);

  particle.position.set(
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius
  );

  particle.userData.orbitRadius = radius;
  particle.userData.orbitAngle = angle;
  particle.userData.orbitHeight = height;
  particle.userData.orbitSpeed = 0.8 + Math.random() * 1.5;
  particle.userData.auraBaseOpacity = opacity;

  parent.add(particle);
  return particle;
}

// ============================================
// CREATE PLAYER POWER-UP AURAS
// ============================================

function createPlayerPowerAura(
  playerGroup: THREE.Group
): THREE.Group {
  const root = new THREE.Group();

  root.name = 'PlayerPowerAura';
  root.position.set(0, 0.95, 0);
  root.userData.auraTime = 0;

  const magnet = new THREE.Group();
  magnet.name = 'MagnetAura';
  magnet.userData.auraType = 'magnet';
  magnet.userData.auraOpacity = 0;
  magnet.userData.targetOpacity = 0;

  addAuraRing(magnet, 0x168dff, 0.66, 0.035, 0.85);
  addAuraRing(magnet, 0x54c8ff, 0.83, 0.018, 0.65);
  addAuraRing(magnet, 0x168dff, 0.56, 0.025, 0.65, 0.15);

  const magnetOrbit = new THREE.Group();
  magnetOrbit.name = 'MagnetOrbit';

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;

    addAuraParticle(
      magnetOrbit,
      i % 2 === 0 ? 0x45c8ff : 0xffffff,
      0.68 + (i % 3) * 0.08,
      angle,
      Math.sin(angle * 2) * 0.65,
      i % 3 === 0 ? 0.055 : 0.035,
      0.95
    );
  }

  magnet.add(magnetOrbit);
  magnet.userData.orbitGroup = magnetOrbit;

  const shield = new THREE.Group();
  shield.name = 'ShieldAura';
  shield.userData.auraType = 'shield';
  shield.userData.auraOpacity = 0;
  shield.userData.targetOpacity = 0;

  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.83, 20, 16),
    createAuraMaterial(0x45fff0, 0.22, true)
  );

  bubble.scale.set(0.82, 1.22, 0.68);
  bubble.userData.auraBaseOpacity = 0.22;
  shield.add(bubble);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.79, 16, 12),
    createAuraMaterial(0x12cfff, 0.09)
  );

  shell.scale.set(0.82, 1.22, 0.68);
  shell.userData.auraBaseOpacity = 0.09;
  shield.add(shell);

  addAuraRing(shield, 0x45fff0, 0.82, 0.025, 0.9);
  addAuraRing(shield, 0x12cfff, 0.9, 0.018, 0.65, 0.65);
  addAuraRing(shield, 0x45fff0, 0.9, 0.018, 0.65, -0.65);

  const shieldOrbit = new THREE.Group();
  shieldOrbit.name = 'ShieldOrbit';

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;

    addAuraParticle(
      shieldOrbit,
      i % 2 === 0 ? 0x45fff0 : 0xffffff,
      0.86,
      angle,
      Math.sin(angle) * 0.8,
      0.04,
      0.9
    );
  }

  shield.add(shieldOrbit);
  shield.userData.orbitGroup = shieldOrbit;

  const multiplier = new THREE.Group();
  multiplier.name = 'MultiplierAura';
  multiplier.userData.auraType = 'multiplier';
  multiplier.userData.auraOpacity = 0;
  multiplier.userData.targetOpacity = 0;

  addAuraRing(multiplier, 0xffc928, 0.68, 0.035, 0.95);
  addAuraRing(multiplier, 0xffed82, 0.84, 0.018, 0.75);
  addAuraRing(multiplier, 0xffa500, 0.56, 0.022, 0.7, 0.35);

  const multiplierOrbit = new THREE.Group();
  multiplierOrbit.name = 'MultiplierOrbit';

  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;

    addAuraParticle(
      multiplierOrbit,
      i % 3 === 0 ? 0xffffff : 0xffd23f,
      0.72 + (i % 2) * 0.12,
      angle,
      Math.sin(angle * 3) * 0.72,
      i % 3 === 0 ? 0.05 : 0.032,
      1
    );
  }

  multiplier.add(multiplierOrbit);
  multiplier.userData.orbitGroup = multiplierOrbit;

  root.add(magnet, shield, multiplier);
  playerGroup.add(root);

  magnet.visible = false;
  shield.visible = false;
  multiplier.visible = false;

  return root;
}

// ============================================
// UPDATE PLAYER POWER-UP AURAS
// ============================================

function updatePlayerPowerAura(
  root: THREE.Group | null,
  timers: PowerUpTimers,
  delta: number
): void {
  if (!root) return;

  root.userData.auraTime = (root.userData.auraTime ?? 0) + delta;
  const time = root.userData.auraTime;

  const timerByType: Record<string, number> = {
    magnet: timers.magnet,
    shield: timers.shield,
    multiplier: timers.multiplier,
  };

  root.children.forEach((child) => {
    const aura = child as AuraObject;
    const type = aura.userData.auraType;

    if (!type) return;

    const remaining = timerByType[type] ?? 0;

    aura.userData.targetOpacity = remaining > 0 ? 1 : 0;

    const currentOpacity = aura.userData.auraOpacity ?? 0;
    const targetOpacity = aura.userData.targetOpacity ?? 0;
    const fadeSpeed = targetOpacity > currentOpacity ? 12 : 15;

    const nextOpacity = THREE.MathUtils.damp(
      currentOpacity,
      targetOpacity,
      fadeSpeed,
      delta
    );

    aura.userData.auraOpacity = nextOpacity;
    aura.visible = nextOpacity > 0.015;

    if (!aura.visible) return;

    const pulse = 1 + Math.sin(time * 5.5) * 0.035;
    aura.scale.setScalar(pulse);

    if (type === 'magnet') {
      aura.rotation.y += delta * 0.85;
      aura.rotation.z = Math.sin(time * 2.2) * 0.035;
    } else if (type === 'shield') {
      aura.rotation.y -= delta * 0.42;
      aura.rotation.x = Math.sin(time * 1.7) * 0.04;
    } else {
      aura.rotation.y += delta * 0.65;
      aura.rotation.z = Math.sin(time * 3) * 0.055;
    }

    const orbitGroup = aura.userData.orbitGroup as
      | THREE.Group
      | undefined;

    if (orbitGroup) {
      orbitGroup.rotation.y += delta * (type === 'shield' ? -1.1 : 1.6);
      orbitGroup.rotation.x = Math.sin(time * 1.8) * 0.13;
    }

    aura.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      const applyOpacity = (mat: THREE.Material) => {
        const auraMaterial = mat as THREE.MeshBasicMaterial;
        const baseOpacity =
          auraMaterial.userData?.baseOpacity ??
          object.userData.auraBaseOpacity ??
          1;

        if ('opacity' in auraMaterial) {
          auraMaterial.opacity = baseOpacity * nextOpacity;
        }
      };

      const currentMaterial = object.material;

      if (Array.isArray(currentMaterial)) {
        currentMaterial.forEach(applyOpacity);
      } else {
        applyOpacity(currentMaterial);
      }

      if (object.userData.orbitRadius !== undefined) {
        const angle =
          object.userData.orbitAngle +
          time * object.userData.orbitSpeed;

        const radius = object.userData.orbitRadius;

        object.position.x = Math.cos(angle) * radius;
        object.position.z = Math.sin(angle) * radius;
        object.position.y =
          object.userData.orbitHeight +
          Math.sin(angle * 1.8 + time * 2) * 0.12;
      }
    });

    if (type === 'shield') {
      const shieldBubble = aura.children.find(
        (object) =>
          object instanceof THREE.Mesh &&
          object.geometry instanceof THREE.SphereGeometry
      );

      if (shieldBubble) {
        const bubblePulse = 1 + Math.sin(time * 4) * 0.025;

        shieldBubble.scale.set(
          0.82 * bubblePulse,
          1.22 * bubblePulse,
          0.68 * bubblePulse
        );
      }
    }
  });
}

// ============================================
// DISPOSE AURA
// ============================================

function disposePlayerPowerAura(root: THREE.Group | null): void {
  if (!root) return;

  root.parent?.remove(root);

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.geometry.dispose();

    const currentMaterial = object.material;

    if (Array.isArray(currentMaterial)) {
      currentMaterial.forEach((mat) => mat.dispose());
    } else {
      currentMaterial.dispose();
    }
  });
}

// ============================================
// GAME SCREEN
// ============================================

export default function GameScreen() {
    // Google authentication
  const {
    user: googleUser,
    loading: googleLoading,
    error: googleError,
    signIn,
    signOut,
  } = useGoogleAuth();

  // Adventure progress follows the signed-in account. Signed out = guest.
  useEffect(() => {
    setAdventureUser(googleUser?.user?.id ?? null);
  }, [googleUser]);
  const animationFrame = useRef<number | null>(null);
  const playerRef = useRef<any>(null);
  const swipeHandledRef = useRef(false);
  const mountedRef = useRef(true);

  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);
  const gameStartedRef = useRef(false);
  const gameSessionRef = useRef(0);

  const elapsedRef = useRef(0);
  const lastHudUpdateRef = useRef(0);

  const scoreRef = useRef(0);
  const coinsRef = useRef(0);
  const distanceRef = useRef(0);

  const worldSpeedRef = useRef(BASE_WORLD_SPEED);

  // Booster multiplier, 1 = normal. Eases in and out; see GameConfig.
  const boostLevelRef = useRef(1);
  const difficultyIndexRef = useRef(0);

  // Identifies the current run. Increments on every new run, so the
  // progress manager can award each run's coins exactly once.
  const runIdRef = useRef(0);

  // Approaching traffic. Created with the scene, reset on restart.
  const trafficRef = useRef<ReturnType<typeof createTrafficManager> | null>(null);

  const milestoneTrackerRef = useRef(createMilestoneTracker());
  const milestoneQueueRef = useRef<MilestoneNotice[]>([]);
  const milestoneIdRef = useRef(0);
  const bannerActiveRef = useRef(false);
  const worldEventsRef =
    useRef<ReturnType<typeof createWorldEvents> | null>(null);

  const activePowerUpsRef = useRef<PowerUpTimers>({
    ...EMPTY_POWER_UPS,
  });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  const obstaclesRef = useRef<THREE.Group | null>(null);
  const coinGroupRef = useRef<THREE.Group | null>(null);
  const powerUpsRef = useRef<THREE.Group | null>(null);

  const environmentRef = useRef<EnvironmentController | null>(null);
 

  const playerAuraRef = useRef<THREE.Group | null>(null);
  const followCameraRef = useRef<any>(null);

  const crashTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dev only: when the hit happened, to time the scorecard commit.
  const hitAtRef = useRef(0);

  const [gameStarted, setGameStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [crashFlash, setCrashFlash] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  // Set when the 3D scene fails to start, so the screen says so instead of
  // staying blank.
  const [initError, setInitError] = useState<string | null>(null);

  // Adventure mode. A selected level makes the next run a level run. With no
  // selection, the run is an ordinary endless run.
  const [activeLevel, setActiveLevel] = useState<any>(null);
  const levelRef = useRef<any>(null);
  // Coin pickups in this level run. Milestone bonuses are not counted.
  const levelCoinsRef = useRef(0);
  const levelKeysRef = useRef(0);
  const [levelCoins, setLevelCoins] = useState(0);
  const [levelKeys, setLevelKeys] = useState(0);

  // Development only: measured numbers for the performance overlay.
  const [perfStats, setPerfStats] = useState<any>(null);
  const perfRef = useRef({ time: 0, frames: 0 });

  // HUD refresh bookkeeping. The HUD updates a few times a second, and the
  // mission distance is saved in batches, so the game screen re-renders less.
  const lastMissionFlushRef = useRef(0);
  const powerShownRef = useRef(false);
  const [levelDone, setLevelDone] = useState<any>(null);
  const [levelFailNote, setLevelFailNote] = useState<string | null>(null);

  // The adventure map is drawn over this screen, not as a separate route,
  // so the game view is never unmounted while the player browses levels.
  const [showAdventureMap, setShowAdventureMap] = useState(false);

  // Characters and Missions are also overlays, for the same reason.
  const [showCharacters, setShowCharacters] = useState(false);
  const [showMissions, setShowMissions] = useState(false);

  // The character the current player model was built from.
  const builtCharacterIdRef = useRef<string | null>(null);

  // Closing the map shows the newly selected level, unless a run is in progress.
  const closeAdventureMap = () => {
    setShowAdventureMap(false);
    setAdventureNotice(null);

    if (!gameStartedRef.current) {
      setActiveLevel(adventureService.getSelectedLevel());
    }
  };

  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [distance, setDistance] = useState(0);

  // Result of the run that just ended. Only set at Game Over.
  const [runResult, setRunResult] = useState<{ newBest: boolean } | null>(null);

  // Character summary for the Home screen.
  const [characterView, setCharacterView] = useState<any>(null);

  // Mission summary for the Home screen preview.
  const [missionView, setMissionView] = useState<any>(null);

  // Saved progress for the Home (welcome) screen.
  const [progress, setProgress] = useState(() =>
    progressManager.getProgress()
  );

  const [milestoneBanner, setMilestoneBanner] =
    useState<MilestoneNotice | null>(null);

  // Distance-based speed tier shown in the HUD. Changes only at the HUD
  // update rate, not every frame.
  const [speedTier, setSpeedTier] = useState(1);

  // Safe-area insets for the menu and scorecard. The 3D scene itself stays
  // edge-to-edge; only interactive layers are padded.
  const insets = useSafeAreaInsets();

  // Chase mode. One controller for the component's life, reused each run.
  const [chase] = useState(() => createChaseController());
  const [chaseMode, setChaseMode] = useState(false);
  const chaseModeRef = useRef(false);
  const chaseTruckRef = useRef<ReturnType<typeof createChaseTruck> | null>(null);
  const [chaseView, setChaseView] = useState({
    state: 'WAITING',
    distance: CHASE_CONFIG.initialDistance,
  });
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);

  // Short message shown on the Adventure list, for example after Continue
  // lands on a level that is not available yet.
  const [adventureNotice, setAdventureNotice] = useState<string | null>(null);

  // One revive per run, from a rewarded ad. The ref is the source of truth.
  const [reviveUsed, setReviveUsed] = useState(false);
  const reviveUsedRef = useRef(false);
  const invulnerableUntilRef = useRef(-Infinity);

  // Where the current scoring segment began. A revive starts a new segment,
  // so coins and distance are saved once per segment, not twice.
  const segmentStartRef = useRef({ coins: 0, distance: 0 });

  const runStateRef = useRef<RunState>('READY');
  const collisionCountRef = useRef(0);
  const lastCollisionAtRef = useRef(-Infinity);
  const catchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activePowerUps, setActivePowerUps] =
    useState<PowerUpTimers>({ ...EMPTY_POWER_UPS });

  const clearCrashTimer = () => {
    if (crashTimeoutRef.current !== null) {
      clearTimeout(crashTimeoutRef.current);
      crashTimeoutRef.current = null;
    }
  };

  const collectPowerUp = (type: string) => {
    if (
      type !== 'magnet' &&
      type !== 'shield' &&
      type !== 'multiplier' &&
      type !== 'speed' &&
      type !== 'fly'
    ) {
      return;
    }

    const powerUpType = type as keyof PowerUpTimers;
    const current = activePowerUpsRef.current;

    const next: PowerUpTimers = {
      ...current,
      [powerUpType]: Math.max(
        current[powerUpType],
        POWER_UP_DURATION[powerUpType]
      ),
    };

    activePowerUpsRef.current = next;
    setActivePowerUps({ ...next });

    console.log(`[POWER-UP] ${type.toUpperCase()} activated`);

    audioManager.playSfx('powerup');
    missionService.onPowerUpCollected();
  };

  // Applies the equipped character to the player, between runs, without
  // rebuilding the 3D world. The new model loads first. The swap itself is
  // synchronous, so the frame loop never sees a missing player. If the load
  // fails, the current player stays.
  const swapPlayerToEquipped = async () => {
    const scene = sceneRef.current;
    const oldPlayer = playerRef.current;
    const character = characterService.getEquippedCharacter();

    if (
      !scene ||
      !oldPlayer ||
      !character ||
      character.id === builtCharacterIdRef.current
    ) {
      return;
    }

    const nextPlayer = new Player();

    try {
      await nextPlayer.load(
        characterService.getEquippedModelSet() ?? DEFAULT_MODEL_SET
      );
    } catch (error: any) {
      console.warn(
        '[CHARACTER] Could not load the chosen character; keeping the current one:',
        error?.message || error
      );
      nextPlayer.destroy?.();
      return;
    }

    // A run may have started, or the screen may have closed, while loading.
    if (!mountedRef.current || gameStartedRef.current) {
      nextPlayer.destroy?.();
      return;
    }

    nextPlayer.setPosition(0, 0, 2);

    scene.remove(oldPlayer.group);
    oldPlayer.destroy?.();
    scene.add(nextPlayer.group);

    playerRef.current = nextPlayer;
    disposePlayerPowerAura(playerAuraRef.current);
    playerAuraRef.current = nextPlayer.group
      ? createPlayerPowerAura(nextPlayer.group)
      : null;
    builtCharacterIdRef.current = character.id;

    console.log('[CHARACTER] Player swapped to', character.id);
  };

  const closeCharacters = () => {
    setShowCharacters(false);
    swapPlayerToEquipped();
  };

  // Index of the zone a level starts in. Endless runs start in zone 0.
  const levelZoneIndex = (level: any) => {
    const environment = environmentRef.current;
    if (!level || !environment) return 0;

    return Math.max(0, environment.zoneNames.indexOf(level.environment));
  };

  // Reads the selected adventure level for the next run and sets up its
  // start: objective counter, zone and briefing.
  // Every level plays in its own world. If the built world is not the one
  // the level needs, the old zones are removed and the level's zones are
  // built before the run starts. Classic play uses the full zone cycle.
  const ensureLevelWorld = (level: any) => {
    const scene = sceneRef.current;
    const current = environmentRef.current as any;

    if (!scene || !current) return;

    const wanted = level?.worldZone ?? null;

    if ((current.worldZone ?? null) === wanted) return;

    disposeEnvironment(scene, current);
    environmentRef.current = createEnvironment(scene, wanted);
  };

  const prepareLevelRun = () => {
    const level = adventureService.getSelectedLevel();

    levelRef.current = level;
    levelCoinsRef.current = 0;
    setLevelCoins(0);
    levelKeysRef.current = 0;
    setLevelKeys(0);

    // The level sets its obstacle look and whether coins can be keys.
    setObstacleTheme(level?.obstacleTheme ?? 'default');
    setKeyCoinsEnabled(level?.objective?.type === 'keys');
    setLevelDone(null);
    setLevelFailNote(null);
    setActiveLevel(level);

    ensureLevelWorld(level);

    if (environmentRef.current) {
      resetEnvironment(environmentRef.current, levelZoneIndex(level));
    }
  };

  // Ends a level run as a failure. Unlike a hit, the shield does not block it.
  const failLevelRun = (note: string) => {
    runStateRef.current = 'GAME_OVER';
    gameOverRef.current = true;
    setLevelFailNote(note);

    setScore(Math.floor(scoreRef.current));
    setDistance(Math.floor(distanceRef.current));
    setCoins(coinsRef.current);

    clearCrashTimer();
    setIsPaused(false);
    setGameOver(true);
  };

  // Reached the finish distance. The level completes only if its objective
  // is met. Completion is saved through the adventure service, which pays
  // the reward once.
  const finishLevel = (level: any) => {
    if (gameOverRef.current) return;

    const collected = levelCoinsRef.current;
    const keysNow = levelKeysRef.current;
    const distanceNow = Math.floor(distanceRef.current);
    const isKeyLevel = level.objective.type === 'keys';
    const progress = isKeyLevel ? keysNow : collected;
    const unit = isKeyLevel ? 'keys' : 'coins';

    if (progress < level.objective.count) {
      failLevelRun(
        `Reached the finish with ${progress} of ${level.objective.count} ${unit}. Try again.`
      );
      return;
    }

    // Level complete ends the run. A later hit must not open Game Over.
    runStateRef.current = 'GAME_OVER';
    gameOverRef.current = true;
    setDistance(distanceNow);
    setLevelDone({ status: 'saving', level, coins: collected, keys: keysNow, distance: distanceNow });

    adventureService
      .complete(level.id, { coins: collected, distance: distanceNow })
      .then((result: any) => {
        if (!mountedRef.current) return;

        setLevelDone({
          status: result.ok ? 'done' : 'error',
          level,
          coins: collected,
          keys: keysNow,
          distance: distanceNow,
          result,
        });
      });
  };

  // Clears every per-run collision and catch value. Start and Restart both
  // call this, so a new run never inherits the last run's state.
  const resetRunState = () => {
    runStateRef.current = 'RUNNING';
    collisionCountRef.current = 0;
    lastCollisionAtRef.current = -Infinity;
    reviveUsedRef.current = false;
    setReviveUsed(false);
    invulnerableUntilRef.current = -Infinity;
    segmentStartRef.current = { coins: 0, distance: 0 };
    lastMissionFlushRef.current = 0;
    powerShownRef.current = false;

    if (catchTimerRef.current !== null) {
      clearTimeout(catchTimerRef.current);
      catchTimerRef.current = null;
    }
  };

  const startGame = () => {
    resetRunState();
    chase.reset();
    setChaseView({
      state: 'WAITING',
      distance: CHASE_CONFIG.initialDistance,
    });
    setGameOverReason(null);

    if (gameOverRef.current || isRestarting) return;

    prepareLevelRun();

    runIdRef.current += 1;
    missionService.onRunStarted(runIdRef.current);

    gameStartedRef.current = true;
    pausedRef.current = false;

    setGameStarted(true);
    setIsPaused(false);

    audioManager.playSfx('ui_click');
    audioManager.playMusic();
  };

  const togglePause = () => {
    if (
      !gameStartedRef.current ||
      gameOverRef.current ||
      isRestarting
    ) {
      return;
    }

    const nextPaused = !pausedRef.current;

    pausedRef.current = nextPaused;
    setIsPaused(nextPaused);

    if (nextPaused) {
      audioManager.pause();
    } else {
      audioManager.resume();
    }
  };

  const resetPlayerForRestart = (player: any) => {
    if (!player) return;

    if (typeof player.reset === 'function') {
      player.reset();
      return;
    }

    player.currentLane = 0;
    player.targetX = 0;
    player.baseY = 0;
    player.jumpVelocity = 0;
    player.isJumping = false;
    player.jumpElapsed = 0;
    player.isSliding = false;
    player.slideTimer = 0;

    player.group?.position.set(0, 0, 2);
    player.group?.rotation.set(0, 0, 0);
    player.group?.scale.set(1, 1, 1);

    if (player.model && player.poseInitialized) {
      if (player.normalScale) {
        player.model.scale.copy(player.normalScale);
      }

      if (player.normalModelPosition) {
        player.model.position.copy(player.normalModelPosition);
      }

      if (player.normalModelRotation) {
        player.model.rotation.copy(player.normalModelRotation);
      }
    }

    player.animationController?.reset?.();
    player.mixer?.stopAllAction?.();
    player.activeAction = null;

    if (
      player.loaded &&
      player.animationNames?.run &&
      typeof player.playAnimation === 'function'
    ) {
      player.playAnimation(player.animationNames.run, {
        loop: true,
        fadeDuration: 0,
      });
    }
  };

  const restartGame = () => {
    if (
      !sceneRef.current ||
      !cameraRef.current ||
      !playerRef.current ||
      !obstaclesRef.current ||
      !coinGroupRef.current
    ) {
      console.warn('[RESTART] Game world is not ready yet');
      return;
    }

    clearCrashTimer();

    prepareLevelRun();

    pausedRef.current = false;
    gameOverRef.current = false;
    gameStartedRef.current = true;
    resetRunState();
    swipeHandledRef.current = false;

    elapsedRef.current = 0;
    lastHudUpdateRef.current = 0;
    worldSpeedRef.current = BASE_WORLD_SPEED;
    boostLevelRef.current = 1;
    difficultyIndexRef.current = 0;

    chase.reset();
    setChaseView({
      state: 'WAITING',
      distance: CHASE_CONFIG.initialDistance,
    });
    setGameOverReason(null);

    runIdRef.current += 1;
    missionService.onRunStarted(runIdRef.current);

    trafficRef.current?.reset();

    milestoneTrackerRef.current = createMilestoneTracker();
    milestoneQueueRef.current = [];
    bannerActiveRef.current = false;
    worldEventsRef.current?.reset();

    scoreRef.current = 0;
    coinsRef.current = 0;
    distanceRef.current = 0;

    activePowerUpsRef.current = { ...EMPTY_POWER_UPS };

    resetPlayerForRestart(playerRef.current);

    disposePlayerPowerAura(playerAuraRef.current);

    playerAuraRef.current = playerRef.current.group
      ? createPlayerPowerAura(playerRef.current.group)
      : null;

    resetObstacles(obstaclesRef.current);
    resetCoins(coinGroupRef.current);

    // The road is attached to each zone, so reset zones together.
   resetEnvironment(environmentRef.current, levelZoneIndex(levelRef.current));
    followCameraRef.current = new FollowCamera(cameraRef.current);

    if (powerUpsRef.current) {
      sceneRef.current.remove(powerUpsRef.current);
    }

    powerUpsRef.current = createPowerUps(sceneRef.current);

    setScore(0);
    setCoins(0);
    setDistance(0);
    setSpeedTier(getSpeedMultiplier(0));
    setRunResult(null);
    setMilestoneBanner(null);
    setActivePowerUps({ ...EMPTY_POWER_UPS });

    setCrashFlash(false);
    setIsPaused(false);
    setGameOver(false);
    setGameStarted(true);

    // Clears any sound left from the previous run, then starts the
    // music again from the beginning.
    audioManager.resume();
    audioManager.restartMusic();
    setIsRestarting(false);

    console.log('[RESTART] Game reset complete');
  };

  // Ends the current run and returns to the welcome screen. Saved
  // progress is kept. Reuses restartGame to reset the world, then stops it.
  const goHome = () => {
    restartGame();

    gameStartedRef.current = false;
    pausedRef.current = false;
    gameOverRef.current = false;

    audioManager.stopMusic({ fade: false });

    setGameStarted(false);
    setGameOver(false);
    setIsPaused(false);
    setRunResult(null);

    audioManager.playSfx('ui_click');
  };

  // Shared hit handler for obstacles and traffic. A shield absorbs the
  // first hit. Otherwise the run ends, once.
  const handlePlayerHit = (source: THREE.Object3D) => {
    if (gameOverRef.current || runStateRef.current !== 'RUNNING') return;

    // After a revive, obstacles that are still close cannot end the run.
    if (elapsedRef.current < invulnerableUntilRef.current) return;

    // One contact counts once. A short cooldown stops a single obstacle
    // from registering twice on consecutive frames.
    const runTime = elapsedRef.current;

    if (runTime - lastCollisionAtRef.current < COLLISION_COOLDOWN_SECONDS) {
      return;
    }

    lastCollisionAtRef.current = runTime;

    if (__DEV__) hitAtRef.current = devNow();

    followCameraRef.current?.triggerShake(0.16, 0.28);

    if (activePowerUpsRef.current.shield > 0) {
      activePowerUpsRef.current = {
        ...activePowerUpsRef.current,
        shield: 0,
      };

      setActivePowerUps({
        ...activePowerUpsRef.current,
      });

      console.log('[POWER-UP] SHIELD ABSORBED HIT');
      return;
    }

    if (chaseModeRef.current) {
      // Chase mode. The first hit is a stumble: the run continues and the
      // truck closes in. A second distinct hit lets the truck catch the
      // runner. The obstacle is already deactivated, so it cannot hit twice.
      collisionCountRef.current += 1;

      audioManager.playSfx('collision');
      flashCrash();

      const caught = chase.onHit(getSpeedMultiplier(distanceRef.current));

      if (caught || collisionCountRef.current >= 2) {
        triggerTruckCatch();
      }

      return;
    }

    endRun('You hit an obstacle or traffic!', source.userData.type);
  };

  // A clean dodge, reported by the obstacle and traffic systems. Counts
  // only in chase mode.
  const handleDodge = () => {
    if (gameOverRef.current || !chaseModeRef.current) return;

    chase.onDodge();
  };

  // Brief red flash on a survivable hit. Never lingers over the scorecard.
  const flashCrash = () => {
    clearCrashTimer();
    setCrashFlash(true);

    crashTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setCrashFlash(false);
      }

      crashTimeoutRef.current = null;
    }, 180);
  };

  // Second collision (or the gap reaching zero). Freezes all gameplay at
  // once, then shows the scorecard after the short catch animation. The
  // timer is the only route into endRun from here, so the scorecard opens
  // exactly once.
  const triggerTruckCatch = () => {
    if (runStateRef.current !== 'RUNNING') return;

    runStateRef.current = 'TRUCK_CATCH';
    gameOverRef.current = true;
    pausedRef.current = true;

    if (__DEV__) console.log('[CHASE] TRUCK CATCH');

    // One small shake as the truck reaches the runner. Kept subtle.
    // Impact: runner stumbles, truck jolts, camera shakes.
    playerRef.current?.triggerImpact?.();
    chaseTruckRef.current?.impact?.();
    followCameraRef.current?.triggerShake(0.14, 0.35);

    catchTimerRef.current = setTimeout(() => {
      catchTimerRef.current = null;

      if (mountedRef.current) {
        endRun('CAUGHT BY THE TRUCK');
      }
    }, TRUCK_CATCH_DURATION_MS);
  };

  // Ends the run once. Every Game Over path goes through here, so the
  // scorecard, saves and mission updates happen exactly once per run.
  const endRun = (reason: string, sourceType?: string) => {
    if (runStateRef.current === 'GAME_OVER') return;

    runStateRef.current = 'GAME_OVER';
    gameOverRef.current = true;
    pausedRef.current = true;

    setGameOverReason(reason);

    // Game Over ends every timed effect, including the speed booster.
    activePowerUpsRef.current = { ...EMPTY_POWER_UPS };
    boostLevelRef.current = 1;

    // Show the scorecard first. Everything below is bookkeeping, so
    // none of it should hold up the screen change.
    setScore(Math.floor(scoreRef.current));
    setDistance(Math.floor(distanceRef.current));
    setCoins(coinsRef.current);
    setMilestoneBanner(null);
    setIsPaused(false);
    setGameOver(true);

    // Stop milestone banners and restore base colours.
    worldEventsRef.current?.reset();
    milestoneQueueRef.current = [];
    bannerActiveRef.current = false;

    // One collision sound, then one Game Over cue. This
    // callback is guarded by gameOverRef, so neither repeats.
    // Music cuts immediately instead of fading out.
    audioManager.playSfx('collision');
    audioManager.playSfx('game_over');
    audioManager.stopMusic({ fade: false });

    // Record the run once. completeRun() ignores a repeated
    // call for the same run ID.
    // Save this segment only. After a revive, the continuation saves just
    // the coins and distance it earned. Score is the run's total.
    const segment = segmentStartRef.current;
    const segmentCoins = Math.max(0, coinsRef.current - segment.coins);
    const segmentDistance = Math.max(
      0,
      Math.floor(distanceRef.current) - Math.floor(segment.distance)
    );

    const result = progressManager.completeRun({
      runId: runIdRef.current,
      score: Math.floor(scoreRef.current),
      coins: segmentCoins,
      distance: segmentDistance,
    });
    setRunResult({ newBest: result.newBest });

    // Counted once per run segment. The service ignores repeat calls.
    missionService.onRunEnded(runIdRef.current, { metres: segmentDistance });

    // Short red flash only. It must not linger over the scorecard.
    flashCrash();

    if (__DEV__) {
      console.log('[GAME] GAME OVER:', reason, sourceType ?? '');
    }
  };

  // Dev only: time from the hit to the committed scorecard render.
  useEffect(() => {
    if (!__DEV__ || !gameOver || hitAtRef.current === 0) return;

    console.log(
      `[TIMING] hit -> scorecard committed: ${(
        performance.now() - hitAtRef.current
      ).toFixed(1)} ms`
    );
    hitAtRef.current = 0;
  }, [gameOver]);

  // Remove the chase truck from the scene when the screen unmounts.
  useEffect(() => () => {
    chaseTruckRef.current?.dispose();
    chaseTruckRef.current = null;

    if (catchTimerRef.current !== null) {
      clearTimeout(catchTimerRef.current);
      catchTimerRef.current = null;
    }
  }, []);

  // Resumes play after a rewarded ad. One revive per run. Play continues
  // in place: the chase gap returns to its starting distance, and the
  // runner is invulnerable for a short window.
  const reviveRunFromAd = () => {
    if (runStateRef.current !== 'GAME_OVER' || reviveUsedRef.current) return;

    reviveUsedRef.current = true;
    setReviveUsed(true);

    // The first segment is already saved. The continuation gets its own
    // run ID, so its coins and distance save exactly once.
    segmentStartRef.current = {
      coins: coinsRef.current,
      distance: distanceRef.current,
    };
    runIdRef.current += 1;

    invulnerableUntilRef.current =
      elapsedRef.current + REVIVE_INVULNERABLE_SECONDS;
    collisionCountRef.current = 0;
    lastCollisionAtRef.current = -Infinity;

    chase.revive();

    runStateRef.current = 'RUNNING';
    gameOverRef.current = false;
    pausedRef.current = false;

    setGameOverReason(null);
    setRunResult(null);
    setGameOver(false);

    if (__DEV__) console.log('[ADS] REVIVED');
  };

  const runAfterInterstitial = useGameOverInterstitial();

  const {
    message: reviveMessage,
    requestReveal,
  } = useGameRewardedAd(reviveRunFromAd);

  // Continue after a completed level: start the next level only if it is
  // playable and unlocked. Otherwise return to the Adventure list with a note.
  const continueAfterLevel = () => {
    const completed = levelDone?.level;
    const next = completed ? nextAdventureLevel(completed.id) : null;

    setLevelDone(null);

    if (next && next.playable && adventureService.selectLevel(next.id).ok) {
      restartGame();
      return;
    }

    setAdventureNotice(
      next ? next.name + ' is coming soon.' : 'More levels are coming soon.'
    );
    goHome();
    setShowAdventureMap(true);
  };

  // Level Select: back to the Adventure list. The map refreshes itself.
  const levelSelectAfterComplete = () => {
    setLevelDone(null);
    setAdventureNotice(null);
    goHome();
    setShowAdventureMap(true);
  };

  const toggleChaseMode = () => {
    const next = !chaseModeRef.current;

    chaseModeRef.current = next;
    setChaseMode(next);
  };

  // Shows the next queued milestone, or hides the banner.
  const showNextMilestone = () => {
    const next = milestoneQueueRef.current.shift() ?? null;

    bannerActiveRef.current = next !== null;
    setMilestoneBanner(next);
  };

  // Each crossed milestone is queued once, then shown in order.
  // Rewards are only granted when MILESTONE_REWARDS_ENABLED is on.
  const enqueueMilestones = (
    crossed: Array<{
      distance: number;
      message: string;
      reward: number;
    }>
  ) => {
    for (const milestone of crossed) {
      milestoneIdRef.current += 1;

      const reward = MILESTONE_REWARDS_ENABLED
        ? milestone.reward
        : 0;

      if (reward > 0) {
        coinsRef.current += reward;
        setCoins(coinsRef.current);
      }

      milestoneQueueRef.current.push({
        id: milestoneIdRef.current,
        distance: milestone.distance,
        message: milestone.message,
        reward,
      });
    }

    if (!bannerActiveRef.current) {
      showNextMilestone();
    }
  };

  const swipeGesture = useRef(
    Gesture.Pan()
      .minDistance(10)
      .activeOffsetX([-10, 10])
      .activeOffsetY([-10, 10])
      .runOnJS(true)
      .onBegin(() => {
        swipeHandledRef.current = false;
      })
      .onUpdate((event) => {
        if (
          !gameStartedRef.current ||
          pausedRef.current ||
          gameOverRef.current ||
          swipeHandledRef.current
        ) {
          return;
        }

        const dx = event.translationX;
        const dy = event.translationY;

        if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) {
          return;
        }

        const player = playerRef.current;
        if (!player) return;

        swipeHandledRef.current = true;

        // Sounds play only for accepted actions. Rejected swipes (edge
        // of road, already airborne or sliding) stay silent.
        if (Math.abs(dx) > Math.abs(dy)) {
          const moved = dx < 0 ? player.moveLeft() : player.moveRight();

          if (moved) audioManager.playSfx('lane_switch');
        } else if (dy < 0) {
          if (player.jump()) audioManager.playSfx('jump');
        } else if (player.slide()) {
          audioManager.playSfx('slide');
        }
      })
  ).current;

  // Audio lifecycle. Loads sounds in the background, so the first frame
  // is not delayed. Going to the background pauses the game audio, and
  // coming back resumes it unless the game itself is paused.
  useEffect(() => {
    audioManager.initialize();

    // Load saved progress, and keep the Home screen in step with it.
    progressManager.load();
    const unsubscribeProgress = progressManager.subscribe(setProgress);

    missionService.load();
    const unsubscribeMissions = missionService.subscribe(setMissionView);

    characterService.load();
    adventureService.load();
    const unsubscribeCharacters = characterService.subscribe(setCharacterView);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (
          gameStartedRef.current &&
          !pausedRef.current &&
          !gameOverRef.current
        ) {
          audioManager.resume();
        }
      } else {
        audioManager.pause();
      }
    });

    return () => {
      appStateSub.remove();
      unsubscribeProgress();
      unsubscribeMissions();
      unsubscribeCharacters();
      audioManager.dispose();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      gameSessionRef.current += 1;

      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }

      clearCrashTimer();

      disposePlayerPowerAura(playerAuraRef.current);
      playerAuraRef.current = null;

      playerRef.current = null;
      powerUpsRef.current = null;
      obstaclesRef.current = null;
      coinGroupRef.current = null;
      environmentRef.current = null;
      worldEventsRef.current = null;
      trafficRef.current?.dispose();
      trafficRef.current = null;
     

      sceneRef.current = null;
      cameraRef.current = null;
      followCameraRef.current = null;
    };
  }, []);

  // ============================================
  // THREE.JS CONTEXT INITIALIZATION
  // ============================================

  const handleContextCreate = async (gl: any) => {
    const sessionId = ++gameSessionRef.current;

    console.log('[GAME] GL CONTEXT CREATED');

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    console.log(`[GAME] drawing buffer ${width} x ${height}, session ${sessionId}`);
    setInitError(null);

    let world: Awaited<ReturnType<typeof createGameWorld>> | null =
      null;

    try {
      // Use the equipped character. If its model fails to load, fall back
      // to the default runner, so a bad model never blocks the game.
      // The equipped character is read from saved state. Wait for that
      // state first, or a cold start would build the world with Soldier.
      await characterService.load();
      const chosenModels = characterService.getEquippedModelSet();

      try {
        world = await createGameWorld(width, height, chosenModels);
        builtCharacterIdRef.current = characterService.getEquippedCharacter()?.id ?? null;
      } catch (modelError: any) {
        if (chosenModels === undefined) throw modelError;

        console.warn(
          '[CHARACTER] Model failed to load, using the default runner:',
          modelError?.message || modelError
        );

        world = await createGameWorld(width, height, DEFAULT_MODEL_SET);
        builtCharacterIdRef.current = DEFAULT_CHARACTER_ID;
      }

      if (
        !mountedRef.current ||
        sessionId !== gameSessionRef.current
      ) {
        console.warn(
          '[GAME] World finished after the screen left; discarding it.',
          { mounted: mountedRef.current, session: sessionId, current: gameSessionRef.current }
        );
        world.player?.destroy?.();
        return;
      }
const {
  scene,
  camera,
  obstacles,
  coins: coinGroup,
  player,
  environment,
} = world;

sceneRef.current = scene;
cameraRef.current = camera;
obstaclesRef.current = obstacles;
coinGroupRef.current = coinGroup;
playerRef.current = player;
environmentRef.current = environment ?? null;

trafficRef.current = createTrafficManager(scene);

worldEventsRef.current = createWorldEvents({
  fog: scene.fog,
  background: scene.background,
  hemisphere: world.lighting?.hemisphere ?? null,
});

followCameraRef.current = new FollowCamera(camera);
powerUpsRef.current = createPowerUps(scene);

chaseTruckRef.current?.dispose();
chaseTruckRef.current = createChaseTruck(scene);

playerAuraRef.current = player.group
  ? createPlayerPowerAura(player.group)
  : null;

      console.log('[GAME] PLAYER READY');
      console.log('[GAME] POWER-UPS READY');
      console.log('[GAME] PLAYER AURAS READY');

      if (environment) {
        console.log(
          '[ENVIRONMENT] ZONES:',
          environment.zoneNames.join(' → ')
        );
      }

      const renderer = createThreeRenderer(gl);
      renderer.setClearColor(0x87ceeb, 1);

      // Development only: a plain cube must draw before the game scene.
      // If it fails, the GL renderer is at fault, not the game content.
      const selfTest = runRendererSelfTest(renderer);
      console.log('[GAME] RENDERER SELF-TEST:', selfTest);

      if (!selfTest.ok) {
        throw new Error(`Renderer self-test failed: ${selfTest.error}`);
      }

      const clock = new THREE.Clock();

      // Zone road markings are children of their road segments.
      // They must not be moved separately from the zone.
      console.log('[ROAD] Zone-based road scrolling enabled');

      renderer.render(scene, camera);
      gl.endFrameEXP();
      console.log('[GAME] FIRST FRAME PRESENTED');

      if (
        !mountedRef.current ||
        sessionId !== gameSessionRef.current
      ) {
        console.warn(
          '[GAME] Screen left before the first frame; discarding the world.',
          { mounted: mountedRef.current, session: sessionId, current: gameSessionRef.current }
        );
        world.player?.destroy?.();
        return;
      }

      setIsRestarting(false);

      // Development-only: one render summary at frame 90, to show whether
      // the scene is drawing. Costs nothing on later frames.
      let diagnosticFrame = 0;
      let renderErrorLogged = false;

      // Drawing-buffer size the renderer is currently set to. The size is
      // read once at context creation, so this tracks any later change.
      let lastBufferWidth = width;
      let lastBufferHeight = height;

      const animate = () => {
        if (
          !mountedRef.current ||
          sessionId !== gameSessionRef.current
        ) {
          return;
        }

        frameTimer.tick();

        animationFrame.current = requestAnimationFrame(animate);

        const delta = Math.min(clock.getDelta(), 0.05);

        if (__DEV__) {
          // Averages over about half a second, then one state update.
          const perf = perfRef.current;
          perf.time += delta;
          perf.frames += 1;

          if (perf.time >= 0.5) {
            const objects =
              (obstaclesRef.current?.userData.items ?? []).filter((o: any) => o.visible).length +
              (coinGroupRef.current?.userData.coins ?? []).filter((c: any) => c.visible).length;

            setPerfStats({
              fps: perf.frames / perf.time,
              frameMs: (perf.time / perf.frames) * 1000,
              objects,
              speed: worldSpeedRef.current / BASE_WORLD_SPEED,
            });

            perf.time = 0;
            perf.frames = 0;
          }
        }

        if (
          gameStartedRef.current &&
          !pausedRef.current &&
          !gameOverRef.current
        ) {
          elapsedRef.current += delta;

          // Booster multiplier eases toward 1 (normal) or the boost value.
          // The world speed below is the single authoritative speed, so
          // the boost reaches every system through currentWorldSpeed.
          const boostGoal =
            activePowerUpsRef.current.speed > 0
              ? SPEED_BOOST_MULTIPLIER
              : 1;

          boostLevelRef.current +=
            (boostGoal - boostLevelRef.current) *
            (1 - Math.exp(-SPEED_BOOST_RAMP_RATE * delta));

          // Speed follows total run distance, capped, and is then scaled
          // by the booster. It eases toward the target so changes are smooth.
          const targetWorldSpeed =
            getTargetWorldSpeed(distanceRef.current) *
            boostLevelRef.current;

          const speedEasing =
            1 - Math.exp(-SPEED_SMOOTHING_RATE * delta);

          const currentWorldSpeed =
            worldSpeedRef.current +
            (targetWorldSpeed - worldSpeedRef.current) *
              speedEasing;

          worldSpeedRef.current = currentWorldSpeed;

          const difficulty = getDifficultyProfile(
            distanceRef.current
          );

          if (difficulty.index !== difficultyIndexRef.current) {
            difficultyIndexRef.current = difficulty.index;

            console.log(
              `[DIFFICULTY] ${difficulty.label} at ${Math.floor(
                distanceRef.current
              )} m`
            );
          }

          // Road and scenery move together inside the same zone group.
          updateEnvironment(
            environmentRef.current,
            delta,
            currentWorldSpeed
          );
          // Move the complete city group.
// Buildings, trees, street lights, props and signals
// inherit this movement from their parent group.


          // Water ripples use gameplay time, so they stop on pause.
          updateWaterAnimation(environmentRef.current, elapsedRef.current);

          const multiplier =
            activePowerUpsRef.current.multiplier > 0 ? 2 : 1;

          scoreRef.current += 10 * delta * multiplier;
          const previousDistance = distanceRef.current;

          distanceRef.current += currentWorldSpeed * delta;

          // Chase: the truck closes on mistakes and falls back after clean
          // running. Only runs while the game is running, so pauses and
          // Game Over stop it.
          if (chaseModeRef.current) {
            chase.update(delta, getSpeedMultiplier(distanceRef.current));

            if (chase.isCaught()) {
              triggerTruckCatch();
            }
          }

          const levelRun = levelRef.current;
          if (levelRun && distanceRef.current >= levelRun.finishDistance) {
            finishLevel(levelRun);
          }

          // Milestones use the step from last frame to this one, so a
          // large step cannot skip a threshold.
          const crossed = collectCrossedMilestones(
            milestoneTrackerRef.current,
            previousDistance,
            distanceRef.current
          );

          if (crossed.length > 0) {
            enqueueMilestones(crossed);
          }

          worldEventsRef.current?.update(
            delta,
            getActiveZoneName(environmentRef.current),
            difficulty.index
          );

          if (
            elapsedRef.current - lastHudUpdateRef.current >= 0.2
          ) {
            lastHudUpdateRef.current = elapsedRef.current;

            setScore(Math.floor(scoreRef.current));
            setDistance(Math.floor(distanceRef.current));
            setSpeedTier(getSpeedMultiplier(distanceRef.current));

            if (chaseModeRef.current) {
              const nextState = chase.getState();
              const nextDistance = chase.getDistance();

              setChaseView((prev) =>
                prev.state === nextState &&
                Math.abs(prev.distance - nextDistance) < 0.05
                  ? prev
                  : { state: nextState, distance: nextDistance }
              );
            }
            // Mission distance is batched (every 2 s). The run's final
            // distance is also recorded when the run ends.
            if (elapsedRef.current - lastMissionFlushRef.current >= 2) {
              lastMissionFlushRef.current = elapsedRef.current;
              missionService.onRunDistance(runIdRef.current, distanceRef.current);
            }

            // Only touch the power-up state while a power-up is active, or on
            // the tick one ends (to clear its badge).
            const timers = activePowerUpsRef.current;
            const anyActive =
              timers.magnet > 0 ||
              timers.shield > 0 ||
              timers.multiplier > 0 ||
              timers.speed > 0 ||
              timers.fly > 0;

            if (anyActive || powerShownRef.current) {
              setActivePowerUps({ ...timers });
            }

            powerShownRef.current = anyActive;
          }

          const currentTimers = activePowerUpsRef.current;

          activePowerUpsRef.current = {
            magnet: Math.max(0, currentTimers.magnet - delta),
            shield: Math.max(0, currentTimers.shield - delta),
            multiplier: Math.max(
              0,
              currentTimers.multiplier - delta
            ),
            speed: Math.max(0, currentTimers.speed - delta),
            fly: Math.max(0, currentTimers.fly - delta),
          };

          playerRef.current?.setWorldSpeed(currentWorldSpeed);
          playerRef.current?.setFlying?.(activePowerUpsRef.current.fly > 0);
          const motionEvents = playerRef.current?.update(delta) ?? [];

          // Each landing event is a real touchdown from the fixed-step
          // physics, so this plays once per landing.
          for (const motionEvent of motionEvents) {
            if (motionEvent === 'land') {
              audioManager.playSfx('landing');
            }
          }

          updatePlayerPowerAura(
            playerAuraRef.current,
            activePowerUpsRef.current,
            delta
          );

          followCameraRef.current?.setChaseView(chaseModeRef.current);

          followCameraRef.current?.update(
            playerRef.current,
            delta
          );

          if (powerUpsRef.current && playerRef.current?.group) {
            updatePowerUps(
              powerUpsRef.current,
              delta,
              currentWorldSpeed,
              playerRef.current.group,
              collectPowerUp
            );
          }

          if (obstaclesRef.current && playerRef.current) {
            updateObstacles(
              obstaclesRef.current,
              delta,
              currentWorldSpeed,
              playerRef.current,
              handlePlayerHit,
              gameOverRef.current,
              difficulty,
              handleDodge
            );
          }

          // Traffic uses the same hit handler as obstacles, so shield and
          // Game Over behave the same way for both.
          if (trafficRef.current && playerRef.current?.group) {
            trafficRef.current.update({
              delta,
              speed: currentWorldSpeed,
              distance: distanceRef.current,
              zoneName: getActiveZoneName(environmentRef.current),
              obstacles: obstaclesRef.current?.userData.items ?? [],
              playerX: playerRef.current.group.position.x,
              onHit: handlePlayerHit,
              onPass: handleDodge,
            });
          }

          if (
            !gameOverRef.current &&
            coinGroupRef.current &&
            playerRef.current?.group
          ) {
            updateCoins(
              coinGroupRef.current,
              delta,
              currentWorldSpeed,
              playerRef.current.group,
              (amount: number, isKey?: boolean) => {
                if (
                  mountedRef.current &&
                  sessionId === gameSessionRef.current &&
                  !gameOverRef.current
                ) {
                  coinsRef.current += amount;
                  setCoins(coinsRef.current);
                  audioManager.playSfx('coin');
                  missionService.onCoinCollected();

                  if (levelRef.current) {
                    levelCoinsRef.current += 1;
                    setLevelCoins(levelCoinsRef.current);

                    if (isKey) {
                      levelKeysRef.current += 1;
                      setLevelKeys(levelKeysRef.current);
                    }
                  }
                }
              },
              {
                magnetActive:
                  activePowerUpsRef.current.magnet > 0,
              }
            );
          }
        }

        // The truck is placed and animated every frame, outside the running
        // block, so it stays correct while the game is paused.
        if (chaseTruckRef.current) {
          const playerGroup = playerRef.current?.group;
          const catching = runStateRef.current === 'TRUCK_CATCH';

          chaseTruckRef.current.update({
            visible:
              chaseModeRef.current &&
              gameStartedRef.current &&
              (chase.isStarted() || catching) &&
              !!playerGroup,
            playerX: playerGroup?.position.x ?? 0,
            playerZ: playerGroup?.position.z ?? 2,
            chaseDistance: catching ? 0 : chase.getDistance(),
            speed: catching ? TRUCK_CATCH_SPEED : worldSpeedRef.current,
            delta,
            state: catching ? 'CAUGHT' : chase.getState(),
          });
        }

        const frameNumber = diagnosticFrame++;

        // Development only: find any material the device cannot compile.
        if (__DEV__ && frameNumber === 2) {
          probeFailingMaterials(renderer, scene, camera);
        }

        if (__DEV__ && frameNumber === 90) {
          let visibleMeshes = 0;

          scene.traverse((object: any) => {
            if (object.isMesh && object.visible) visibleMeshes++;
          });

          console.log(
            `[RENDER] frame 90: visible meshes ${visibleMeshes}, ` +
              `draw calls ${renderer.info.render.calls}, ` +
              `triangles ${renderer.info.render.triangles}, ` +
              `camera (${camera.position.x.toFixed(1)}, ` +
              `${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`
          );
        }

        // Keep the renderer and camera on the real drawing buffer. If the
        // surface settles to a new size, an unpainted strip would otherwise
        // be left at the edge. Two reads and a compare per frame.
        const bufferWidth = gl.drawingBufferWidth;
        const bufferHeight = gl.drawingBufferHeight;

        if (
          bufferWidth > 0 &&
          bufferHeight > 0 &&
          (bufferWidth !== lastBufferWidth || bufferHeight !== lastBufferHeight)
        ) {
          lastBufferWidth = bufferWidth;
          lastBufferHeight = bufferHeight;

          renderer.setSize(bufferWidth, bufferHeight, false);

          if (camera.aspect !== undefined) {
            camera.aspect = bufferWidth / bufferHeight;
            camera.updateProjectionMatrix();
          }

          if (__DEV__) {
            console.log(`[GAME] drawing buffer resized to ${bufferWidth} x ${bufferHeight}`);
          }
        }

        // A failing frame is logged once, then still presented, so the
        // HUD and the rest of the scene keep updating.
        // Clear first, so a failing pass cannot leave the previous frame
        // (black or purple) on screen. Shadows are a separate pass that
        // runs before the main one, so they are the first thing to switch
        // off if a frame fails.
        try {
          renderer.clear();
          renderer.render(scene, camera);
        } catch (error: any) {
          if (!renderErrorLogged) {
            renderErrorLogged = true;
            renderer.shadowMap.enabled = false;
            console.error(
              '[RENDER] frame failed; shadows switched off as a fallback:',
              error?.message || error,
              '— see [RENDER PROBE] output for the material'
            );
          }

          try {
            renderer.clear();
            renderer.render(scene, camera);
          } catch {
            // Still failing without shadows. The probe output shows which material.
          }
        }

        gl.endFrameEXP();
      };

      animate();
    } catch (error) {
      console.error('[GAME] INITIALIZATION FAILED:', error);

      if (
        world &&
        sessionId === gameSessionRef.current
      ) {
        world.player?.destroy?.();
      }

      if (
        mountedRef.current &&
        sessionId === gameSessionRef.current
      ) {
        setIsRestarting(false);
        setInitError((error as any)?.message || String(error));
      }
    }
  };

  // The GL view is created once. Score and HUD updates re-render this
  // screen about ten times a second, and the handler only uses refs and
  // stable setters, so the first version stays valid.
  const glView = useMemo(
    () => (
      <GLView
        style={styles.gl}
        onContextCreate={handleContextCreate}
      />
    ),
    []
  );

  return (
    <View style={styles.root}>
    <GestureDetector gesture={swipeGesture}>
      <View style={styles.container}>
        <StatusBar hidden />

        {glView}

        {initError && (
          <View style={styles.initErrorPanel}>
            <Text style={styles.initErrorTitle}>GAME FAILED TO START</Text>
            <Text style={styles.initErrorText}>{initError}</Text>
            <Text style={styles.initErrorText}>
              Details are in the Metro console.
            </Text>
          </View>
        )}

        {activeLevel && gameStarted && !gameOver && !levelDone && (
          <View pointerEvents="none" style={styles.levelHud}>
            <Text style={styles.levelHudText}>
              {activeLevel.name} · {activeLevel.objective.type === 'keys' ? levelKeys : levelCoins}/{activeLevel.objective.count} {activeLevel.objective.type === 'keys' ? 'keys' : 'coins'} ·{' '}
              {Math.floor(distance)}/{activeLevel.finishDistance} m
            </Text>
          </View>
        )}

        {gameStarted && !gameOver && !isRestarting && (
          <View
            pointerEvents="box-none"
            style={styles.hudLayer}
          >
            {__DEV__ && gameStarted && <PerfOverlay stats={perfStats} />}

            <GameHUD
              score={score}
              coins={coins}
              distance={distance}
              speedMultiplier={speedTier}
              chaseMode={chaseMode}
              chaseState={chaseView.state}
              chaseDistance={chaseView.distance}
              chaseMax={CHASE_CONFIG.maxDistance}
              paused={isPaused}
              onTogglePause={togglePause}
              onRestart={restartGame}
            />

            <MilestoneBanner
              milestone={milestoneBanner}
              onFinished={showNextMilestone}
            />

            <View
              pointerEvents="none"
              style={styles.powerUpRow}
            >
              {activePowerUps.magnet > 0 && (
                <View
                  style={[styles.powerUpBadge, styles.magnetBadge]}
                >
                  <Text style={styles.powerUpText}>
                    🧲 {activePowerUps.magnet.toFixed(1)}s
                  </Text>
                </View>
              )}

              {activePowerUps.shield > 0 && (
                <View
                  style={[styles.powerUpBadge, styles.shieldBadge]}
                >
                  <Text style={styles.powerUpText}>
                    🛡️ {activePowerUps.shield.toFixed(1)}s
                  </Text>
                </View>
              )}

              {activePowerUps.multiplier > 0 && (
                <View
                  style={[
                    styles.powerUpBadge,
                    styles.multiplierBadge,
                  ]}
                >
                  <Text style={styles.powerUpText}>
                    ✖️ 2 SCORE ·{' '}
                    {activePowerUps.multiplier.toFixed(1)}s
                  </Text>
                </View>
              )}

              {activePowerUps.fly > 0 && (
                <View style={[styles.powerUpBadge, styles.flyBadge]}>
                  <Text style={styles.powerUpText}>
                    ✈ SKY FLYER {activePowerUps.fly.toFixed(1)}s
                  </Text>
                </View>
              )}

              {activePowerUps.speed > 0 && (
                <View style={[styles.powerUpBadge, styles.speedBadge]}>
                  <Text style={styles.powerUpText}>
                    ⚡ SPEED {activePowerUps.speed.toFixed(1)}s
                  </Text>
                  <View style={styles.speedBarTrack}>
                    <View
                      style={[
                        styles.speedBarFill,
                        {
                          width: `${Math.min(
                            100,
                            (activePowerUps.speed / SPEED_BOOST_DURATION) * 100
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {!gameStarted && !gameOver && !isRestarting && (
          <View
            style={[
              styles.welcomeOverlay,
              {
                paddingTop: Math.max(64, insets.top + 16),
                paddingBottom: Math.max(24, insets.bottom + 8),
              },
            ]}
          >
            <View style={styles.welcomeTop}>
              <Text style={styles.welcomeEyebrow}>
                YOUR NEXT ADVENTURE
              </Text>

              <Text style={styles.welcomeTitle}>
                ENDLESS RUNNER
              </Text>

              <Text style={styles.welcomeSubtitle}>
                Run fast. Dodge obstacles. Collect coins.
              </Text>

              {activeLevel && (
                <View style={styles.levelBriefing}>
                  <Text style={styles.levelBriefingTitle}>
                    ADVENTURE · {activeLevel.name}
                  </Text>
                  <Text style={styles.levelBriefingText}>
                    Collect {activeLevel.objective.count} {activeLevel.objective.type === 'keys' ? 'keys' : 'coins'}, then reach the finish at{' '}
                    {activeLevel.finishDistance} m.
                  </Text>
                  <Text style={styles.levelBriefingText}>
                    Reward: {activeLevel.reward.coins} coins on first completion · {activeLevel.difficulty}
                  </Text>
                </View>
              )}

              <Text style={styles.welcomeStats}>
                BEST {progress.bestScore.toLocaleString()} · COINS{' '}
                {progress.totalCoins.toLocaleString()}
              </Text>
            </View>

            <View style={styles.characterInfo}>
              <Text style={styles.characterEmoji}>🪖</Text>

              <Text style={styles.characterName}>
                YOUR RUNNER
              </Text>

              <Text style={styles.characterDescription}>
                Soldier ready for the mission
              </Text>
            </View>

            <View style={styles.welcomeBottom}>
              <Pressable
                onPress={toggleChaseMode}
                style={({ pressed }) => [
                  styles.authButton,
                  pressed && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Toggle chase mode"
              >
                <Text style={styles.authButtonText}>
                  {chaseMode ? '🚚 MODE: CHASE' : '🏁 MODE: CLASSIC'}
                </Text>
              </Pressable>

              <Pressable
                onPress={startGame}
                style={({ pressed }) => [
                  styles.startButton,
                  pressed && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Start game"
              >
                <Text style={styles.startButtonText}>
                  ▶ START GAME
                </Text>
              </Pressable>

              {/* Settings is only offered before a run starts, so it can
                  never open over active gameplay. */}
              <View style={styles.menuGrid}>
                <Pressable
                  onPress={() => router.push('/settings')}
                  style={({ pressed }) => [
                    styles.menuTile,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open settings"
                >
                  <Text style={styles.menuTileText}>⚙ SETTINGS</Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowMissions(true)}
                  style={({ pressed }) => [
                    styles.menuTile,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open missions"
                >
                  <Text style={styles.menuTileText}>🎯 MISSIONS</Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowAdventureMap(true)}
                  style={({ pressed }) => [
                    styles.menuTile,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open adventure map"
                >
                  <Text style={styles.menuTileText}>🗺 ADVENTURE</Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowCharacters(true)}
                  style={({ pressed }) => [
                    styles.menuTile,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open characters"
                >
                  <Text style={styles.menuTileText} numberOfLines={1}>
                    🪖 CHARACTERS
                  </Text>
                  {characterView && (
                    <Text style={styles.menuTileSubText} numberOfLines={1}>
                      {characterView.characters.find((c: any) => c.id === characterView.equippedId)?.name ?? ''}
                    </Text>
                  )}
                </Pressable>
              </View>

              {missionView && (
                <Text style={styles.welcomeStats}>
                  DAILY {missionView.completedDaily}/{missionView.daily.length} DONE
                  {missionView.readyToClaim > 0
                    ? ` · ${missionView.readyToClaim} TO CLAIM`
                    : ''}
                </Text>
              )}

              <View style={styles.authCard}>
                {googleLoading ? (
                  <ActivityIndicator size="small" color="#65dfd0" />
                ) : googleUser ? (
                  <>
                    <Text style={styles.authText}>
                      Welcome, {googleUser.user.name ?? 'Runner'}
                    </Text>

                    <Pressable
                      onPress={() => void signOut()}
                      style={({ pressed }) => [
                        styles.authButton,
                        pressed && styles.buttonPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Sign out of Google"
                    >
                      <Text style={styles.authButtonText}>SIGN OUT</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => void signIn()}
                    style={({ pressed }) => [
                      styles.authButton,
                      pressed && styles.buttonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in with Google"
                  >
                    <Text style={styles.authButtonText}>
                      G  SIGN IN WITH GOOGLE
                    </Text>
                  </Pressable>
                )}

                {googleError && (
                  <Text style={styles.authError}>{googleError}</Text>
                )}
              </View>

              <Text style={styles.welcomeFooter}>
                READY, RUNNER? YOUR MISSION STARTS NOW.
              </Text>

              <AdBanner />
            </View>
          </View>
        )}

        {crashFlash && (
          <View
            pointerEvents="none"
            style={styles.crashFlash}
          />
        )}

        {levelDone && (
          <View style={styles.gameOverOverlay}>
            <View style={styles.gameOverCard}>
              <Text style={styles.eyebrow}>ADVENTURE</Text>

              <Text style={styles.gameOverTitle}>
                {levelDone.status === 'saving'
                  ? 'SAVING…'
                  : levelDone.status === 'error'
                    ? 'NOT SAVED'
                    : 'LEVEL COMPLETE'}
              </Text>

              <Text style={styles.subtitle}>{levelDone.level.name}</Text>

              {levelDone.status === 'done' && (
                <View style={styles.finalScoreCard}>
                  <Text style={styles.finalScore}>
                    {'★'.repeat(levelDone.result.stars)}
                    {'☆'.repeat(3 - levelDone.result.stars)}
                  </Text>

                  <Text style={styles.newBestBadge}>
                    {levelDone.result.firstCompletion
                      ? `+${levelDone.result.rewardCoins} coins reward`
                      : 'Reward already claimed'}
                  </Text>
                </View>
              )}

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>COINS</Text>
                  <Text style={styles.statValue}>
                    {levelDone.coins}/{levelDone.level.objective.count}
                  </Text>
                </View>

                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>DISTANCE</Text>
                  <Text style={styles.statValue}>
                    {levelDone.distance.toLocaleString()} m
                  </Text>
                </View>
              </View>

              {levelDone.status === 'error' && (
                <Text style={styles.subtitle}>
                  Progress could not be saved. Try again from the map.
                </Text>
              )}

              <Pressable
                onPress={restartGame}
                style={({ pressed }) => [styles.restartButton, pressed && styles.buttonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Retry level"
              >
                <Text style={styles.restartText}>↻ RETRY LEVEL</Text>
              </Pressable>

              {levelDone.status === 'done' && (
                <Text style={styles.subtitle}>
                  Objective complete: {levelDone.level.objective.type === 'keys' ? levelDone.keys : levelDone.coins} of {levelDone.level.objective.count} {levelDone.level.objective.type === 'keys' ? 'keys' : 'coins'}
                </Text>
              )}

              {levelDone.status === 'done' &&
                levelDone.result?.firstCompletion &&
                nextAdventureLevel(levelDone.level.id)?.playable && (
                  <Text style={styles.subtitle}>
                    Unlocked: {nextAdventureLevel(levelDone.level.id)?.name}
                  </Text>
                )}

              {levelDone.status === 'done' && (
                <Pressable
                  onPress={continueAfterLevel}
                  style={({ pressed }) => [styles.levelActionButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                >
                  <Text style={styles.levelActionText}>▶ CONTINUE</Text>
                </Pressable>
              )}

              <Pressable
                onPress={levelSelectAfterComplete}
                style={({ pressed }) => [styles.levelActionButton, pressed && styles.buttonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Open level select"
              >
                <Text style={styles.levelActionText}>🗺 LEVEL SELECT</Text>
              </Pressable>
            </View>
          </View>
        )}

        {gameOver && (
          <View
            style={[
              styles.gameOverOverlay,
              {
                // Safe-area insets are applied once, here on the overlay.
                paddingTop: insets.top + 12,
                paddingBottom: insets.bottom + 12,
              },
            ]}
          >
            <View style={styles.gameOverCard}>
              <ScrollView
                style={styles.gameOverBody}
                contentContainerStyle={styles.gameOverBodyContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.runOverBadge}>
                  <Text style={styles.runOverBadgeText}>RUN OVER</Text>
                </View>

                <Text style={styles.gameOverTitle}>
                  GAME OVER
                </Text>

                <Text style={styles.subtitle}>
                  {levelFailNote ?? gameOverReason ?? 'You hit an obstacle or traffic!'}
                </Text>

                <View style={styles.finalScoreCard}>
                  <Text style={styles.scoreLabel}>
                    FINAL SCORE
                  </Text>

                  <Text style={styles.finalScore}>
                    {score.toLocaleString()}
                  </Text>

                  {runResult?.newBest ? (
                    <Text style={styles.newBestBadge}>★ NEW BEST SCORE</Text>
                  ) : (
                    <Text style={styles.bestHint}>
                      Best {progress.bestScore.toLocaleString()}
                    </Text>
                  )}
                </View>

                <View style={styles.scoreGrid}>
                  <View style={styles.scoreTile}>
                    <Text style={styles.scoreTileEmoji}>🪙</Text>
                    <Text style={styles.scoreTileValue}>
                      {coins.toLocaleString()}
                    </Text>
                    <Text style={styles.scoreTileLabel}>RUN COINS</Text>
                  </View>

                  <View style={styles.scoreTile}>
                    <Text style={styles.scoreTileEmoji}>🏃</Text>
                    <Text style={styles.scoreTileValue}>
                      {distance.toLocaleString()} m
                    </Text>
                    <Text style={styles.scoreTileLabel}>DISTANCE</Text>
                  </View>

                  <View style={styles.scoreTile}>
                    <Text style={styles.scoreTileEmoji}>💰</Text>
                    <Text style={styles.scoreTileValue}>
                      {progress.totalCoins.toLocaleString()}
                    </Text>
                    <Text style={styles.scoreTileLabel}>SAVED COINS</Text>
                  </View>

                  <View style={styles.scoreTile}>
                    <Text style={styles.scoreTileEmoji}>🏆</Text>
                    <Text style={styles.scoreTileValue}>
                      {progress.bestScore.toLocaleString()}
                    </Text>
                    <Text style={styles.scoreTileLabel}>BEST SCORE</Text>
                  </View>
                </View>

              </ScrollView>

              <View style={styles.gameOverFooter}>
                {!reviveUsed && (
                  <Pressable
                    onPress={() => {
                      requestReveal();
                    }}
                    style={({ pressed }) => [
                      styles.reviveButton,
                      pressed && styles.buttonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Watch an ad to revive"
                  >
                    <Text style={styles.reviveButtonText}>
                      ▶ WATCH AD TO REVIVE
                    </Text>
                  </Pressable>
                )}

                {reviveMessage && (
                  <Text style={styles.authError}>{reviveMessage}</Text>
                )}

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => runAfterInterstitial(restartGame)}
                    style={({ pressed }) => [
                      styles.restartButton,
                      styles.actionFlex,
                      pressed && styles.buttonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Restart game"
                  >
                    <Text style={styles.restartText}>
                      ↻ RESTART
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => runAfterInterstitial(goHome)}
                    style={({ pressed }) => [
                      styles.homeButton,
                      styles.actionFlex,
                      pressed && styles.buttonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Return to home"
                  >
                    <Text style={styles.homeButtonText}>⌂ HOME</Text>
                  </Pressable>
                </View>

                <Text style={styles.footerText}>
                  Stay alert and try again!
                </Text>

                <AdBanner />
              </View>
            </View>
          </View>
        )}

        {showCharacters && (
          <View style={styles.adventureMapOverlay}>
            <CharactersScreen onClose={closeCharacters} />
          </View>
        )}

        {showMissions && (
          <View style={styles.adventureMapOverlay}>
            <MissionsScreen onClose={() => setShowMissions(false)} />
          </View>
        )}


        {isRestarting && (
          <View
            style={styles.restartLoadingOverlay}
            pointerEvents="auto"
          >
            <ActivityIndicator size="large" color="#65dfd0" />

            <Text style={styles.loadingTitle}>
              GETTING READY
            </Text>

            <Text style={styles.loadingSubtitle}>
              Preparing your next run...
            </Text>
          </View>
        )}
      </View>
    </GestureDetector>

    {/* Outside the swipe gesture, so the Adventure list can scroll. */}
        {showAdventureMap && (
          <View style={styles.adventureMapOverlay}>
            {adventureNotice && (
              <Text
                style={{
                  position: 'absolute',
                  top: insets.top + 8,
                  left: 16,
                  right: 16,
                  zIndex: 400,
                  color: '#ffca28',
                  fontSize: 12,
                  fontWeight: '800',
                  textAlign: 'center',
                }}
              >
                {adventureNotice}
              </Text>
            )}
            <AdventureMapScreen onClose={closeAdventureMap} />
          </View>
        )}
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: '#08172b',
  },

  gl: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },

  adventureMapOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
    elevation: 300,
  },

  levelHud: {
    position: 'absolute',
    top: 96,
    left: 12,
    right: 12,
    zIndex: 18,
    elevation: 18,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(5, 12, 25, 0.7)',
  },

  levelHudText: {
    color: '#ffca28',
    fontSize: 13,
    fontWeight: '800',
  },

  levelBriefing: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 202, 40, 0.4)',
    backgroundColor: 'rgba(12, 24, 43, 0.85)',
    gap: 4,
  },

  levelBriefingTitle: {
    color: '#ffca28',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  levelBriefingText: {
    color: '#e2e8f0',
    fontSize: 13,
    textAlign: 'center',
  },

  levelActionButton: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

  levelActionText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  initErrorPanel: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    elevation: 30,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(8, 23, 43, 0.96)',
  },

  initErrorTitle: {
    color: '#ffca28',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },

  initErrorText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },

  hudLayer: {
   ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
  },

  powerUpRow: {
    position: 'absolute',
    top: 105,
    left: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },

  powerUpBadge: {
    marginHorizontal: 4,
    marginVertical: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(8, 15, 30, 0.9)',
  },

  magnetBadge: {
    borderColor: '#39a9ff',
  },

  shieldBadge: {
    borderColor: '#45fff0',
  },

  multiplierBadge: {
    borderColor: '#ffc928',
  },

  powerUpText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },

  welcomeOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 150,
    elevation: 150,
    backgroundColor: 'rgba(5, 15, 32, 0.50)',
    paddingHorizontal: 22,
    paddingTop: 64,
    paddingBottom: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  welcomeTop: {
    width: '100%',
    alignItems: 'center',
  },

  welcomeEyebrow: {
    color: '#65dfd0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },

  welcomeTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 1,
  },

  welcomeSubtitle: {
    color: '#e0e9f5',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 9,
  },

  characterInfo: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 20,
    backgroundColor: 'rgba(17, 36, 59, 0.82)',
    borderColor: 'rgba(101, 223, 208, 0.65)',
    borderWidth: 1,
  },

  characterEmoji: {
    fontSize: 32,
  },

  characterName: {
    color: '#ffcf42',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 5,
  },

  characterDescription: {
    color: '#d1dbea',
    fontSize: 11,
    marginTop: 5,
  },

  welcomeBottom: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },

  menuGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },

  menuTile: {
    width: '48%',
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 24, 43, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },

  menuTileText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },

  menuTileSubText: {
    color: '#ffcf42',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },

  startButton: {
    width: '100%',
    borderRadius: 17,
    paddingVertical: 17,
    alignItems: 'center',
    backgroundColor: '#ffca28',
    borderWidth: 1,
    borderColor: '#fff0a6',
    elevation: 8,
  },

  welcomeStats: {
    color: '#ffda58',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },

  newBestBadge: {
    marginTop: 8,
    color: '#172033',
    backgroundColor: '#ffca28',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    overflow: 'hidden',
  },



  homeButton: {
    width: '100%',
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    backgroundColor: '#223b58',
    borderWidth: 1.5,
    borderColor: '#65dfd0',
  },

  homeButtonText: {
    color: '#65dfd0',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },


  startButtonText: {
    color: '#172033',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1,
  },

  authCard: {
    width: '100%',
    alignItems: 'center',
  },

  authText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },

  authButton: {
    width: '100%',
    borderRadius: 17,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(12, 24, 43, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(101, 223, 208, 0.6)',
  },

  authButtonText: {
    color: '#65dfd0',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },

  authError: {
    color: '#ffca28',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },

  welcomeFooter: {
    color: '#d1dbea',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 13,
  },

  crashFlash: {
  ...StyleSheet.absoluteFill,
    zIndex: 250,
    elevation: 250,
    backgroundColor: 'rgba(255, 25, 25, 0.32)',
  },

  gameOverOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
    elevation: 200,
    backgroundColor: 'rgba(5, 12, 25, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 20,
  },

  gameOverBody: {
    width: '100%',
    flexShrink: 1,
  },

  gameOverBodyContent: {
    alignItems: 'center',
    paddingBottom: 4,
  },

  gameOverFooter: {
    width: '100%',
    marginTop: 12,
  },

  gameOverCard: {
    width: '100%',
    maxWidth: 370,
    flexShrink: 1,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 20,
    alignItems: 'center',
    backgroundColor: '#172840',
    borderWidth: 1.5,
    borderColor: '#526d8b',
  },

  eyebrow: {
    color: '#65dfd0',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },

  gameOverTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 16,
    letterSpacing: 1,
  },

  subtitle: {
    color: '#d1dbea',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },

  finalScoreCard: {
    width: '100%',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: '#223b58',
    borderWidth: 1,
    borderColor: '#526d8b',
  },

  scoreLabel: {
    color: '#d1dbea',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },

  finalScore: {
    color: '#ffcf42',
    fontSize: 44,
    fontWeight: '900',
    marginTop: 6,
  },

  statsRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 15,
    marginBottom: 22,
  },

  statCard: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 17,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#20334b',
  },


  statLabel: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: '800',
    color: '#d1dbea',
  },

  statValue: {
    marginTop: 5,
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
  },

  runOverBadge: {
    alignSelf: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ff5252',
    backgroundColor: 'rgba(255, 82, 82, 0.16)',
  },
  runOverBadgeText: {
    color: '#ff8a80',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  bestHint: {
    marginTop: 8,
    color: '#9fb3cc',
    fontSize: 12,
    fontWeight: '700',
  },
  scoreGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginTop: 16,
    marginBottom: 18,
  },
  scoreTile: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#20334b',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  scoreTileEmoji: {
    fontSize: 20,
  },
  scoreTileValue: {
    marginTop: 4,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  scoreTileLabel: {
    marginTop: 3,
    color: '#9fb3cc',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },

  reviveButton: {
    width: '100%',
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#65dfd0',
  },

  reviveButtonText: {
    color: '#172033',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  actionFlex: {
    flex: 1,
    marginTop: 0,
  },
  flyBadge: {
    borderColor: '#7fe9ff',
    backgroundColor: 'rgba(0, 179, 255, 0.35)',
  },

  speedBadge: {
    borderColor: '#3df5ff',
    backgroundColor: 'rgba(0, 150, 255, 0.35)',
  },

  speedBarTrack: {
    width: 110,
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },

  speedBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3df5ff',
  },

  restartButton: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    backgroundColor: '#ffca28',
  },

  restartText: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  footerText: {
    marginTop: 16,
    fontSize: 12,
    color: '#bdcbe0',
    textAlign: 'center',
  },

  restartLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
    elevation: 300,
    backgroundColor: '#08172b',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 20,
  },

  loadingSubtitle: {
    color: '#bdcbe0',
    fontSize: 12,
    marginTop: 8,
  },

  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
});
