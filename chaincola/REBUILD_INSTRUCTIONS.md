# Rebuild Development Client Instructions

## Issue
Worklets version mismatch: JavaScript 0.7.2 vs Native 0.5.1

## Solution: Rebuild Development Client

Since you're using a custom development client (`developmentClient: true` in eas.json), you need to rebuild it with the updated native modules.

### For iOS:
```bash
cd /Applications/chaincola/chaincola
eas build --profile development --platform ios
```

### For Android:
```bash
cd /Applications/chaincola/chaincola
eas build --profile development --platform android
```

### After Build Completes:
1. Install the new development client on your device/simulator
2. Run `npx expo start --clear`
3. Connect to the new development client

## Alternative: If Using Expo Go

If you're actually using Expo Go (not a custom dev client), you'll need to either:
1. Create a development build (recommended)
2. Temporarily downgrade react-native-worklets to match Expo Go's version
