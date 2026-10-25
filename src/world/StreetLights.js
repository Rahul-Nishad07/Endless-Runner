import * as THREE from 'three';

export function createStreetLights() {
  const group =
    new THREE.Group();

 const positions = [
  [-6.2, -10],
  [6.2, -28],

  [-6.2, -48],
  [6.2, -66],

  [-6.2, -86],
  [6.2, -104],

  [-6.2, -124],
  [6.2, -142],

  [-6.2, -162],
  [6.2, -182],

  [-6.2, -202],
  [6.2, -222],

  [-6.2, -242],
  [6.2, -262],
];

  positions.forEach(
    ([x, z], index) => {
      const light =
        createStreetLight();

      light.position.set(
        x,
        0,
        z
      );

      light.rotation.y =
        index % 2 === 0
          ? 0
          : Math.PI;

      group.add(light);
    }
  );

  return group;
}

function createStreetLight() {
  const group =
    new THREE.Group();

  const metal =
    new THREE.MeshStandardMaterial({
      color: 0x30343a,
      metalness: 0.8,
      roughness: 0.3,
    });

  // Pole

  const pole =
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.09,
        0.13,
        4.8,
        8
      ),
      metal
    );

  pole.position.y =
    2.4;

  pole.castShadow = true;

  group.add(pole);

  // Arm

  const arm =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        1.2,
        0.1,
        0.1
      ),
      metal
    );

  arm.position.set(
    0.55,
    4.7,
    0
  );

  group.add(arm);

  // Lamp

  const lamp =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.23,
        12,
        8
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffffd0,
        emissive: 0xffd45a,
        emissiveIntensity: 2.5,
      })
    );

  lamp.position.set(
    1.05,
    4.62,
    0
  );

  group.add(lamp);

  return group;
}