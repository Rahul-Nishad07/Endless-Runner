import * as THREE from 'three';

import { createLighting } from '../three/Lighting';
import { createCamera } from '../three/Camera';
import Player from '../player/Player';
import { createObstacles } from '../world/Obstacles';
import { createCoins } from '../world/Coins';
import { createEnvironment } from '../world/Environment';

const SKY_COLOR = 0x8fd3ff;
const FOG_NEAR = 55;
const FOG_FAR = 240;

const GROUND_SIZE = 350;
const GROUND_CENTER_Z = -145;

/**
 * @param {number} width
 * @param {number} height
 * @param {any} [modelSet] Model set from CharacterModels.js. Omit for the default runner.
 */
export async function createGameWorld(width, height, modelSet = undefined) {
  console.log('==============================');
  console.log('CREATING ENDLESS RUNNER WORLD');
  console.log('==============================');

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(
    SKY_COLOR,
    FOG_NEAR,
    FOG_FAR
  );

  // City, Jungle, Bridge, Ancient Ruins and River
  // are all managed by this single environment system.
  const environment = createEnvironment(scene);

  console.log(
    '[WORLD] Environment zones:',
    environment.zoneNames.join(' → ')
  );

  const camera = createCamera(width, height);

  const lighting = createLighting(scene);

  // Background ground remains beneath the zones.
  // Zone-specific grounds and roads move with their zones.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({
      color: 0x456d3a,
      roughness: 1,
    })
  );

  ground.name = 'WorldGround';
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(
    0,
    -0.12,
    GROUND_CENTER_Z
  );
  ground.receiveShadow = true;

  scene.add(ground);

  // Player.
  const player = new Player();

  const playerStarted = Date.now();
  console.log('[WORLD] Loading player model...');

  await player.load(modelSet);

  console.log(`[WORLD] Player model ready in ${Date.now() - playerStarted} ms`);

  player.setPosition(0, 0, 2);
  scene.add(player.group);

  // Gameplay objects remain independent of environment zones.
  const obstacles = createObstacles();

  obstacles.name = 'RunnerObstacles';
  scene.add(obstacles);

  const coins = createCoins();

  coins.name = 'RunnerCoins';
  scene.add(coins);

  console.log('[WORLD] World created successfully');

  return {
    scene,
    camera,
    player,
    obstacles,
    coins,
    ground,
    environment,
    lighting,
  };
}