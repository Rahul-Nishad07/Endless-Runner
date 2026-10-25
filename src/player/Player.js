
import * as THREE from 'three';
import { Asset } from 'expo-asset';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withTimeout } from '../utils/Timeout';
import '../game/utils/ThreeNativePatch';
import { PlayerAnimation } from './PlayerAnimation';
import { DEFAULT_MODEL_SET } from '../characters/CharacterModels';
import {
  JUMP_AIR_DURATION,
  getDodgeLean,
  getJumpPitch,
} from './StuntPose';
import {
  advanceMotion,
  createMotionState,
  JUMP_VELOCITY,
  startJump,
  startSlide,
} from './JumpPhysics';
import {
  BASE_WORLD_SPEED,
  LANE_WIDTH,
} from '../game/GameConfig';

// ========================================
// CONFIGURATION
// ========================================

const MODEL_LOAD_TIMEOUT_MS = 20000;
const ROOT_BONE_TRACK = 'mixamorig:Hips.position';

const RUN_CADENCE_SMOOTHING = 3;
const MIN_LANE = -1;
const MAX_LANE = 1;
const RUN_ANIMATION_SPEED = 1.3;
const LANE_SMOOTHING = 18;
const INPUT_BUFFER_SECONDS = 0.15;
const TARGET_HEIGHT = 0.32;

const RUN_CADENCE_DISTANCE_STEP = 500;
const RUN_CADENCE_DISTANCE_INCREASE = 0.15;

const NEON_ACCENT_COLOR = 0x00cfff;
const NEON_GLOW_COLOR = 0x007dff;
const NEON_TEXTURE_TINT_STRENGTH = 0.18;
const NEON_EMISSIVE_INTENSITY = 0.22;
const NEON_MATERIAL_PATTERN =
  /armor|armour|vest|suit|helmet|body|shoulder|pad/i;

const SLIDE_HEIGHT_SCALE = 0.62;
const SLIDE_WIDTH_SCALE = 1.04;
const SLIDE_LOWER_OFFSET = 0.035;

const JUMP_FORWARD_TILT = -0.08;
const SLIDE_FORWARD_TILT = 0.28;

const POSE_SMOOTH_SPEED = 26;
const POSE_BLEND_SPEED = 14;

const JUMP_KNEE = 1.1;
const FALL_KNEE = 0.3;
const SLIDE_KNEE = 1.7;
const LAND_KNEE = 0.6;
const LAND_DURATION = 0.12;

const JUMP_ELBOW = -1.6;
const FALL_ELBOW = -1.2;
const SLIDE_ELBOW = -1.5;

const IMPACT_DURATION = 0.45;
const IMPACT_KNEE = 0.9;
const IMPACT_ELBOW = -1.0;
const IMPACT_TILT = -0.45;

const clampUnit = (value) =>
  Math.min(1, Math.max(0, value));

// ========================================
// ROOT MOTION CORRECTION
// ========================================

function stripHorizontalRootMotion(clip) {
  for (const track of clip.tracks) {
    if (track.name !== ROOT_BONE_TRACK) continue;

    const values = track.values;
    const count = values.length / 3;

    if (!count) continue;

    let sumX = 0;
    let sumZ = 0;

    for (let i = 0; i < count; i++) {
      sumX += values[i * 3];
      sumZ += values[i * 3 + 2];
    }

    const avgX = sumX / count;
    const avgZ = sumZ / count;

    for (let i = 0; i < count; i++) {
      values[i * 3] = avgX;
      values[i * 3 + 2] = avgZ;
    }
  }
}

// ========================================
// NAVIGATOR COMPATIBILITY
// ========================================

function ensureNavigatorUserAgent() {
  if (typeof navigator === 'undefined') return;

  if (typeof navigator.userAgent !== 'string') {
    try {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: 'React Native',
      });
    } catch (error) {
      console.warn(
        '[PLAYER] Could not define navigator.userAgent:',
        error?.message || error
      );
    }
  }

  if (typeof navigator.userAgent !== 'string') {
    throw new Error(
      'GLTFLoader compatibility issue: navigator.userAgent is not a string.'
    );
  }
}

