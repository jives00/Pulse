const { withGradleProperties } = require('@expo/config-plugins');

// @react-native-voice/voice does not support the new React Native architecture.
// This plugin forces newArchEnabled=false in gradle.properties so the native
// module loads via the legacy bridge instead of TurboModules.
module.exports = (config) => {
  return withGradleProperties(config, (config) => {
    const idx = config.modResults.findIndex(
      (p) => p.type === 'property' && p.key === 'newArchEnabled'
    );
    if (idx >= 0) {
      config.modResults[idx].value = 'false';
    } else {
      config.modResults.push({ type: 'property', key: 'newArchEnabled', value: 'false' });
    }
    return config;
  });
};
