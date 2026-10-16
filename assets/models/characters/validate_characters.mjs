// Validates the generated character GLB files with three.js itself.
// Run from the project root:  node assets/models/characters/validate_characters.mjs
//
// Checks per file: the file loads with GLTFLoader; it has real meshes, a
// skeleton and skin weights; each expected clip exists and plays through
// AnimationMixer; skinned feet stay on the ground (no deformation or sinking);
// the character faces +Z; and the mesh stays a sensible size.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const FILES = ['street-sprinter.glb', 'jungle-explorer.glb'];
const EXPECTED_CLIPS = ['Idle', 'Run', 'Walk', 'Jump', 'Fall', 'Land', 'Slide'];

let failures = 0;
const check = (cond, message) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${message}`);
  if (!cond) failures += 1;
};

function parse(buffer) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, reject);
  });
}

function skinnedVertexBounds(mesh, scratch) {
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const count = mesh.geometry.attributes.position.count;

  for (let i = 0; i < count; i++) {
    mesh.getVertexPosition(i, scratch);
    minY = Math.min(minY, scratch.y);
    maxY = Math.max(maxY, scratch.y);
    minZ = Math.min(minZ, scratch.z);
    maxZ = Math.max(maxZ, scratch.z);
  }

  return { minY, maxY, minZ, maxZ };
}

for (const file of FILES) {
  const full = path.join(HERE, file);
  console.log(`\n== ${file}`);

  const exists = fs.existsSync(full);
  check(exists, 'file exists');
  if (!exists) continue;

  const buffer = fs.readFileSync(full).buffer.slice(0);
  check(buffer.byteLength > 1000, `file is non-trivial (${buffer.byteLength} bytes)`);

  let gltf;
  try {
    gltf = await parse(buffer);
  } catch (error) {
    check(false, `GLTFLoader parses the file (${error?.message || error})`);
    continue;
  }
  check(true, 'GLTFLoader parses the file');

  const scene = gltf.scene;
  let skinned = null;
  let meshCount = 0;
  scene.traverse((o) => {
    if (o.isMesh) meshCount += 1;
    if (o.isSkinnedMesh && !skinned) skinned = o;
  });

  check(meshCount >= 1, `contains real meshes (${meshCount})`);
  check(skinned !== null, 'contains a skinned mesh');
  if (!skinned) continue;

  const bones = skinned.skeleton.bones;
  check(bones.length >= 10, `usable skeleton with ${bones.length} bones`);

  const skinIndex = skinned.geometry.attributes.skinIndex;
  const skinWeight = skinned.geometry.attributes.skinWeight;
  check(skinIndex && skinWeight, 'has skin indices and weights');

  let weightsOk = true;
  for (let i = 0; i < skinWeight.count && weightsOk; i++) {
    const sum = skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i);
    if (Math.abs(sum - 1) > 1e-4) weightsOk = false;
  }
  check(weightsOk, 'every vertex weight sums to 1');

  const materials = skinned.material;
  check(materials && (Array.isArray(materials) ? materials.length > 0 : true), 'has materials');

  // Clips
  const clipNames = gltf.animations.map((c) => c.name);
  console.log(`      clips: ${clipNames.join(', ')}`);
  for (const name of EXPECTED_CLIPS) {
    check(clipNames.includes(name), `clip "${name}" is present`);
  }

  // Bind pose: feet on the ground, facing +Z, sensible height
  const scratch = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  skinned.skeleton.update();
  const bind = skinnedVertexBounds(skinned, scratch);
  check(Math.abs(bind.minY) < 0.02, `bind pose stands on the ground (min y ${bind.minY.toFixed(3)})`);
  check(bind.maxY - bind.minY > 1.5 && bind.maxY - bind.minY < 2.2, `sensible height (${(bind.maxY - bind.minY).toFixed(2)} units)`);
  check(bind.maxZ > 0.15, `faces +Z (feet reach z ${bind.maxZ.toFixed(2)})`);

  // Play every clip and check the skinned feet and body stay in range
  const mixer = new THREE.AnimationMixer(scene);
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(clip.name === 'Jump' || clip.name === 'Land' || clip.name === 'Slide'
      ? THREE.LoopOnce
      : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.play();

    let worstMinY = Infinity;
    let worstMaxY = -Infinity;
    let finite = true;
    const steps = Math.ceil(clip.duration * 60);

    for (let s = 0; s <= steps; s++) {
      mixer.setTime(Math.min(s / 60, clip.duration));
      scene.updateMatrixWorld(true);
      skinned.skeleton.update();
      const b = skinnedVertexBounds(skinned, scratch);
      if (!Number.isFinite(b.minY) || !Number.isFinite(b.maxY)) finite = false;
      worstMinY = Math.min(worstMinY, b.minY);
      worstMaxY = Math.max(worstMaxY, b.maxY);
    }

    action.stop();
    mixer.uncacheClip(clip);

    check(finite, `"${clip.name}" plays with finite skinned geometry`);
    // Ground contact: the lowest point should not sink much below the ground.
    check(worstMinY > -0.25, `"${clip.name}" does not sink into the ground (lowest y ${worstMinY.toFixed(2)})`);
    // Body should not stretch wildly.
    check(worstMaxY < 2.5, `"${clip.name}" stays within a sensible height (highest y ${worstMaxY.toFixed(2)})`);
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