// ========================================
// PLAYER CLASS
// ========================================

export default class Player {
  constructor() {
    this.worldSpeed = BASE_WORLD_SPEED;
    this.runCadenceSpeed = BASE_WORLD_SPEED;
    this.runCadence = 1;
    this.runDistance = 0;

    this.group = new THREE.Group();
    this.group.name = 'RunnerPlayer';

    this.currentLane = 0;
    this.targetX = 0;
    this.baseY = 0;

    // Normal jump and slide physics.
    this.motion = createMotionState();
    this.bufferedInput = null;

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    this.animationController = null;

    this.animationNames = {
      idle: null,
      run: null,
      jump: null,
      slide: null,
      fall: null,
      land: null,
    };

    this.loaded = false;
    this.destroyed = false;

    this.normalScale = new THREE.Vector3(1, 1, 1);
    this.targetScale = new THREE.Vector3(1, 1, 1);

    this.normalModelPosition = new THREE.Vector3();
    this.targetModelPosition = new THREE.Vector3();

    this.normalModelRotation = new THREE.Euler();
    this.targetModelRotation = new THREE.Euler();

    this.poseInitialized = false;
    this.poseBones = null;

    this.pose = {
      weight: 0,
      knee: 0,
      elbow: 0,
    };

    this.landTimer = 0;
    this._targetQuat = new THREE.Quaternion();
    this._axisX = new THREE.Vector3(1, 0, 0);
    this.impactTimer = 0;
  }

  // ========================================
  // IMPACT
  // ========================================

  triggerImpact() {
    this.impactTimer = IMPACT_DURATION;
  }

  // ========================================
  // LOAD PLAYER MODEL
  // ========================================

