
import * as THREE from "three";

export function createPowerUps(
  scene: THREE.Scene
): THREE.Group;

export function updatePowerUps(
  group: THREE.Group,
  delta: number,
  speed?: number,
  player?: THREE.Object3D | { group: THREE.Object3D } | null,
  onCollect?: (type: string) => void
): void;
