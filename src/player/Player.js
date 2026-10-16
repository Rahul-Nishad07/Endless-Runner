
import * as THREE from 'three';
import { Asset } from 'expo-asset';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withTimeout } from '../utils/Timeout';

// A stalled download or parse rejects after this long, so the game can
// report it or fall back, rather than waiting forever on a blank screen.
const MODEL_LOAD_TIMEOUT_MS = 20000;

// Mixamo run clips move the hips sideways and forward with each stride. The
// game moves the runner along the lanes, so that motion would push the model
// off its lane centre. This keeps the vertical bounce and averages out the
// horizontal part of the hips track, once per clip.
const ROOT_BONE_TRACK = 'mixamorig:Hips.position';

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
// PLAYER CONFIGURATION
// ========================================

// Three lanes: left (-4), center (0), right (+4)
import {
  BASE_WORLD_SPEED,
  LANE_WIDTH,
} from '../game/GameConfig';

// How quickly run cadence follows world speed (per second).
const RUN_CADENCE_SMOOTHING = 6;
const MIN_LANE = -1;
const MAX_LANE = 1;
const RUN_ANIMATION_SPEED = 1.8;
// Lane change easing (per second). Eases in and out, so a swipe starts and
// stops smoothly. About 95% of a lane is covered in 0.17 s, close to the
// previous linear speed, so the lane-switch timing used by obstacle rules holds.
const LANE_SMOOTHING = 18;

// A jump or slide pressed while the runner is busy is remembered this long,
// then used as soon as the runner is free.
const INPUT_BUFFER_SECONDS = 0.15;

const TARGET_HEIGHT = 0.4;

// Sky Flyer: height above the road while flying, and how quickly the runner
// rises and descends (per second).
const FLY_HEIGHT = 2.6;
const FLY_EASE = 4;

// Flying pose: the body pitches forward (head leading, like a superhero
// flight), the legs trail back and the elbows straighten.
const FLY_PITCH = -1.1;
const FLY_SWAY_RATE = 4;
const FLY_SWAY_ROLL = 0.07;
const FLY_KNEE = 0.3;

// Highest playback rate for the run animation, relative to the base speed.
const MAX_RUN_CADENCE = 1.6;

const SLIDE_HEIGHT_SCALE = 0.62;
const SLIDE_WIDTH_SCALE = 1.04;
const SLIDE_LOWER_OFFSET = 0.035;

const JUMP_FORWARD_TILT = -0.08;
const SLIDE_FORWARD_TILT = -0.12;

const POSE_SMOOTH_SPEED = 26;

// Bone poses (absolute angles, radians). The knee bends along +X and the
// elbow along -X, matching the Run clip's own ranges in Soldier.gltf.
const POSE_BLEND_SPEED = 14;
const JUMP_KNEE = 1.1;
const FALL_KNEE = 0.3;
const SLIDE_KNEE = 1.7;
const LAND_KNEE = 0.6;
const LAND_DURATION = 0.12;
const JUMP_ELBOW = -1.6;
const FALL_ELBOW = -1.2;
const SLIDE_ELBOW = -1.5;

const clampUnit = (value) => Math.min(1, Math.max(0, value));

// Impact from the truck: knees buckle, arms flail and the body pitches forward.
const IMPACT_DURATION = 0.45;
const IMPACT_KNEE = 0.9;
const IMPACT_ELBOW = -1.0;
const IMPACT_TILT = -0.45;

// ========================================
// PLAYER CLASS
// ========================================

export default class Player {
  constructor() {
    // Run cadence multiplier: 1 at base world speed. Follows the
    // world speed passed in via setWorldSpeed(). Applied once here,
    // never again in the animation code.
    this.worldSpeed = BASE_WORLD_SPEED;
    this.runCadence = 1;

    this.group = new THREE.Group();
    this.group.name = 'RunnerPlayer';

    // Lane index: -1 = left, 0 = center, 1 = right
    this.currentLane = 0;
    this.targetX = 0;

    this.baseY = 0;

    // Jump and slide state. Updated in fixed physics steps.
    this.motion = createMotionState();

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

    // Bone poses for jump, fall, landing and slide (see applyBonePose).
    this.poseBones = null;
    this.pose = { weight: 0, knee: 0, elbow: 0 };
    this.landTimer = 0;
    this._targetQuat = new THREE.Quaternion();
    this._axisX = new THREE.Vector3(1, 0, 0);
    this.impactTimer = 0;

    // Sky Flyer. `flying` is set by the game; `flightHeight` eases toward it.
    this.flying = false;
    this.flightHeight = 0;
    this.flightClock = 0;
  }

