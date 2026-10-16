
import * as THREE from 'three';
import { File } from 'expo-file-system';
import { Image } from 'react-native';

/**
 * ThreeNativePatch.js
 *
 * Native loader compatibility for:
 * - React Native + Expo
 * - Three.js
 * - GLTFLoader
 * - Local .gltf and .bin files
 * - Local image textures
 *
 * Player.js should set:
 * globalThis.__THREE_ASSET_MAP = {
 *   'Soldier.gltf': modelUri,
 *   'Soldier.bin': binaryUri,
 *   'baseColor_1.jpg': baseColorUri,
 *   'normal_1.jpg': normalUri,
 * };
 */

// =====================================================
// 1. RESOLVE LOCAL ASSETS
// =====================================================

function resolveAssetUri(url) {
  if (typeof url !== 'string') {
    return url;
  }

  const assetMap = globalThis.__THREE_ASSET_MAP || {};

  let decodedUrl = url;

  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // Keep the original URL if decoding fails.
  }

  const cleanUrl = decodedUrl.split(/[?#]/)[0];
  const filename = cleanUrl.split('/').pop();

  // Exact filename match.
  if (assetMap[filename]) {
    return assetMap[filename];
  }

  // Case-insensitive filename match.
  const matchedKey = Object.keys(assetMap).find(
    (key) => key.toLowerCase() === filename.toLowerCase()
  );

  if (matchedKey) {
    return assetMap[matchedKey];
  }

  // Preserve supported absolute URLs.
  if (
    url.startsWith('file://') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }

  return url;
}

// =====================================================
// 2. URL BASE EXTRACTION
// =====================================================

if (THREE.LoaderUtils) {
  const originalExtractUrlBase =
    THREE.LoaderUtils.extractUrlBase;

  THREE.LoaderUtils.extractUrlBase = function (url) {
    if (typeof url !== 'string') {
      return '';
    }

    if (typeof originalExtractUrlBase !== 'function') {
      return '';
    }

    return originalExtractUrlBase.call(this, url);
  };
}

// =====================================================
// 3. NATIVE TEXTURE LOADER
// =====================================================

THREE.TextureLoader.prototype.load = function (
  url,
  onLoad,
  onProgress,
  onError
) {
  const texture = new THREE.Texture();
  const manager = this.manager;

  manager.itemStart(url);

  let resolvedUri;

  try {
    resolvedUri = resolveAssetUri(url);

    console.log('[TextureLoader] Requested:', url);
    console.log('[TextureLoader] Resolved:', resolvedUri);

    if (
      typeof resolvedUri !== 'string' ||
      !resolvedUri
    ) {
      throw new Error(
        `Invalid texture URI: ${String(resolvedUri)}`
      );
    }

    if (
      resolvedUri.startsWith('data:') ||
      resolvedUri.startsWith('blob:')
    ) {
      throw new Error(
        `Unsupported native texture URI: ${resolvedUri}`
      );
    }

    Image.getSize(
      resolvedUri,
      (width, height) => {
        try {
          /**
           * Retain the existing image representation.
           * If Expo GL cannot upload this representation,
           * a native-compatible image adapter may be needed.
           */
          texture.image = {
            data: {
              localUri: resolvedUri,
            },
            width,
            height,
          };

          // GLTFLoader applies the appropriate texture
          // coordinate settings for glTF textures.
          texture.flipY = false;

          // Albedo/base-color images use sRGB.
          if (
            resolvedUri.toLowerCase().includes('basecolor')
          ) {
            texture.colorSpace = THREE.SRGBColorSpace;
          }

          texture.needsUpdate = true;

          console.log('[TextureLoader] Image dimensions:', {
            width,
            height,
            uri: resolvedUri,
          });

          manager.itemEnd(url);

          if (onLoad) {
            onLoad(texture);
          }
        } catch (error) {
          console.error(
            '[TextureLoader] Texture setup failed:',
            error
          );

          manager.itemError(url);
          manager.itemEnd(url);

          if (onError) {
            onError(error);
          }
        }
      },
      (error) => {
        console.error(
          '[TextureLoader] Image read failed:',
          resolvedUri,
          error
        );

        manager.itemError(url);
        manager.itemEnd(url);

        if (onError) {
          onError(error);
        }
      }
    );
  } catch (error) {
    console.error('[TextureLoader] Failed:', error);

    manager.itemError(url);
    manager.itemEnd(url);

    if (onError) {
      onError(error);
    }
  }

  return texture;
};

// =====================================================
// 4. NATIVE FILE LOADER
// =====================================================

THREE.FileLoader.prototype.load = function (
  url,
  onLoad,
  onProgress,
  onError
) {
  const manager = this.manager;

  manager.itemStart(url);

  const loadFile = async () => {
    let arrayBuffer;

    // -----------------------------------------------
    // A. Read the file
    // -----------------------------------------------

    try {
      const resolvedUri = resolveAssetUri(url);

      console.log('[FileLoader] Requested:', url);
      console.log('[FileLoader] Resolved:', resolvedUri);

      if (
        typeof resolvedUri !== 'string' ||
        !resolvedUri
      ) {
        throw new Error(
          `Invalid file URI: ${String(resolvedUri)}`
        );
      }

      if (
        resolvedUri.startsWith('http://') ||
        resolvedUri.startsWith('https://')
      ) {
        const response = await fetch(resolvedUri);

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${resolvedUri}`
          );
        }

        arrayBuffer = await response.arrayBuffer();
      } else if (resolvedUri.startsWith('file://')) {
        const file = new File(resolvedUri);
        arrayBuffer = await file.arrayBuffer();
      } else {
        throw new Error(
          `Unsupported file URI: ${resolvedUri}`
        );
      }

      if (!(arrayBuffer instanceof ArrayBuffer)) {
        throw new Error(
          'FileLoader did not return an ArrayBuffer'
        );
      }

      console.log(
        '[FileLoader] Loaded bytes:',
        arrayBuffer.byteLength
      );
    } catch (error) {
      console.error(
        '[FileLoader] File read failed:',
        url,
        error
      );

      manager.itemError(url);
      manager.itemEnd(url);

      if (onError) {
        onError(error);
      }

      return;
    }

    // -----------------------------------------------
    // B. Notify Three.js that the file was read
    // -----------------------------------------------

    manager.itemEnd(url);

    /**
     * Deliberately outside the file-reading try/catch.
     * If GLTFLoader throws while parsing the file,
     * its original stack trace remains visible.
     */

  if (onLoad) {
  try {
    onLoad(arrayBuffer);
  } catch (error) {
    console.error(
      '[GLTF INTERNAL ERROR]',
      error?.message ?? String(error)
    );
    console.error(
      '[GLTF INTERNAL STACK]',
      error?.stack ?? 'No stack available'
    );
    throw error;
  }
}
  };

  loadFile();

  return this;
};

console.log('THREE NATIVE LOADERS PATCHED');
