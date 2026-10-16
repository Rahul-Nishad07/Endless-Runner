import * as THREE from 'three';

import { createBuildings } from './Buildings';
import { createTrees } from './Trees';
import { createStreetLights } from './StreetLights';
import { createProps } from './Props';
import { createTrafficSignals } from './TrafficSignals';

const CITY_GROUPS = [
  {
    name: 'CityBuildings',
    create: createBuildings,
  },
  {
    name: 'CityTrees',
    create: createTrees,
  },
  {
    name: 'CityStreetLights',
    create: createStreetLights,
  },
  {
    name: 'CityProps',
    create: createProps,
  },
  {
    name: 'CityTrafficSignals',
    create: createTrafficSignals,
  },
];

export function createCity() {
  const city = new THREE.Group();

  city.name = 'CityScenery';

  // The parent environment zone controls the position.
  // Do not move or recycle this group independently.
  city.position.set(0, 0, 0);
  city.userData.isScrollingCity = false;

  const stats = {
    groups: 0,
    meshes: 0,
    lights: 0,
  };

  for (const config of CITY_GROUPS) {
    const group = config.create();

    if (!group) {
      console.warn(
        `[CITY] ${config.name} was not created`
      );
      continue;
    }

    group.name = config.name;
    group.userData.cityModule = true;

    city.add(group);
    stats.groups += 1;

    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        stats.meshes += 1;
      }

      if (
        object instanceof THREE.Light ||
        object.userData?.isStreetLight === true
      ) {
        stats.lights += 1;
      }
    });
  }

  console.log('[CITY] Created:', stats);
  console.log(
    '[CITY] Modules:',
    city.children.map((child) => child.name).join(', ')
  );

  return city;
}