  /** Turns flight on or off. The height eases up or down over time. */
  setFlying(on) {
    this.flying = on === true;
  }

  get isFlying() {
    return this.flying;
  }

  /** TAKEOFF, FLYING, DESCENDING or RUNNING. */
  get flightState() {
    if (this.flying) {
      return this.flightHeight < FLY_HEIGHT * 0.95 ? 'TAKEOFF' : 'FLYING';
    }

    return this.flightHeight > 0.05 ? 'DESCENDING' : 'RUNNING';
  }

  /** Called when the truck hits the runner. Plays the stumble pose. */
  triggerImpact() {
    this.impactTimer = IMPACT_DURATION;
  }

  // ========================================
  // LOAD SOLDIER MODEL
  // ========================================

  /**
   * Loads the player model. `modelSet` comes from CharacterModels.js.
   * Without an argument, the original soldier loads, as before.
   */
  async load(modelSet = DEFAULT_MODEL_SET) {
    try {
      console.log('=============================');
      console.log('LOADING PLAYER MODEL:', modelSet.names.gltf);
      console.log('=============================');

      // A model set is either one self-contained .glb, or the classic
      // .gltf + .bin + textures set (the default Soldier). Both are downloaded
      // the same way, and the result is one name-to-URI map.
      const sources = modelSet.glb
        ? [[modelSet.names.gltf, modelSet.glb]]
        : [
            [modelSet.names.gltf, modelSet.gltf],
            [modelSet.names.bin, modelSet.bin],
            [modelSet.names.baseColor, modelSet.baseColor],
            [modelSet.names.normal, modelSet.normal],
          ];

      const downloads = sources.map(([name, module]) => [name, Asset.fromModule(module)]);

      await withTimeout(
        Promise.all(downloads.map(([, asset]) => asset.downloadAsync())),
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

      // ========================================
      // LOADING MANAGER
      // ========================================

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
          // Keep original URL if decoding fails.
        }

        const cleanUrl = decodedUrl.split(/[?#]/)[0];
        const filename = cleanUrl.split('/').pop();

        return globalThis.__THREE_ASSET_MAP?.[filename] || url;
      });

      // ========================================
      // GLTF LOADER
      // ========================================

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

      // Limb bones for the air and slide poses. Looked up once, by name.
      const bone = (name) => this.model.getObjectByName(`mixamorig:${name}`);
      this.poseBones = {
        legs: [bone('LeftLeg'), bone('RightLeg')].filter(Boolean),
        elbows: [bone('LeftForeArm'), bone('RightForeArm')].filter(Boolean),
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

          // Model sets may recolour a material by name (see CharacterModels).
          const tint = modelSet.tint?.[material.name];
          if (tint !== undefined) material.color.set(tint);

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

      // Start in the center lane.
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

    this.group.position.set(this.targetX, y, z);
  }

  // ========================================
  // THREE-LANE CONTROLS
  // ========================================

  moveLeft() {
    return this.setLane(this.currentLane - 1);
  }

  moveRight() {
    return this.setLane(this.currentLane + 1);
  }

  // Returns true only when the lane actually changes. Swipes at the
  // edge of the road return false, so they make no sound.
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
      console.log('[PLAYER LANE]', this.currentLane, 'TARGET X:', this.targetX);
    }

    return true;
  }

  // ========================================
  // ANIMATION TRANSITIONS
  // ========================================

  playAnimation(name, options = {}) {
    const nextAction = this.actions[name];

    if (!nextAction || nextAction === this.activeAction) return;

    const {
      loop = true,
      fadeDuration = 0.15,
    } = options;

    nextAction.reset();
    nextAction.enabled = true;
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
      this.activeAction.crossFadeTo(nextAction, fadeDuration, true);
    }

