// ============================================
// STATIC SCENERY MERGING
//
// Combines many small static meshes into a few larger ones, so the GPU
// gets far fewer draw calls. Used once per environment zone when it is
// built. Scenery is never moved or changed individually at runtime, so
// merging does not change how it looks or behaves.
//
// Meshes are only merged when they are safe to combine:
// - opaque materials (transparent meshes keep their own draw order)
// - standard indexed geometry with position, normal and uv
// Anything else is left as it is.
// ============================================

import * as THREE from 'three';

// Keeps merged indices below 65,536 for WebGL 1 compatibility.
const MAX_VERTICES_PER_MERGE = 60000;

// Splits a zone along Z so merged meshes can still be frustum-culled.
const BUCKET_LENGTH = 70;

function isMergeable(mesh) {
  const { geometry, material } = mesh;

  // Meshes that change at runtime (such as River water) stay separate.
  if (mesh.userData.noMerge) return false;

  if (!geometry?.index) return false;
  if (!geometry.attributes.position) return false;
  if (!geometry.attributes.normal) return false;
  if (!geometry.attributes.uv) return false;

  if (Array.isArray(material)) return false;
  if (!material || material.transparent || material.opacity < 1) {
    return false;
  }

  return true;
}

function createBucket(material, z) {
  return {
    material,
    z,
    meshes: [],
  };
}

function appendMesh(target, mesh, matrix, normalMatrix) {
  const { geometry } = mesh;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;
  const index = geometry.index;

  const vertexOffset = target.positions.length / 3;

  const v = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i).applyMatrix4(matrix);
    target.positions.push(v.x, v.y, v.z);

    v.fromBufferAttribute(normals, i)
      .applyMatrix3(normalMatrix)
      .normalize();
    target.normals.push(v.x, v.y, v.z);

    target.uvs.push(uvs.getX(i), uvs.getY(i));
  }

  for (let i = 0; i < index.count; i++) {
    target.indices.push(index.getX(i) + vertexOffset);
  }
}

function buildMesh(bucket, group, parts) {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(parts.positions, 3)
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(parts.normals, 3)
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(parts.uvs, 2)
  );
  geometry.setIndex(parts.indices);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, bucket.material);

  mesh.name = 'MergedScenery';
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  group.add(mesh);
}

/**
 * Merges mergeable meshes under `root` by material and Z slice.
 * `root` should not yet be positioned in the scene, since merged
 * geometry is baked in `root`'s local space.
 *
 * Returns the number of meshes removed.
 */
export function mergeStaticScenery(root) {
  root.updateMatrixWorld(true);

  const buckets = new Map();
  const originals = [];

  root.traverse((object) => {
    if (!object.isMesh || !isMergeable(object)) return;

    // Skip meshes that are already merged.
    if (object.name === 'MergedScenery') return;

    const position = new THREE.Vector3().setFromMatrixPosition(
      object.matrixWorld
    );

    const slice = Math.floor(-position.z / BUCKET_LENGTH);
    const key = `${object.material.uuid}|${slice}`;

    if (!buckets.has(key)) {
      buckets.set(key, createBucket(object.material, slice));
    }

    buckets.get(key).meshes.push(object);
    originals.push(object);
  });

  for (const bucket of buckets.values()) {
    let parts = null;

    const flush = () => {
      if (parts && parts.indices.length > 0) {
        buildMesh(bucket, root, parts);
      }
      parts = null;
    };

    for (const mesh of bucket.meshes) {
      const vertexCount = mesh.geometry.attributes.position.count;

      if (parts && parts.positions.length / 3 + vertexCount > MAX_VERTICES_PER_MERGE) {
        flush();
      }

      if (!parts) {
        parts = { positions: [], normals: [], uvs: [], indices: [] };
      }

      mesh.updateWorldMatrix(true, false);

      const matrix = mesh.matrixWorld;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

      appendMesh(parts, mesh, matrix, normalMatrix);
    }

    flush();
  }

  // Geometry is not disposed here, since it may be shared with meshes
  // that were not merged.
  for (const mesh of originals) {
    mesh.parent?.remove(mesh);
  }

  return originals.length;
}
