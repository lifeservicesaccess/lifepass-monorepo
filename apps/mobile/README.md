# LifePass Mobile

This mobile app now shares the same API-facing product surface as the web app at the JavaScript layer:

- onboarding and verifier submission
- journey dashboard loading
- privacy visibility controls
- milestone create, edit, status change, and anchoring
- guide chat
- admin health, policy preview/apply, approvals, snapshots, and audit export views

## Verified commands

From `apps/mobile`:

```powershell
npm install
npm run android:bootstrap
npm run bundle:android
```

The Android JavaScript bundle is currently verified to build to `dist/index.android.bundle`.

## Available scripts

- `npm run android` launches the Android app once the Android toolchain is installed
- `npm run android:bootstrap` writes Android env vars and `android/local.properties` for the current machine
- `npm run ios` launches the iOS app on macOS once CocoaPods/Xcode are available
- `npm run start` starts Metro
- `npm run bundle:android` produces an Android JS bundle in `dist/`
- `npm run bundle:ios` produces an iOS JS bundle in `dist/`
- `npm run doctor` checks the local React Native environment

## Current blockers for emulator or device runs

This folder now contains generated `android/` and `ios/` native project directories.

The latest `react-native doctor` run also reported local machine prerequisites missing for Android execution:

- Android SDK not installed

Repo-side bootstrap now covers these pieces automatically on this machine:

- JDK 17 install path
- `adb` platform-tools path
- `JAVA_HOME`
- `ANDROID_HOME`
- `ANDROID_SDK_ROOT`
- `android/local.properties`

What still remains after bootstrap is the Android SDK content itself, specifically platform/build-tools `34.0.0`, plus an emulator or connected device.

If Android Studio is not already present on the machine, install it before provisioning the SDK packages or creating an emulator.

## Next step

Open Android Studio once, install Android SDK platform/build-tools `34.0.0`, create or start an emulator, then run:

```powershell
npm run start
npm run android
```