  async load(modelSet = DEFAULT_MODEL_SET) {
    try {
      console.log('=============================');
      console.log('LOADING PLAYER MODEL:', modelSet.names.gltf);
      console.log('=============================');

      const sources = modelSet.glb
        ? [[modelSet.names.gltf, modelSet.glb]]
        : [
            [modelSet.names.gltf, modelSet.gltf],
            [modelSet.names.bin, modelSet.bin],
            [modelSet.names.baseColor, modelSet.baseColor],
            [modelSet.names.normal, modelSet.normal],
          ];

      const downloads = sources.map(([name, module]) => [
        name,
        Asset.fromModule(module),
      ]);

      await withTimeout(
        Promise.all(
          downloads.map(([, asset]) => asset.downloadAsync())
        ),
        MODEL_LOAD_TIMEOUT_MS,
        `Model download (${modelSet.names.gltf})`
      );

      if (this.destroyed) return this;

      const assetMap = {};

      for (const [name, asset] of downloads) {
        assetMap[name] = asset.localUri || asset.uri;
      }

      for (const [filename, uri] of Object.entries(assetMap)) {
        if (typeof uri !== 'string' || !uri.length) {
          throw new Error(`Invalid local URI for ${filename}`);
        }

        console.log(`[PLAYER ASSET] ${filename}:`, uri);
      }

      globalThis.__THREE_ASSET_MAP = {
        ...(globalThis.__THREE_ASSET_MAP || {}),
        ...assetMap,
      };

      const manager = new THREE.LoadingManager();

      manager.setURLModifier((url) => {
        if (typeof url !== 'string') {
          throw new TypeError(
            `URL modifier received a non-string URL: ${String(url)}`
          );
        }

        let decodedUrl = url;

        try {
          decodedUrl = decodeURIComponent(url);
        } catch {
          // Keep the original URL if decoding fails.
        }

        const cleanUrl = decodedUrl.split(/[?#]/)[0];
        const filename = cleanUrl.split('/').pop();

        return globalThis.__THREE_ASSET_MAP?.[filename] || url;
      });

      ensureNavigatorUserAgent();

      const loader = new GLTFLoader(manager);

      const gltf = await withTimeout(
        new Promise((resolve, reject) => {
          loader.load(
            assetMap[modelSet.names.gltf],
            resolve,
            undefined,
            reject
          );
        }),
        MODEL_LOAD_TIMEOUT_MS,
        `Model parse (${modelSet.names.gltf})`
      );

      if (this.destroyed) return this;

      if (!gltf?.scene) {
        throw new Error('GLTF loading completed without a valid scene.');
      }

      // ========================================
      // MODEL SETUP
      // ========================================

      this.model = gltf.scene;
      this.model.name = 'OriginalSoldierModel';

      const bounds = new THREE.Box3().setFromObject(this.model);
      const size = new THREE.Vector3();

      bounds.getSize(size);

      console.log('[PLAYER] ORIGINAL MODEL SIZE:', {
        width: size.x,
        height: size.y,
        depth: size.z,
      });

      if (size.y > 0) {
        this.model.scale.setScalar(TARGET_HEIGHT / size.y);
      }

      const scaledBounds = new THREE.Box3().setFromObject(this.model);
      const center = new THREE.Vector3();

      scaledBounds.getCenter(center);

      this.model.position.x -= center.x;
      this.model.position.z -= center.z;
      this.model.position.y -= scaledBounds.min.y;

      this.normalScale.copy(this.model.scale);
      this.targetScale.copy(this.normalScale);

      this.normalModelPosition.copy(this.model.position);
      this.targetModelPosition.copy(this.normalModelPosition);

      this.normalModelRotation.copy(this.model.rotation);
      this.targetModelRotation.copy(this.normalModelRotation);

      this.poseInitialized = true;

      // Bones used for jump, fall, landing and slide poses.
      const bone = (name) =>
        this.model.getObjectByName(`mixamorig:${name}`);

      this.poseBones = {
        legs: [
          bone('LeftLeg'),
          bone('RightLeg'),
        ].filter(Boolean),

        elbows: [
          bone('LeftForeArm'),
          bone('RightForeArm'),
        ].filter(Boolean),
      };

      // ========================================
      // MATERIALS AND TEXTURES
      // ========================================

      this.model.traverse((object) => {
        if (!object.isMesh) return;

        object.castShadow = true;
        object.receiveShadow = true;

        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        materials.forEach((material) => {
          if (!material) return;

          console.log('[PLAYER MATERIAL]', material.name);

          const tint = modelSet.tint?.[material.name];

          if (tint !== undefined && material.color) {
            material.color.set(tint);
          }

          if (material.map) {
            material.map.colorSpace = THREE.SRGBColorSpace;
            material.map.needsUpdate = true;
          }

          material.needsUpdate = true;
        });
      });

      this.group.add(this.model);

      // ========================================
      // SKELETAL ANIMATIONS
      // ========================================

      if (gltf.animations?.length) {
        this.mixer = new THREE.AnimationMixer(this.model);

        gltf.animations.forEach((clip) => {
          stripHorizontalRootMotion(clip);
          this.actions[clip.name] = this.mixer.clipAction(clip);
        });

        const clips = gltf.animations;

        this.animationNames.idle =
          clips.find((clip) => /idle|standing/i.test(clip.name))
            ?.name || null;

        this.animationNames.run =
          clips.find((clip) => /run|running|walk|walking/i.test(clip.name))
            ?.name || clips[0]?.name || null;

        this.animationNames.jump =
          clips.find((clip) => /jump|jumping|leap/i.test(clip.name))
            ?.name || null;

        this.animationNames.slide =
          clips.find((clip) => /slide|sliding|crouch|duck/i.test(clip.name))
            ?.name || null;

        this.animationNames.fall =
          clips.find((clip) => /fall|falling|airborne/i.test(clip.name))
            ?.name || null;

        this.animationNames.land =
          clips.find((clip) => /land|landing/i.test(clip.name))
            ?.name || null;

        console.log(
          '[PLAYER] AVAILABLE ANIMATIONS:',
          clips.map((clip) => ({
            name: clip.name,
            duration: clip.duration,
          }))
        );

        console.log('[PLAYER] ANIMATION MAP:', this.animationNames);

        if (this.animationNames.run) {
          this.playAnimation(this.animationNames.run, {
            loop: true,
            fadeDuration: 0,
          });
        }
      } else {
        console.warn('[PLAYER] NO ANIMATIONS FOUND');
      }

      this.animationController = new PlayerAnimation(this.model);
      this.loaded = true;

      this.setPosition(0, 0, 2);

      console.log('[PLAYER] ORIGINAL SOLDIER LOADED');

      return this;
    } catch (error) {
      console.error(
        '[PLAYER MODEL LOAD FAILED]',
        error?.message || error
      );

      this.loaded = false;
      throw error;
    }
  }

  // ========================================
  // POSITION
  // ========================================

  setPosition(x, y, z) {
    this.baseY = y;

    const lane = THREE.MathUtils.clamp(
      Math.round(x / LANE_WIDTH),
      MIN_LANE,
      MAX_LANE
    );

    this.currentLane = lane;
    this.targetX = lane * LANE_WIDTH;

    this.group.position.set(x, y, z);
  }

  // ========================================
  // LANE CONTROLS
  // ========================================

  moveLeft() {
    return this.setLane(this.currentLane - 1);
  }

  moveRight() {
    return this.setLane(this.currentLane + 1);
  }

  setLane(lane) {
    const safeLane = THREE.MathUtils.clamp(
      Math.round(lane),
      MIN_LANE,
      MAX_LANE
    );

    if (safeLane === this.currentLane) return false;

    this.currentLane = safeLane;
    this.targetX = safeLane * LANE_WIDTH;

    if (__DEV__) {
      console.log(
        '[PLAYER LANE]',
        this.currentLane,
        'TARGET X:',
        this.targetX
      );
    }

    return true;
  }

  // ========================================
  // ANIMATION TRANSITIONS
  // ========================================

  playAnimation(name, options = {}) {
    const nextAction = this.actions[name];

    if (!nextAction) return;

    // If this action is already active, don't reset its playback.
    if (nextAction === this.activeAction) {
      nextAction.paused = false;
      return;
    }

    const {
      loop = true,
      fadeDuration = 0.15,
    } = options;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.paused = false;
    nextAction.setEffectiveWeight(1);

    nextAction.setEffectiveTimeScale(
      name === this.animationNames.run
        ? RUN_ANIMATION_SPEED * this.runCadence
        : 1
    );

    nextAction.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1
    );

    nextAction.clampWhenFinished = !loop;
    nextAction.play();

    if (this.activeAction) {
      this.activeAction.crossFadeTo(
        nextAction,
        fadeDuration,
        true
      );
    }

    this.activeAction = nextAction;
  }

  playAnimationState(state) {
    let name = this.animationNames[state];

    // Never substitute the run cycle for a missing jump animation.
    // The procedural airborne pose will handle the jump instead.
   // Do not use the running cycle when no slide animation exists.
if (state === 'slide' && !name) {
  const runAction = this.actions[this.animationNames.run];

  if (runAction) {
    runAction.paused = true;
  }

  return;
}

// Keep the existing fallback for fall.
if (state === 'fall' && !name) {
  name = this.animationNames.run;
}

    // Keep the existing fallback for slide/fall when those clips
    // are unavailable.
    if (
      !name &&
      (state === 'slide' || state === 'fall')
    ) {
      name = this.animationNames.run;
    }

    if (!name) return;

    this.playAnimation(name, {
      loop: true,
      fadeDuration: 0.12,
    });
  }

  // Resume the run cycle smoothly after landing or sliding.
  resumeRunAnimation() {
    const runName = this.animationNames.run;
    const runAction = this.actions[runName];

    if (!runName || !runAction) return;

    runAction.paused = false;

    runAction.setEffectiveTimeScale(
      RUN_ANIMATION_SPEED * this.runCadence
    );

    if (this.activeAction !== runAction) {
      this.playAnimation(runName, {
        loop: true,
        fadeDuration: 0.14,
      });
    }
  }

  // ========================================
  // JUMP AND SLIDE STATE
  // ========================================

  get isJumping() {
    return this.motion.airborne;
  }

  get isSliding() {
    return this.motion.sliding;
  }

  get jumpVelocity() {
    return this.motion.velocity;
  }

  get slideTimer() {
    return this.motion.slideTime;
  }

  jump() {
    if (!this.loaded) return false;

    if (!startJump(this.motion)) {
      this.bufferedInput = {
        type: 'jump',
        time: INPUT_BUFFER_SECONDS,
      };

      return false;
    }

    this.bufferedInput = null;
    this.playAnimationState('jump');

    if (__DEV__) {
      console.log('[PLAYER] JUMP');
    }

    return true;
  }

  slide() {
    if (!this.loaded) return false;

    if (!startSlide(this.motion)) {
      this.bufferedInput = {
        type: 'slide',
        time: INPUT_BUFFER_SECONDS,
      };

      return false;
    }

    this.bufferedInput = null;
    this.playAnimationState('slide');

    if (__DEV__) {
      console.log('[PLAYER] SLIDE');
    }

    return true;
  }

  // ========================================
  // RESET
  // ========================================

  reset() {
    this.motion = createMotionState();
    this.bufferedInput = null;

    this.currentLane = 0;
    this.targetX = 0;
    this.baseY = 0;

    this.worldSpeed = BASE_WORLD_SPEED;
    this.runCadenceSpeed = BASE_WORLD_SPEED;
    this.runCadence = 1;
    this.runDistance = 0;

    this.group.position.set(0, 0, 2);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);

    if (this.model && this.poseInitialized) {
      this.model.scale.copy(this.normalScale);
      this.model.position.copy(this.normalModelPosition);
      this.model.rotation.copy(this.normalModelRotation);
    }

    this.pose = {
      weight: 0,
      knee: 0,
      elbow: 0,
    };

    this.landTimer = 0;
    this.impactTimer = 0;

    this.animationController?.reset?.();

    this.mixer?.stopAllAction?.();
    this.activeAction = null;

    // Clear any paused state left by a previous jump.
    Object.values(this.actions).forEach((action) => {
      action.paused = false;
      action.enabled = true;
    });

    if (this.loaded && this.animationNames.run) {
      this.playAnimation(this.animationNames.run, {
        loop: true,
        fadeDuration: 0,
      });
    }
  }

