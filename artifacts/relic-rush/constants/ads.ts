// AdMob configuration. The AdMob *App* ID lives in app.json (react-native-google-mobile-ads plugin);
// ad *unit* IDs live here. Leave a unit empty to fall back to Google's test unit.
export const ADMOB_UNITS = {
  // "Death Revive" rewarded unit
  rewardedRevive: {
    ios: 'ca-app-pub-5460578244337908/9870108318',
    android: '',
  },
};

/** Serve Google test ads: always in development, and in any build made with EXPO_PUBLIC_ADS_TEST=1
 * (eas.json sets it for TestFlight builds so testers never click live ads). */
export const USE_TEST_ADS = __DEV__ || process.env.EXPO_PUBLIC_ADS_TEST === '1';
