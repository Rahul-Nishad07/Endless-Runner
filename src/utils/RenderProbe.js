// ============================================
// RENDER PROBE — DEVELOPMENT ONLY
//
// Finds which material cannot compile on the device. It compiles each
// visible material on its own and logs the ones that throw, with the
// object name and material details. Runs once, during development. Does
// nothing in production builds.
// ============================================

export function probeFailingMaterials(renderer, scene, camera) {
  if (!(typeof __DEV__ !== 'undefined' && __DEV__)) return [];

  const failing = [];
  const checked = new Set();

  scene.traverse((object) => {
    if (!object.isMesh || !object.visible || !object.material) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (checked.has(material.uuid)) continue;
      checked.add(material.uuid);

      try {
        renderer.compile(object, camera);
      } catch (error) {
        failing.push({
          object: object.name || object.type,
          parent: object.parent?.name || object.parent?.type || 'none',
          materialType: material.type,
          materialName: material.name || '(unnamed)',
          color: material.color ? material.color.getHexString() : null,
          transparent: material.transparent,
          side: material.side,
          message: error?.message || String(error),
        });
      }
    }
  });

  console.log(
    `[RENDER PROBE] ${checked.size} materials checked, ${failing.length} failed to compile`
  );

  for (const item of failing) {
    console.log('[RENDER PROBE] FAILED', JSON.stringify(item));
  }

  return failing;
}
