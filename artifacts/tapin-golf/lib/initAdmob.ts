// Native (iOS/Android) — initialise AdMob SDK once at app startup.
// Guarded by appOwnership check because TurboModuleRegistry.getEnforcing()
// throws a hard uncaught error in Expo Go (the native binary is absent).
// In an EAS development/production build, appOwnership is null/'standalone'
// and the module is properly linked.
import Constants from "expo-constants";

if (Constants.appOwnership !== "expo") {
  try {
    const { mobileAds } = require("react-native-google-mobile-ads");
    mobileAds()
      .initialize()
      .catch(() => {});
    if (__DEV__) {
      mobileAds()
        .setRequestConfiguration({ testDeviceIdentifiers: ["EMULATOR"] })
        .catch(() => {});
    }
  } catch (_) {}
}