    this.activeAction = nextAction;
  }

  playAnimationState(state) {
    let name = this.animationNames[state];

    // With no dedicated clip, keep the Run loop instead of freezing in
    // Idle. Movement stays visible until a jump/slide/fall clip exists.
    if (!name && (state === 'jump' || state === 'slide' || state === 'fall')) {
      name = this.animationNames.run;
    }

    if (!name) return;

    this.playAnimation(name, {
      loop: true,
      fadeDuration: 0.08,
    });
  }

  // ========================================
  // JUMP
  // ========================================

  // Read-only views of the motion state. Obstacles and the camera read
  // these, so their names stay the same.
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

  /**
   * Restores the run state for a restart. Lane, pose, jump, slide,
   * animation and speed all return to their starting values.
   */
  reset() {
    this.motion = createMotionState();
    this.bufferedInput = null;

    this.currentLane = 0;
    this.targetX = 0;
    this.baseY = 0;

    this.worldSpeed = BASE_WORLD_SPEED;
    this.runCadence = 1;

    this.group.position.set(0, 0, 2);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);

    if (this.model && this.poseInitialized) {
      this.model.scale.copy(this.normalScale);
      this.model.position.copy(this.normalModelPosition);
      this.model.rotation.copy(this.normalModelRotation);
    }

    this.pose = { weight: 0, knee: 0, elbow: 0 };
    this.landTimer = 0;
    this.impactTimer = 0;
    this.flying = false;
    this.flightHeight = 0;
    this.animationController?.reset?.();
    this.mixer?.stopAllAction?.();
    this.activeAction = null;

    if (this.loaded && this.animationNames.run) {
      this.playAnimation(this.animationNames.run, {
        loop: true,
        fadeDuration: 0,
      });
    }
  }

  // Returns true only if the jump was accepted. Sound and animation
  // should react to that result, not to the input itself.
  jump() {
    if (!this.loaded || this.flying) return false;

    if (!startJump(this.motion)) {
      this.bufferedInput = { type: 'jump', time: INPUT_BUFFER_SECONDS };
      return false;
    }

    this.bufferedInput = null;
    this.playAnimationState('jump');

    if (__DEV__) console.log('[PLAYER] JUMP');
    return true;
  }

  // ========================================
  // SLIDE
  // ========================================

  slide() {
    if (!this.loaded || this.flying) return false;

    if (!startSlide(this.motion)) {
      this.bufferedInput = { type: 'slide', time: INPUT_BUFFER_SECONDS };
      return false;
    }

    this.bufferedInput = null;
    this.playAnimationState('slide');

    if (__DEV__) console.log('[PLAYER] SLIDE');
    return true;
  }

  // ========================================
  // PROCEDURAL POSE
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

    // Visual stunts: offsets added to the target above. They only change
    // the model's rotation. Position, lanes and collision are untouched.
    this.targetModelRotation.x += getJumpPitch(
      this.motion.airborne,
      this.motion.airTime,
      JUMP_AIR_DURATION
    );

    const dodge = getDodgeLean(
      this.targetX - this.group.position.x,
      LANE_WIDTH
    );

    // Flying: pitch the body forward, blended with the height so it
    // tilts as the runner leaves the road.
    const flyBlend = clampUnit(this.flightHeight / FLY_HEIGHT);

    this.targetModelRotation.x += FLY_PITCH * flyBlend;

    // Gentle sway in the air, so the flight reads as flying, not running.
    this.targetModelRotation.z +=
      Math.sin(this.flightClock * FLY_SWAY_RATE) * FLY_SWAY_ROLL * flyBlend;

    this.targetModelRotation.z += dodge.roll;

    // Forward pitch from an impact, easing out over IMPACT_DURATION.
    this.targetModelRotation.x +=
      IMPACT_TILT * clampUnit(this.impactTimer / IMPACT_DURATION);
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
  // BONE POSES (JUMP, FALL, LANDING, SLIDE)
  // ========================================

  // Blends the limbs into a pose for the air, a landing or a slide. The
  // Run clip still drives every bone when no pose is active. Weights and
  // angles are eased, so the transitions never snap.
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
    } else if (this.flightHeight > 0.05) {
      // Flying: legs trail behind, elbows straight.
      weight = 1;
      knee = FLY_KNEE * clampUnit(this.flightHeight / FLY_HEIGHT);
      elbow = 0;
    } else if (this.motion.airborne) {
      // Rising: tucked. Falling: legs open toward landing.
      const fall = clampUnit(-this.motion.velocity / JUMP_VELOCITY);

      weight = 1;
      knee = JUMP_KNEE + (FALL_KNEE - JUMP_KNEE) * fall;
      elbow = JUMP_ELBOW + (FALL_ELBOW - JUMP_ELBOW) * fall;
    } else if (this.landTimer > 0) {
      // Brief compression on landing, then recovery to the run.
      weight = 1;
      knee = LAND_KNEE * (this.landTimer / LAND_DURATION);
    }

    if (this.impactTimer > 0) {
      const strength = clampUnit(this.impactTimer / IMPACT_DURATION);

      weight = 1;
      knee = Math.max(knee, IMPACT_KNEE * strength);
      elbow = IMPACT_ELBOW;
      this.impactTimer = Math.max(0, this.impactTimer - dt);
    }

    const k = 1 - Math.exp(-POSE_BLEND_SPEED * dt);

    this.pose.weight += (weight - this.pose.weight) * k;
    this.pose.knee += (knee - this.pose.knee) * k;
    this.pose.elbow += (elbow - this.pose.elbow) * k;

    if (this.pose.weight < 0.001) return;

    this._blendBones(this.poseBones.legs, this.pose.knee, this.pose.weight);
    this._blendBones(this.poseBones.elbows, this.pose.elbow, this.pose.weight);
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
    const dt = Math.min(Math.max(delta || 0, 0), 0.05);

    if (dt <= 0 || this.destroyed) return [];

    // Smooth lane movement: exponential easing toward the target lane.
    const laneAlpha = 1 - Math.exp(-LANE_SMOOTHING * dt);
    this.group.position.x += (this.targetX - this.group.position.x) * laneAlpha;

    if (Math.abs(this.targetX - this.group.position.x) < 0.001) {
      this.group.position.x = this.targetX;
    }

    // Replay a buffered jump or slide once the runner is free.
    if (this.bufferedInput) {
      this.bufferedInput.time -= dt;

      if (this.bufferedInput.time <= 0) {
        this.bufferedInput = null;
      } else if (this.bufferedInput.type === 'jump' && startJump(this.motion)) {
        this.playAnimationState('jump');
        this.bufferedInput = null;
      } else if (this.bufferedInput.type === 'slide' && startSlide(this.motion)) {
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

    // ========================================
    // JUMP PHYSICS
    // ========================================

    // Jump and slide run in fixed physics steps, so their height and
    // timing do not depend on frame rate.
    const { events } = advanceMotion(this.motion, dt);

    // Flight: ease the height toward the flight height, or back to the road.
    if (this.flying) this.flightClock += dt;

    const flyTarget = this.flying ? FLY_HEIGHT : 0;

    this.flightHeight +=
      (flyTarget - this.flightHeight) * (1 - Math.exp(-FLY_EASE * dt));

    this.group.position.y =
      this.baseY + Math.max(this.motion.height, this.flightHeight);

    // While flying the legs stop running and hold the Idle clip, with the
    // flight pose on top. The run cycle resumes after landing.
    if (
      this.flying &&
      this.animationNames.idle &&
      this.activeAction === this.actions[this.animationNames.run]
    ) {
      this.playAnimation(this.animationNames.idle, {
        loop: true,
        fadeDuration: 0.2,
      });
    } else if (
      !this.flying &&
      this.flightHeight < 0.05 &&
      this.animationNames.run &&
      this.activeAction === this.actions[this.animationNames.idle]
    ) {
      this.playAnimation(this.animationNames.run, {
        loop: true,
        fadeDuration: 0.2,
      });
    }

    for (const event of events) {
      if (event === 'land') this.landTimer = LAND_DURATION;

      if (event === 'fall') {
        this.playAnimationState('fall');
      } else if (event === 'land' && !this.motion.sliding) {
        this.playAnimationState('run');
      } else if (event === 'slideEnd') {
        console.log('[PLAYER] SLIDE ENDED');

        if (!this.motion.airborne) {
          this.playAnimationState('run');
        }
      }
    }

    // ========================================
    // PROCEDURAL RUN ANIMATION
    // ========================================

    if (
      this.animationController &&
      !this.isJumping &&
      !this.isSliding &&
      !this.flying
    ) {
      this.animationController.update(dt * this.runCadence);
    } else if (this.animationController) {
      this.animationController.reset();
    }

    this.updateProceduralPose(dt);

    // Ease the run clip's playback rate toward the current cadence.
    // It is only set on the run action, so jump and slide keep their rate.
    // Capped so the stride stays natural at the highest speed levels. The
    // road and obstacles still move at the full world speed.
    const targetCadence = Math.min(
      this.worldSpeed / BASE_WORLD_SPEED,
      MAX_RUN_CADENCE
    );
    const cadenceEasing =
      1 - Math.exp(-RUN_CADENCE_SMOOTHING * dt);

    this.runCadence +=
      (targetCadence - this.runCadence) * cadenceEasing;

    const runAction = this.actions[this.animationNames.run];

    if (runAction && this.activeAction === runAction) {
      runAction.setEffectiveTimeScale(
        RUN_ANIMATION_SPEED * this.runCadence
      );
    }

    // Update skeletal animation mixer.
    if (this.mixer) {
      this.mixer.update(dt);
    }

    // Bone poses go on top of the clip, after the mixer has written it.
    this.applyBonePose(dt);

    // Returned so the game can play sounds for landings and other
    // one-off motion events.
    return events;
  }

  /**
   * Called every frame with the effective world speed. Only sets the
   * target. Update() eases toward it.
   */
  setWorldSpeed(speed) {
    this.worldSpeed = Number.isFinite(speed)
      ? Math.max(0, speed)
      : BASE_WORLD_SPEED;
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
          if (value?.isTexture) value.dispose();
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
