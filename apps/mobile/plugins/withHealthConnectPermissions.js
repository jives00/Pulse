const { withAndroidManifest } = require('@expo/config-plugins');

// Health Connect requires these permissions declared in AndroidManifest.xml.
// The react-native-health-connect app.plugin.js ignores its own androidPermissions
// option entirely, so we declare them here instead. We also take over the
// ACTION_SHOW_PERMISSIONS_RATIONALE intent-filter that the library plugin would add,
// so we can deduplicate it (the library does a raw push without a duplicate check).
const HEALTH_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.WRITE_NUTRITION',
  'android.permission.health.WRITE_HYDRATION',
  'android.permission.health.WRITE_EXERCISE_SESSION',
  'android.permission.health.WRITE_WEIGHT',
  'android.permission.health.WRITE_TOTAL_CALORIES_BURNED',
];

const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';

module.exports = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    for (const permission of HEALTH_PERMISSIONS) {
      const alreadyAdded = manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === permission
      );
      if (!alreadyAdded) {
        manifest['uses-permission'].push({ $: { 'android:name': permission } });
      }
    }

    const activity = manifest.application[0].activity[0];
    if (!activity['intent-filter']) {
      activity['intent-filter'] = [];
    }
    const hasRationale = activity['intent-filter'].some(
      (f) => f.action && f.action.some((a) => a.$ && a.$['android:name'] === RATIONALE_ACTION)
    );
    if (!hasRationale) {
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': RATIONALE_ACTION } }],
      });
    }

    return config;
  });
};
