
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
 * Creates the complete endless-runner game world.
 *
 * @param {number} width
 * @param {number} height
 * @param {any} [modelSet] Optional character model configuration.
 * @returns {Promise<{
 *   scene: THREE.Scene,
 *   camera: THREE.Camera,
 *   player: Player,
 *   obstacles: THREE.Group,
 *   coins: THREE.Group,
 *   ground: THREE.Mesh,
 *   environment: any,
 *   lighting: any
 
 * }>}
 */
export async function createGameWorld(
  width,
  height,
  modelSet = undefined
) {
  console.log('==============================');
  console.log('CREATING ENDLESS RUNNER WORLD');
  console.log('==============================');

  // --------------------------------------------------
  // SCENE AND ATMOSPHERE
  // --------------------------------------------------

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(
    SKY_COLOR,
    FOG_NEAR,
    FOG_FAR
  );

  // --------------------------------------------------
  // ENVIRONMENT
  // City, Jungle, Bridge, Ancient Ruins and River
  // remain managed by the existing environment system.
  // --------------------------------------------------

  const environment = createEnvironment(scene);

  console.log(
    '[WORLD] Environment zones:',
    environment.zoneNames.join(' → ')
  );

  // --------------------------------------------------
  // SIDE TRAIN TRACKS AND TRAINS
  // Tracks and trains are outside the playable road.
  // Their movement is controlled by index.tsx.
  // --------------------------------------------------



  // --------------------------------------------------
  // CAMERA AND LIGHTING
  // --------------------------------------------------

  const camera = createCamera(width, height);

  const lighting = createLighting(scene);

  // --------------------------------------------------
  // BACKGROUND GROUND
  // Zone-specific grounds and roads continue to be
  // managed by the existing environment system.
  // --------------------------------------------------

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(
      GROUND_SIZE,
      GROUND_SIZE
    ),
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

  // --------------------------------------------------
  // PLAYER
  // --------------------------------------------------

  const player = new Player();

  const playerStarted = Date.now();

  console.log('[WORLD] Loading player model...');

  await player.load(modelSet);

  console.log(
    `[WORLD] Player model ready in ${
      Date.now() - playerStarted
    } ms`
  );

  player.setPosition(0, 0, 2);

  scene.add(player.group);

  // --------------------------------------------------
  // OBSTACLES
  // --------------------------------------------------

  const obstacles = createObstacles();

  obstacles.name = 'RunnerObstacles';

  scene.add(obstacles);

  // --------------------------------------------------
  // COINS
  // --------------------------------------------------

  const coins = createCoins();

  coins.name = 'RunnerCoins';

  scene.add(coins);

  // --------------------------------------------------
  // COMPLETE
  // --------------------------------------------------

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

export default createGameWorld;
