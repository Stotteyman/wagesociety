# WAGE Society Android App

This folder contains the Android wrapper app for the W.A.G.E. Society web app using Capacitor.

## Requirements

- Node.js 18+
- Android Studio
- Android SDK configured

## Setup

1. Install dependencies:

```bash
npm install
```

2. Generate Android native project (first time only):

```bash
npm run cap:add
```

3. Build web app + copy assets + sync native project:

```bash
npm run cap:sync
```

4. Open in Android Studio:

```bash
npm run cap:open
```

## Notes

- The web build source is the root project output at `dist/client`.
- Synced assets are stored in this folder under `www`.
- This app is configured to open `https://wagesociety.com` inside the native shell.
- Optional override while syncing:

```bash
$env:MOBILE_APP_FALLBACK_URL="https://your-domain.com"; npm run cap:sync
```

## Build Release APK

From this folder:

```bash
npm run cap:sync
cd android
./gradlew assembleRelease
```

The release artifact is generated at:

`android/app/build/outputs/apk/release/app-release.apk`

If Gradle reports `JAVA_HOME is not set`, install a JDK (17+ recommended) and configure:

```powershell
$env:JAVA_HOME="C:\Path\To\JDK"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

## Publish APK Without Website Redeploy

1. Open the admin APK manager at `/admin/apk`
2. Upload the new APK file and set the release version/notes
3. Submit "Upload and Publish APK"

The public download page (`/download`) will automatically use the latest uploaded APK metadata from storage via `/api/public-apk`.