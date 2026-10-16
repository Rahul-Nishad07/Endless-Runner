
import * as THREE from 'three';

export default class CameraShake {
  constructor() {
    this.duration = 0;
    this.elapsed = 0;
    this.intensity = 0;
    this.offset = new THREE.Vector3();
  }

  trigger(intensity = 0.12, duration = 0.22) {
    this.intensity = Math.max(0, intensity);
    this.duration = Math.max(0.01, duration);
    this.elapsed = 0;
  }

  update(delta) {
    this.offset.set(0, 0, 0);

    if (this.elapsed >= this.duration || this.duration <= 0) {
      return this.offset;
    }

    this.elapsed += Math.max(0, delta);

    const progress = Math.min(this.elapsed / this.duration, 1);
    const strength = this.intensity * (1 - progress);

    this.offset.set(
      (Math.random() - 0.5) * 2 * strength,
      (Math.random() - 0.5) * 2 * strength,
      0
    );

    return this.offset;
  }

  reset() {
    this.elapsed = this.duration;
    this.offset.set(0, 0, 0);
  }
}