  // ========================================
  // PROCEDURAL POSES
  // ========================================

  updateProceduralPose(dt) {
    if (!this.model || !this.poseInitialized) return;

    this.targetScale.copy(this.normalScale);
    this.targetModelPosition.copy(this.normalModelPosition);
    this.targetModelRotation.copy(this.normalModelRotation);

    if (this.isSliding) {
      this.targetScale.y =
        this.normalScale.y * SLIDE_HEIGHT_SCALE;

      this.targetScale.x =
        this.normalScale.x * SLIDE_WIDTH_SCALE;

      this.targetScale.z =
        this.normalScale.z * SLIDE_WIDTH_SCALE;

      this.targetModelPosition.y =
        this.normalModelPosition.y -
        SLIDE_LOWER_OFFSET * this.normalScale.y;

      this.targetModelRotation.x =
        this.normalModelRotation.x + SLIDE_FORWARD_TILT;
    } else if (this.isJumping) {
      this.targetModelRotation.x =
        this.normalModelRotation.x + JUMP_FORWARD_TILT;
    }

    // Normal jump pitch and lane-change lean.
    this.targetModelRotation.x += getJumpPitch(
      this.motion.airborne,
      this.motion.airTime,
      JUMP_AIR_DURATION
    );

    const dodge = getDodgeLean(
      this.targetX - this.group.position.x,
      LANE_WIDTH
    );

    this.targetModelRotation.z += dodge.roll;

    // Impact pitch.
    this.targetModelRotation.x +=
      IMPACT_TILT *
      clampUnit(this.impactTimer / IMPACT_DURATION);

    this.targetModelRotation.y += dodge.yaw;

    const alpha = 1 - Math.exp(-POSE_SMOOTH_SPEED * dt);

    this.model.scale.lerp(this.targetScale, alpha);
    this.model.position.lerp(this.targetModelPosition, alpha);

    this.model.rotation.x = THREE.MathUtils.lerp(
      this.model.rotation.x,
      this.targetModelRotation.x,
      alpha
    );

    this.model.rotation.y = THREE.MathUtils.lerp(
      this.model.rotation.y,
      this.targetModelRotation.y,
      alpha
    );

    this.model.rotation.z = THREE.MathUtils.lerp(
      this.model.rotation.z,
      this.targetModelRotation.z,
      alpha
    );
  }

