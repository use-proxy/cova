const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb', 'gltf', 'hdr', 'ktx2');
config.watchFolders = [path.resolve(__dirname, '../..')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../..', 'node_modules'),
];
config.resolver.extraNodeModules = {
  '@cova/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
};
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;
