
import type * as THREE from 'three';

export function createCoins(
  scene?: THREE.Scene | null
): THREE.Group;

export function resetCoins(
  group: THREE.Group
): void;

export function updateCoins(
  group: THREE.Group,
  delta: number,
  speed?: number,
  player?: THREE.Object3D | null,
  onCollect?: (amount: number) => void,
  powerUpState?: { magnetActive?: boolean }
): void;

export function setKeyCoinsEnabled(enabled: boolean): void;
