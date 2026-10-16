const {
  getDefaultConfig
} = require('expo/metro-config');

const config =
  getDefaultConfig(
    __dirname
  );

const assetExts =
  config.resolver.assetExts;

if (
  !assetExts.includes('glb')
) {
  assetExts.push('glb');
}

if (
  !assetExts.includes('gltf')
) {
  assetExts.push('gltf');
}

if (
  !assetExts.includes('bin')
) {
  assetExts.push('bin');
}

module.exports = config;