import * as THREE from 'three';

// three.js calls .trim() on the GL info logs when a program is first used.
// If a log comes back as anything but a string, that call throws and the
// frame fails. This keeps the log a string, and reports the first time it
// happens, so the device log shows whether it occurs at all.
const GUARDED_LOG_METHODS = ['getShaderInfoLog', 'getProgramInfoLog'];

export function guardInfoLogs(gl) {
  for (const name of GUARDED_LOG_METHODS) {
    const original = gl[name];

    if (typeof original !== 'function' || original.__guarded) continue;

    let warned = false;

    const guarded = function (object) {
      const log = original.call(this, object);

      if (typeof log === 'string') return log;

      if (!warned) {
        warned = true;
        console.warn(
          `[GL] ${name} returned ${typeof log} instead of a string; using an empty log`
        );
      }

      return '';
    };

    guarded.__guarded = true;

    try {
      gl[name] = guarded;
    } catch (error) {
      console.warn(`[GL] could not guard ${name}:`, error?.message || error);
    }
  }
}

// Development only. Draws one plain cube before the game scene, so a
// failure here means the renderer or GL context itself is broken, not the
// game content. The cube is never presented: the first game frame clears it.
export function runRendererSelfTest(renderer) {
  if (!(typeof __DEV__ !== 'undefined' && __DEV__)) {
    return { ok: true, skipped: true };
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
  camera.position.set(0, 0, 3);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  scene.add(new THREE.Mesh(geometry, material));

  try {
    renderer.render(scene, camera);
    return { ok: true, skipped: false };
  } catch (error) {
    return { ok: false, skipped: false, error: error?.message || String(error) };
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

export function createThreeRenderer(gl) {
  guardInfoLogs(gl);

  const canvas = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientWidth: gl.drawingBufferWidth,
    clientHeight: gl.drawingBufferHeight,

    style: {},

    addEventListener: () => {},
    removeEventListener: () => {},

    setAttribute: () => {},
    getAttribute: () => null,
  };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl,
    antialias: true,
  });

  renderer.setSize(
    gl.drawingBufferWidth,
    gl.drawingBufferHeight,
    false
  );

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  renderer.shadowMap.enabled = true;

  renderer.shadowMap.type =
    THREE.PCFSoftShadowMap;

  return renderer;
}
