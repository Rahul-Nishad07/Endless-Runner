
import * as THREE from 'three';

export function createCamera(width, height) {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);

  const camera = new THREE.PerspectiveCamera(
    65,
    safeWidth / safeHeight,
    0.1,
    500
  );

  // Third-person runner camera.
  // Player is at approximately z = 2.
  camera.position.set(
    0,
    4.6,
    8.5
  );

  // Look down the road while keeping the player visible.
  camera.lookAt(
    0,
    1.1,
    -18
  );

  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  return camera;
}
