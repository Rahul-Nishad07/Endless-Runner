
import type * as THREE from 'three';

export function createObstacles(): THREE.Group;

export function resetObstacles(
  group: THREE.Group
): void;

export type ObstacleDifficulty = {
  spacing: number;
  jitter: number;
  timeGapSpeed: number;
};

export function updateObstacles(
  group: THREE.Group,
  delta: number,
  speed?: number,
  player?: any,
  onCollision?: (obstacle: THREE.Object3D) => void,
  gameOver?: boolean,
  difficulty?: ObstacleDifficulty,
  onPass?: (obstacle: THREE.Object3D) => void
): void;

export function setObstacleTheme(theme: string): void;
