import * as THREE from 'three';

export function createLighting(scene) {
  // ==========================================
  // SKY LIGHT
  // ==========================================

  const hemisphere =
    new THREE.HemisphereLight(
      0x9ed8ff,
      0x34402e,
      2.2
    );

  scene.add(
    hemisphere
  );

  // ==========================================
  // SUN
  // ==========================================

  const sun =
    new THREE.DirectionalLight(
      0xffffff,
      3.2
    );

  sun.position.set(
    -35,
    55,
    25
  );

  sun.castShadow =
    true;

  sun.shadow.mapSize.width =
    512;

  sun.shadow.mapSize.height =
    512;

  sun.shadow.camera.near =
    1;

  sun.shadow.camera.far =
    180;

  sun.shadow.camera.left =
    -50;

  sun.shadow.camera.right =
    50;

  sun.shadow.camera.top =
    50;

  sun.shadow.camera.bottom =
    -50;

  sun.shadow.bias =
    -0.0005;

  scene.add(
    sun
  );

  // ==========================================
  // CITY FILL LIGHT
  // ==========================================

  const fill =
    new THREE.DirectionalLight(
      0x9dc7ff,
      0.8
    );

  fill.position.set(
    30,
    20,
    -30
  );

  scene.add(
    fill
  );

  // Returned so world events can tint ambient light.
  return {
    hemisphere,
    sun,
    fill,
  };
}