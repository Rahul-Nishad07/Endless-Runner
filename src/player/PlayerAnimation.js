
import * as THREE from 'three';

export class PlayerAnimation {
  constructor(model) {
    this.model = model;
    this.time = 0;

    // Preserve the model's original local transform.
    this.baseY = model.position.y;
    this.baseRotationZ = model.rotation.z;
  }

  update(delta) {
    if (!this.model) return;

    const dt = Math.min(Math.max(delta || 0, 0), 0.033);

    this.time += dt;

    // Subtle running bounce.
    this.model.position.y =
      this.baseY + Math.abs(Math.sin(this.time * 12)) * 0.012;

    // Very subtle body lean.
    this.model.rotation.z =
      this.baseRotationZ + Math.sin(this.time * 6) * 0.012;
  }

  reset() {
    this.time = 0;

    if (!this.model) return;

    this.model.position.y = this.baseY;
    this.model.rotation.z = this.baseRotationZ;
  }
}

export default PlayerAnimation;