  // ========================================
  // JUMP, FALL, LANDING AND SLIDE BONE POSES
  // ========================================

  applyBonePose(dt) {
    if (!this.poseBones) return;

    this.landTimer = Math.max(0, this.landTimer - dt);

    let weight = 0;
    let knee = 0;
    let elbow = 0;

    if (this.motion.sliding) {
      weight = 1;
      knee = SLIDE_KNEE;
      elbow = SLIDE_ELBOW;
    } else if (this.motion.airborne) {
      // Blend from a tucked takeoff pose to a more extended
      // falling pose as vertical velocity becomes negative.
      const fall = clampUnit(
        -this.motion.velocity / JUMP_VELOCITY
      );

      weight = 1;
      knee = JUMP_KNEE + (FALL_KNEE - JUMP_KNEE) * fall;
      elbow = JUMP_ELBOW + (FALL_ELBOW - JUMP_ELBOW) * fall;
    } else if (this.landTimer > 0) {
      // Brief landing compression, then blend back to neutral.
      weight = 1;
      knee = LAND_KNEE * (this.landTimer / LAND_DURATION);
    }

    if (this.impactTimer > 0) {
      const strength = clampUnit(
        this.impactTimer / IMPACT_DURATION
      );

      weight = 1;
      knee = Math.max(knee, IMPACT_KNEE * strength);
      elbow = IMPACT_ELBOW;

      this.impactTimer = Math.max(
        0,
        this.impactTimer - dt
      );
    }

    const k = 1 - Math.exp(-POSE_BLEND_SPEED * dt);

    this.pose.weight += (weight - this.pose.weight) * k;
    this.pose.knee += (knee - this.pose.knee) * k;
    this.pose.elbow += (elbow - this.pose.elbow) * k;

    // Always apply the blend, including when weight approaches zero.
    // This lets bones return to the animation's neutral pose.
    this._blendBones(
      this.poseBones.legs,
      this.pose.knee,
      this.pose.weight
    );

    this._blendBones(
      this.poseBones.elbows,
      this.pose.elbow,
      this.pose.weight
    );
  }

