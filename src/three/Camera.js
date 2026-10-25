
import * as THREE from 'three';

export function createCamera(width, height) {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);

  const camera = new THREE.PerspectiveCamera(
    60,
    safeWidth / safeHeight,
    0.1,
    500
  );

  // Third-person endless runner camera.
  // Player is approximately at z = 2.
  camera.position.set(
    0,
    3.6,
    7.0
  );

  // Look forward along the track.
  // This gives the road a stronger sense of depth.
  camera.lookAt(
    0,
    0.9,
    -14
  );

  // Keep camera matrices updated.
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  return camera;
}
