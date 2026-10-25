import * as THREE from 'three';

export function createTrafficSignals() {
  const group =
    new THREE.Group();

 const positions = [
  [-6.2, -34],
  [6.2, -92],
  [-6.2, -150],
  [6.2, -210],
];

  positions.forEach(
    ([x, z]) => {
      const signal =
        createTrafficSignal();

      signal.position.set(
        x,
        0,
        z
      );

      group.add(signal);
    }
  );

  return group;
}

function createTrafficSignal() {
  const group =
    new THREE.Group();

  const poleMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x292d32,
      metalness: 0.6,
      roughness: 0.4,
    });

  const pole =
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.08,
        0.1,
        3.8,
        8
      ),
      poleMaterial
    );

  pole.position.y =
    1.9;

  group.add(pole);

  const housing =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        0.55,
        1.55,
        0.35
      ),
      new THREE.MeshStandardMaterial({
        color: 0x17191c,
        roughness: 0.65,
      })
    );

  housing.position.set(
    0,
    3.7,
    0
  );

  group.add(housing);

  const colors = [
    0xff3030,
    0xffc928,
    0x35d05b,
  ];

  colors.forEach(
    (color, index) => {
      const lamp =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            0.14,
            12,
            8
          ),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity:
              index === 2
                ? 1.5
                : 0.15,
          })
        );

      lamp.position.set(
        0,
        4.15 -
          index * 0.45,
        0.2
      );

      group.add(lamp);
    }
  );

  return group;
}