  _blendBones(bones, angle, weight) {
    this._targetQuat.setFromAxisAngle(this._axisX, angle);

    for (const bone of bones) {
      bone.quaternion.slerp(this._targetQuat, weight);
    }
  }

  // ========================================
  // UPDATE EVERY FRAME
  // ========================================

  update(delta) {
    const dt = Math.min(
      Math.max(delta || 0, 0),
      0.05
    );

    if (dt <= 0 || this.destroyed) return [];

    // Smooth lane movement.
    const laneAlpha = 1 - Math.exp(-LANE_SMOOTHING * dt);

    this.group.position.x +=
      (this.targetX - this.group.position.x) * laneAlpha;

    if (Math.abs(this.targetX - this.group.position.x) < 0.001) {
      this.group.position.x = this.targetX;
    }

    // Process buffered jump or slide input.
    if (this.bufferedInput) {
      this.bufferedInput.time -= dt;

      if (this.bufferedInput.time <= 0) {
        this.bufferedInput = null;
      } else if (
        this.bufferedInput.type === 'jump' &&
        startJump(this.motion)
      ) {
        this.playAnimationState('jump');
        this.bufferedInput = null;
      } else if (
        this.bufferedInput.type === 'slide' &&
        startSlide(this.motion)
      ) {
        this.playAnimationState('slide');
        this.bufferedInput = null;
      }
    }

    // Road boundary clamp.
    const roadLimit = LANE_WIDTH * MAX_LANE;

    this.group.position.x = THREE.MathUtils.clamp(
      this.group.position.x,
      -roadLimit,
      roadLimit
    );

    // Track the transition so landing is detected exactly once.
    const wasAirborne = this.motion.airborne;

    // Normal jump and slide physics.
    const { events } = advanceMotion(this.motion, dt);

    const justLanded =
      wasAirborne && !this.motion.airborne;

    if (justLanded) {
      this.landTimer = LAND_DURATION;

      if (!this.motion.sliding) {
        this.resumeRunAnimation();
      }
    }

    // Vertical position is controlled only by jump physics.
    // No flight height or flying movement is used.
    this.group.position.y = this.baseY + this.motion.height;

    const runAction = this.actions[this.animationNames.run];
    const jumpAction = this.actions[this.animationNames.jump];

    // Never let an active run cycle keep moving the legs in the air.
    // If there is a jump clip, play it instead; otherwise hold the
    // run pose and use the procedural jump/fall pose.
    if (this.motion.airborne) {
      if (jumpAction) {
        if (this.activeAction !== jumpAction) {
          this.playAnimationState(
            this.motion.velocity < 0 && this.animationNames.fall
              ? 'fall'
              : 'jump'
          );
        }
      } else if (runAction) {
        runAction.paused = true;
      }
    } else if (!this.motion.sliding) {
      // Keep running after landing, even if the run action was paused.
      if (runAction) {
        runAction.paused = false;
      }

      if (this.activeAction !== runAction && this.animationNames.run) {
        this.resumeRunAnimation();
      }
    }

    // Procedural running animation.
    if (
      this.animationController &&
      !this.isJumping &&
      !this.isSliding
    ) {
      this.animationController.update(dt * this.runCadence);
    } else if (this.animationController) {
      this.animationController.reset();
    }

    this.updateProceduralPose(dt);

    // Increase running cadence with distance.
    const distanceSteps = Math.floor(
      this.runDistance / RUN_CADENCE_DISTANCE_STEP
    );

    const targetCadence =
      1 + distanceSteps * RUN_CADENCE_DISTANCE_INCREASE;

    const cadenceEasing =
      1 - Math.exp(-RUN_CADENCE_SMOOTHING * dt);

    this.runCadence +=
      (targetCadence - this.runCadence) * cadenceEasing;

    if (runAction && this.activeAction === runAction) {
      runAction.setEffectiveTimeScale(
        RUN_ANIMATION_SPEED * this.runCadence
      );
    }

    // Update the skeletal animation mixer.
    if (this.mixer) {
      this.mixer.update(dt);
    }

    // Apply jump, landing, slide and impact poses after animation.
    this.applyBonePose(dt);

    return events;
  }

  // ========================================
  // SPEED AND DISTANCE
  // ========================================

  setWorldSpeed(speed) {
    this.worldSpeed = Number.isFinite(speed)
      ? Math.max(0, speed)
      : BASE_WORLD_SPEED;
  }

  setRunCadenceSpeed(speed) {
    this.runCadenceSpeed =
      Number.isFinite(speed) && speed > 0
        ? speed
        : BASE_WORLD_SPEED;
  }

  setRunDistance(distance) {
    this.runDistance = Math.max(
      0,
      Number.isFinite(distance) ? distance : 0
    );
  }

  // ========================================
  // CLEANUP
  // ========================================

  destroy() {
    this.destroyed = true;

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }

    this.animationController?.reset();
    this.animationController = null;

    this.group.traverse((object) => {
      if (!object.isMesh) return;

      object.geometry?.dispose();

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      materials.forEach((material) => {
        if (!material) return;

        Object.values(material).forEach((value) => {
          if (value?.isTexture) {
            value.dispose();
          }
        });

        material.dispose();
      });
    });

    this.group.clear();

    this.model = null;
    this.actions = {};
    this.activeAction = null;
    this.loaded = false;
    this.poseInitialized = false;
    this.poseBones = null;
  }
}
