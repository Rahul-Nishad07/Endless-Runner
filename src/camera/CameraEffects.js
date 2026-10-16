
export default class CameraEffects {
  constructor() {
    this.landingAmount = 0;
    this.landingVelocity = 0;
    this.wasJumping = false;
    this.previousPlayerY = 0;
  }

  update(player, delta) {
    if (!player?.group) {
      return 0;
    }

    const dt = Math.max(0, Math.min(delta || 0, 0.05));
    const isJumping = player.isJumping === true;
    const playerY = player.group.position.y;

    // Detect the transition from airborne to grounded.
    if (
      this.wasJumping &&
      !isJumping &&
      this.previousPlayerY > 0.05
    ) {
      this.landingVelocity = -1.8;
    }

    this.wasJumping = isJumping;
    this.previousPlayerY = playerY;

    // Spring-like damped response.
    const stiffness = 32;
    const damping = 9;

    this.landingVelocity +=
      (-stiffness * this.landingAmount -
        damping * this.landingVelocity) *
      dt;

    this.landingAmount += this.landingVelocity * dt;

    this.landingAmount = Math.max(
      -0.12,
      Math.min(0.12, this.landingAmount)
    );

    return this.landingAmount;
  }

  reset() {
    this.landingAmount = 0;
    this.landingVelocity = 0;
    this.wasJumping = false;
    this.previousPlayerY = 0;
  }
}
