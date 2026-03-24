export default ({ config }) => ({
  ...config,
  owner: "cova.interior",
  jsEngine: "hermes",
  newArchEnabled: false,
  name: "Cova",
  slug: "cova",
  scheme: "cova",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#1B3A2D",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "ai.cova.app",
    buildNumber: "1",
    minimumOsVersion: "16.0",
    infoPlist: {
      NSCameraUsageDescription: "Cova needs camera access to capture your room.",
      NSPhotoLibraryUsageDescription: "Cova needs photo library access to upload your room photo.",
      NSPhotoLibraryAddUsageDescription: "Cova saves your AI renders to your photo library.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    "expo-apple-authentication",
    "expo-camera",
    "expo-image-picker",
    "expo-media-library",
  ],
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    ...config.extra,
    eas: {
      projectId: "3255a6b5-e211-461c-b168-a60d034ac580",
    },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
