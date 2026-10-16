// Placeholder - implementation will be added phase by phase
import * as THREE from 'three';

export function createProps() {
  const group = new THREE.Group();

  const props = [
    [-7.2, -22, 'barrier'],
    [7.2, -32, 'sign'],

    [-7.2, -52, 'sign'],
    [7.2, -72, 'barrier'],

    [-7.2, -92, 'sign'],
    [7.2, -112, 'barrier'],

    [-7.2, -132, 'barrier'],
    [7.2, -152, 'sign'],

    [-7.2, -172, 'sign'],
    [7.2, -192, 'barrier'],
  ];

  props.forEach(([x, z, type]) => {
    const object =
      type === 'barrier'
        ? createBarrier()
        : createSign();

    object.position.set(
      x,
      0,
      z
    );

    group.add(object);
  });

  return group;
}

function createBarrier() {
  const group = new THREE.Group();

  const material =
    new THREE.MeshStandardMaterial({
      color: 0xf04b3e,
      roughness: 0.7,
    });

  const geometry =
    new THREE.BoxGeometry(
      1.4,
      0.8,
      0.45
    );

  const barrier =
    new THREE.Mesh(
      geometry,
      material
    );

  barrier.position.y = 0.4;
  barrier.castShadow = true;

  group.add(barrier);

  // White stripe
  const stripeGeometry =
    new THREE.BoxGeometry(
      0.25,
      0.85,
      0.47
    );

  const stripeMaterial =
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
    });

  const stripe =
    new THREE.Mesh(
      stripeGeometry,
      stripeMaterial
    );

  stripe.position.set(
    0,
    0.4,
    0.02
  );

  group.add(stripe);

  return group;
}

function createSign() {
  const group = new THREE.Group();

  const poleMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.5,
      roughness: 0.5,
    });

  const poleGeometry =
    new THREE.CylinderGeometry(
      0.06,
      0.06,
      2.4,
      8
    );

  const pole =
    new THREE.Mesh(
      poleGeometry,
      poleMaterial
    );

  pole.position.y = 1.2;

  group.add(pole);

  const signGeometry =
    new THREE.BoxGeometry(
      1.2,
      0.8,
      0.08
    );

  const signMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x1976d2,
      roughness: 0.5,
    });

  const sign =
    new THREE.Mesh(
      signGeometry,
      signMaterial
    );

  sign.position.y = 2.25;
  sign.castShadow = true;

  group.add(sign);

  return group;
}