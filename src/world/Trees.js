
import * as THREE from 'three';

// ==========================================
// SHARED MATERIALS
// ==========================================

const TRUNK_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x70452a,
  roughness: 1,
});

const FOLIAGE_MATERIALS = [
  new THREE.MeshStandardMaterial({
    color: 0x328548,
    roughness: 0.95,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x3f9850,
    roughness: 0.95,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x55a957,
    roughness: 0.95,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x2d7542,
    roughness: 0.95,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x478e46,
    roughness: 0.95,
  }),
];

// Reuse geometries across all trees to reduce GPU resources.
const TRUNK_GEOMETRY = new THREE.CylinderGeometry(
  0.2,
  0.3,
  2.2,
  7
);

const LOWER_FOLIAGE_GEOMETRY = new THREE.SphereGeometry(
  1.45,
  9,
  7
);

const MIDDLE_FOLIAGE_GEOMETRY = new THREE.SphereGeometry(
  1.2,
  9,
  7
);

const UPPER_FOLIAGE_GEOMETRY = new THREE.SphereGeometry(
  0.95,
  9,
  7
);

// ==========================================
// TREE POSITIONS
// ==========================================

const TREE_POSITIONS = [
  [-8.0, -13],
  [8.0, -20],
  [-8.3, -37],
  [8.3, -44],
  [-8.0, -60],
  [8.0, -70],
  [-8.3, -84],
  [8.3, -96],
  [-8.0, -112],
  [8.3, -124],
  [-8.3, -144],
  [8.0, -156],
  [-8.3, -176],
  [8.3, -188],
  [-8.0, -208],
  [8.3, -220],
  [-8.3, -242],
  [8.3, -254],
];

// ==========================================
// CREATE TREE COLLECTION
// ==========================================

export function createTrees() {
  const group = new THREE.Group();
  group.name = 'TreeCollection';

  TREE_POSITIONS.forEach(([x, z], index) => {
    const tree = createTree(index);

    tree.name = `ScrollingTree_${index}`;
    tree.position.set(x, 0, z);

    // Preserve the original size variation.
    tree.scale.setScalar(0.85 + (index % 4) * 0.12);

    // Preserve the existing world-scrolling behavior.
    tree.userData.scrollTree = true;
    tree.userData.scrollCity = true;

    group.add(tree);
  });

  console.log('[TREES] CREATED:', group.children.length);

  return group;
}

// ==========================================
// CREATE INDIVIDUAL TREE
// ==========================================

function createTree(index) {
  const tree = new THREE.Group();
  tree.name = `Tree_${index}`;

  const foliageMaterial =
    FOLIAGE_MATERIALS[index % FOLIAGE_MATERIALS.length];

  // Trunk.
  const trunk = new THREE.Mesh(
    TRUNK_GEOMETRY,
    TRUNK_MATERIAL
  );

  trunk.name = 'TreeTrunk';
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  trunk.receiveShadow = true;

  tree.add(trunk);

  // Broad lower canopy.
  const lower = new THREE.Mesh(
    LOWER_FOLIAGE_GEOMETRY,
    foliageMaterial
  );

  lower.name = 'TreeFoliageLower';
  lower.position.set(0, 2.45, 0);
  lower.scale.set(1.05, 0.85, 0.95);
  lower.castShadow = true;

  tree.add(lower);

  // Middle canopy layer.
  const middle = new THREE.Mesh(
    MIDDLE_FOLIAGE_GEOMETRY,
    foliageMaterial
  );

  middle.name = 'TreeFoliageMiddle';
  middle.position.set(0.12, 3.35, 0.02);
  middle.scale.set(1.05, 0.95, 1.0);
  middle.castShadow = true;

  tree.add(middle);

  // Smaller crown creates a fuller tree silhouette.
  const upper = new THREE.Mesh(
    UPPER_FOLIAGE_GEOMETRY,
    foliageMaterial
  );

  upper.name = 'TreeFoliageUpper';
  upper.position.set(-0.08, 4.25, 0);
  upper.scale.set(1.0, 1.05, 0.95);
  upper.castShadow = true;

  tree.add(upper);

  return tree;
}
