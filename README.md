# Candle — Shared Drawing Widget (Room-Based)

A real-time collaborative drawing app. Room members draw together and the Android home screen widget auto-updates to show the latest drawing.

Any logged-in user can create a room or join one by code. All members in a room share the same drawing canvas — when anyone taps **Done**, the drawing syncs to everyone's widget automatically via FCM push.

---

## Appwrite setup (required)

### Collection 1: `shared_notes`

| Column | Type | Notes |
|---|---|---|
| `roomCode` | string | required, size 6 |
| `drawingData` | string | required, large size (stores JSON stroke paths) |
| `done` | boolean | required |
| `updatedBy` | string | required |
| `updatedAt` | datetime | required |

No manual row creation needed — the app creates room documents automatically.
Permissions: read + update for authenticated users.

### Collection 2: `device_tokens`

| Column | Type | Notes |
|---|---|---|
| `userId` | string | required |
| `roomId` | string | required |
| `token` | string | required |
| `platform` | string | required |
| `updatedAt` | datetime | required |

Recommended indexes: `roomId`, `userId`, `token`

### Collection 3: `saved_drawings`

| Column | Type | Notes |
|---|---|---|
| `roomId` | string | required |
| `userId` | string | required |
| `drawingData` | string | required, large size (JSON stroke paths) |
| `createdAt` | datetime | required |

Recommended indexes: `roomId`, `userId`, `createdAt`
Permissions: document-level owner only (`read`, `update`, `delete` for `Role.user(userId)`).

---

## Config file

Edit `src/config/appwriteConfig.js`:

```js
export const APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = '<your-project-id>';
export const APPWRITE_DATABASE_ID = '<your-database-id>';
export const APPWRITE_COLLECTION_ID = 'shared_notes';
export const APPWRITE_DEVICE_TOKENS_COLLECTION_ID = 'device_tokens';
export const APPWRITE_SAVED_DRAWINGS_COLLECTION_ID = 'saved_drawings';
```

### Android widget config

Edit `android/gradle.properties`:

```properties
APPWRITE_PROJECT_ID=<your-project-id>
APPWRITE_DATABASE_ID=<your-database-id>
APPWRITE_API_KEY=<your-api-key>   # Appwrite Console → API Keys, scope: databases.read
```

These are injected into `BuildConfig` at build time — no hardcoded values in Kotlin/Java code.

---

## Appwrite function (FCM push)

Function source: `appwrite/functions/push-widget-update/index.js`

**Trigger events:**
- `databases.*.collections.*.documents.*.create`
- `databases.*.collections.*.documents.*.update`

**Environment variables:**
| Variable | Value |
|---|---|
| `APPWRITE_ENDPOINT` | `https://cloud.appwrite.io/v1` |
| `APPWRITE_PROJECT_ID` | your project ID |
| `APPWRITE_API_KEY` | your API key |
| `APPWRITE_DATABASE_ID` | your database ID |
| `APPWRITE_SHARED_NOTES_COLLECTION_ID` | `shared_notes` |
| `APPWRITE_DEVICE_TOKENS_COLLECTION_ID` | `device_tokens` |
| `FCM_PROJECT_ID` | Firebase project ID |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (stringified) |

> **FCM note:** The function sends a minimal signal only (`fetchRequired: true`) to stay within FCM's 4 KB data limit. The widget fetches the full drawing data directly from Appwrite when it receives the signal.

---

## Drawing canvas

- Square canvas (matches widget aspect ratio — no cropping)
- Full-spectrum color slider with clamped thumb (never overflows the bar)
- Adjustable brush size slider
- Eraser mode
- Undo / Redo
- Drawing is stored as JSON stroke paths (`[{ d, color, strokeWidth }]`)

---

## Android widget

- Pure native widget (no JS dependency at runtime)
- Receives FCM → fetches full drawing from Appwrite API → renders on Android Canvas
- Auto-scales drawing to fit widget (uniform scale, centered, no cropping)
- Displays: room code, done/pending status, updated by, correct local time
- Tapping the widget opens the app

---

## Run

```bash
npm install
npx expo run:android
```

Release APK:
```bash
cd android
.\gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

---

## How to use

1. Signup / login as User A
2. Tap **Create Room** → share the 6-character code
3. Signup / login as User B → tap **Join Room** → enter the code
4. Both users are now in the same room
5. Draw on the canvas → tap **Done** → drawing syncs to all room members instantly
6. Tap **Clear All** → canvas clears for everyone
7. Add the **"Candle Shared Note"** Android home screen widget — it shows the latest drawing and auto-updates via FCM push

