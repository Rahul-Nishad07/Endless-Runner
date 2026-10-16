
import '../game/utils/ThreeNativePatch';

import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { PlayerAnimation } from './PlayerAnimation';

export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.model = null;
    this.mixer = null;
    this.animation = null;
    this.animations = [];

    this.loader = new GLTFLoader();

    this.loaded = false;
    this.destroyed = false;

    // Player position and lane configuration
    this.position = {
      x: 0,
      y: 0,
      z: 2,
    };

    this.currentLane = 0;
    this.laneWidth = 2.5;

    // Visual configuration
    this.modelScale = 1.5;

    // Change to 0, Math.PI / 2, or -Math.PI / 2
    // if the character faces the wrong direction.
    this.modelRotationY = Math.PI;

    this.runSpeed = 1;
  }

  async getLocalAsset(moduleAsset) {
    const asset = Asset.fromModule(moduleAsset);

    await asset.downloadAsync();

    if (!asset.localUri) {
      throw new Error(
        `Unable to resolve local asset: ${asset.name}`
      );
    }

    return asset.localUri;
  }

  async readJson(uri) {
    const file = new File(uri);
    const content = await file.text();

    return JSON.parse(content);
  }

  async load() {
    try {
      console.log('=============================');
      console.log('PLAYER GLTF LOADING');
      console.log('=============================');

      // Load the extracted GLTF file and its external assets.
      const gltfUri = await this.getLocalAsset(
        require('../../assets/models/player/runner-extracted/runner.gltf')
      );

      const binUri = await this.getLocalAsset(
        require('../../assets/models/player/runner-extracted/runner.bin')
      );

      const baseColorUri = await this.getLocalAsset(
        require('../../assets/models/player/runner-extracted/baseColor_1.png')
      );

      const metallicRoughnessUri = await this.getLocalAsset(
        require('../../assets/models/player/runner-extracted/metallicRoughness_1.png')
      );

      const normalUri = await this.getLocalAsset(
        require('../../assets/models/player/runner-extracted/normal_1.png')
      );

      console.log('GLTF LOCAL URI:', gltfUri);
      console.log('READING GLTF JSON...');

      const gltfJSON = await this.readJson(gltfUri);

      console.log('GLTF JSON READ SUCCESSFULLY');

      // Replace the relative asset references with local file URIs.
      if (
        gltfJSON.buffers &&
        gltfJSON.buffers.length > 0
      ) {
        gltfJSON.buffers[0].uri = binUri;
      }

      if (
        gltfJSON.images &&
        gltfJSON.images.length >= 3
      ) {
        // These match the image order in runner.gltf.
        gltfJSON.images[0].uri = baseColorUri;
        gltfJSON.images[1].uri = metallicRoughnessUri;
        gltfJSON.images[2].uri = normalUri;
      } else {
        throw new Error(
          'Expected three external texture images in runner.gltf'
        );
      }

      console.log('EXTERNAL PLAYER ASSETS READY');
      console.log('BIN:', binUri);
      console.log('BASE COLOR:', baseColorUri);
      console.log('METALLIC ROUGHNESS:', metallicRoughnessUri);
      console.log('NORMAL:', normalUri);

      console.log('PARSING GLTF...');

      const gltf = await this.loader.parseAsync(
        JSON.stringify(gltfJSON),
        ''
      );

      if (this.destroyed) {
        return null;
      }

      console.log('GLTF PARSED SUCCESSFULLY');
      console.log('SETTING UP PLAYER MODEL...');

      this.model = gltf.scene;

      if (!this.model) {
        throw new Error(
          'GLTF loaded, but no scene was found in the model'
        );
      }

      // Configure mesh rendering.
      this.model.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;

          if (object.material) {
            const materials = Array.isArray(
              object.material
            )
              ? object.material
              : [object.material];

            materials.forEach((material) => {
              material.needsUpdate = true;
            });
          }
        }
      });

      // Normalize the model around its center and ground level.
      this.model.updateMatrixWorld(true);

      const originalBox = new THREE.Box3().setFromObject(
        this.model
      );

      const originalSize = new THREE.Vector3();
      originalBox.getSize(originalSize);

      const originalCenter = new THREE.Vector3();
      originalBox.getCenter(originalCenter);

      console.log(
        'PLAYER ORIGINAL SIZE:',
        originalSize.x,
        originalSize.y,
        originalSize.z
      );

      // Center horizontally and align the feet with y = 0.
      this.model.position.x -= originalCenter.x;
      this.model.position.z -= originalCenter.z;
      this.model.position.y -= originalBox.min.y;

      // Set character size.
      this.model.scale.setScalar(this.modelScale);

      // Correct the character's facing direction.
      this.model.rotation.y = this.modelRotationY;

      this.model.updateMatrixWorld(true);

      // Add the model to the player container.
      this.group.add(this.model);

      // Save the player's initial position.
      this.group.position.set(
        this.position.x,
        this.position.y,
        this.position.z
      );

      // The original GLTF has no animation clips.
      this.animations = gltf.animations || [];

      if (this.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(
          this.model
        );

        console.log(
          'GLTF ANIMATIONS FOUND:',
          this.animations.length
        );

        // Play the first available animation.
        const firstAction = this.mixer.clipAction(
          this.animations[0]
        );

        firstAction.play();
      } else {
        console.log(
          'NO ANIMATIONS FOUND IN GLTF'
        );

        // Procedural animation: subtle bounce and body lean.
        this.animation = new PlayerAnimation(
          this.model
        );
      }

      this.loaded = true;

      console.log(
        'PLAYER GLTF LOADED SUCCESSFULLY'
      );

      return this.group;
    } catch (error) {
      console.error(
        'ERROR PLAYER GLTF LOAD ERROR:',
        error
      );

      throw error;
    }
  }

  setPosition(x, y, z) {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;

    this.group.position.set(x, y, z);
  }

  setLane(lane) {
    // Supported lanes: -1, 0, 1.
    const safeLane = Math.max(
      -1,
      Math.min(1, lane)
    );

    this.currentLane = safeLane;

    this.position.x =
      safeLane * this.laneWidth;
  }

  moveLeft() {
    this.setLane(this.currentLane - 1);
  }

  moveRight() {
    this.setLane(this.currentLane + 1);
  }

  update(delta) {
    if (!this.loaded || this.destroyed) {
      return;
    }

    const safeDelta = Math.min(
      Math.max(delta || 0, 0),
      0.05
    );

    // Update any embedded GLTF animation.
    if (this.mixer) {
      this.mixer.update(safeDelta);
    }

    // Update the procedural running animation.
    if (this.animation) {
      this.animation.update(safeDelta);
    }

    // Smoothly move toward the selected lane.
    const targetX =
      this.currentLane * this.laneWidth;

    this.group.position.x = THREE.MathUtils.damp(
      this.group.position.x,
      targetX,
      12,
      safeDelta
    );

    // Keep the player at the configured forward position.
    this.group.position.z = this.position.z;
  }

  destroy() {
    this.destroyed = true;

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }

    if (this.animation) {
      this.animation.reset();
      this.animation = null;
    }

    this.group.clear();

    this.model = null;
    this.loaded = false;
  }
}
