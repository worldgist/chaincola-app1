try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, continue without it
}

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
    packagerOpts: {
      host: "0.0.0.0",
      port: 8081
    },
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
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "https://slleojsdpctxhlsoyenr.supabase.co",
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNjU5OTEsImV4cCI6MjA4MTc0MTk5MX0.itqrU9VqzNKPSodPGJtMs5ViQU8gDUQ05bvmvlKkfRw",
      // Zendit API key for gift card integration
      zenditApiKey: process.env.EXPO_PUBLIC_ZENDIT_API_KEY || process.env.NEXT_PUBLIC_ZENDIT_API_KEY || "",
      // Expo project ID for push notifications and EAS builds
      eas: {
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID || "06d99fdc-dc75-49e3-9140-e7687ede803f"
      }
    }
  }
};


