module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module:babel-plugin-module-resolver',
        {
          alias: {
            '@cova/shared': '../../packages/shared/src/index.ts',
          },
        },
      ],
      'react-native-reanimated/plugin', // MUST be last
    ],
  };
};
