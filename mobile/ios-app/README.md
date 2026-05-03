# WAGE Society iOS App

This folder contains the iOS wrapper app for the W.A.G.E. Society web app using Capacitor.

## Requirements

- Node.js 18+
- Xcode (macOS)
- CocoaPods

## Setup

1. Install dependencies:

```bash
npm install
```

2. Generate iOS native project (first time only):

```bash
npm run cap:add
```

3. Build web app + copy assets + sync native project:

```bash
npm run cap:sync
```

4. Open in Xcode:

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