
import * as THREE from 'three';
import CameraShake from './CameraShake';
import CameraEffects from './CameraEffects';


const CAMERA_CONFIG = {
  height: 3.2,
  distance: 5.5,
  lookAhead: 12,
  lookHeight: 0.9,
  followSmoothness: 7.0,
  jumpCameraInfluence: 0.16,
  jumpLookInfluence: 0.3,
  landingInfluence: 0.7,

  flyCameraInfluence: 1.0,
  flyLookInfluence: 0.8,
  flyPullBackInfluence: 0.9,
};

const CHASE_VIEW = {
  extraDistance: 6,
  heightOffset: 0,
  lookAhead: 12,
  lookHeight: 0.9,
  blendRate: 3.8,
};


export default class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.shake = new CameraShake();
    this.effects = new CameraEffects();

    this.positionTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.currentLookTarget = new THREE.Vector3();

    this.initialized = false;

    // 0 = normal framing, 1 = chase framing. Eased in update().
    this.chaseBlend = 0;
    this.chaseTarget = 0;
  }

  /** Switches between normal and chase framing. The change is eased. */
  setChaseView(enabled) {
    this.chaseTarget = enabled ? 1 : 0;
  }

  triggerShake(intensity = 0.12, duration = 0.22) {
    this.shake.trigger(intensity, duration);
  }

  update(player, delta) {
    if (!this.camera || !player?.group) {
      return;
    }

    const dt = Math.max(0, Math.min(delta || 0, 0.05));
    const group = player.group;

    const playerX = group.position.x;
    const playerY = Math.max(0, group.position.y);
    const playerZ = group.position.z;

    // Sky Flyer lift. The camera follows the runner up into the air.
    const flyLift = Number(player.flightHeight) || 0;

    const landingOffset = this.effects.update(player, dt);

    this.chaseBlend +=
      (this.chaseTarget - this.chaseBlend) *
      (1 - Math.exp(-CHASE_VIEW.blendRate * dt));

    const blend = this.chaseBlend;
    const lookAhead =
      CAMERA_CONFIG.lookAhead -
      (CAMERA_CONFIG.lookAhead - CHASE_VIEW.lookAhead) * blend;
    const lookHeight =
      CAMERA_CONFIG.lookHeight +
      (CHASE_VIEW.lookHeight - CAMERA_CONFIG.lookHeight) * blend;

    this.positionTarget.set(
      playerX,
      CAMERA_CONFIG.height +
        CHASE_VIEW.heightOffset * blend +
        playerY * CAMERA_CONFIG.jumpCameraInfluence +
        flyLift * CAMERA_CONFIG.flyCameraInfluence +
        landingOffset * CAMERA_CONFIG.landingInfluence,
      playerZ +
        CAMERA_CONFIG.distance +
        CHASE_VIEW.extraDistance * blend +
        flyLift * CAMERA_CONFIG.flyPullBackInfluence
    );

    this.lookTarget.set(
      playerX,
      lookHeight +
        playerY * CAMERA_CONFIG.jumpLookInfluence +
        flyLift * CAMERA_CONFIG.flyLookInfluence,
      playerZ - lookAhead
    );

    if (!this.initialized) {
      this.camera.position.copy(this.positionTarget);
      this.currentLookTarget.copy(this.lookTarget);
      this.initialized = true;
    } else {
      const alpha =
        1 - Math.exp(-CAMERA_CONFIG.followSmoothness * dt);

      this.camera.position.lerp(this.positionTarget, alpha);
      this.currentLookTarget.lerp(this.lookTarget, alpha);
    }

    const shakeOffset = this.shake.update(dt);

    this.camera.position.x += shakeOffset.x;
    this.camera.position.y += shakeOffset.y;

    this.camera.lookAt(this.currentLookTarget);
  }

  reset() {
    this.initialized = false;
    this.shake.reset();
    this.effects.reset();
  }
}
