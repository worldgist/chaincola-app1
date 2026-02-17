module.exports = function(api) {
  api.cache(false); // Disable cache to ensure fresh plugin loading
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // For Reanimated 4.x, use react-native-worklets/plugin instead of react-native-reanimated/plugin
      'react-native-worklets/plugin',
    ],
  };
};
