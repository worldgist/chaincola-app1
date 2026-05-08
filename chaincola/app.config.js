try {
  const path = require('path');
  // Resolve from this file so Metro/app.config always finds .env (cwd can differ)
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
  // dotenv not installed, continue without it
}

/** Single source with lib/supabase.ts (constants/supabase.json) */
const supabaseDefaults = require('./constants/supabase.json');

export default {
  expo: {
    name: "chaincola",
    slug: "chaincola",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/logo.png",
    scheme: "chaincola",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.chaincola.app",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"]
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#6B46C1",
        foregroundImage: "./assets/images/logo.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.chaincola.app",
      permissions: [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE"
      ]
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/logo.png",
          color: "#6B46C1"
          // sounds: add when ./assets/sounds/notification.wav exists
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      // Use same environment variables as website for shared Supabase backend
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || supabaseDefaults.url,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || supabaseDefaults.anonKey,
      // Zendit API key for gift card integration
      zenditApiKey: process.env.EXPO_PUBLIC_ZENDIT_API_KEY || process.env.NEXT_PUBLIC_ZENDIT_API_KEY || "",
      // Base URL for chaincola-transfer (Express service that proxies Flutterwave transfers)
      chaincolaTransferUrl: process.env.EXPO_PUBLIC_CHAINCOLA_TRANSFER_URL
        || process.env.NEXT_PUBLIC_CHAINCOLA_TRANSFER_URL
        || "https://api.chaincola.com",
      // Expo project ID for push notifications and EAS builds
      eas: {
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID || "06d99fdc-dc75-49e3-9140-e7687ede803f"
      }
    }
  }
};


