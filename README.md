# Candle Shared Widget (Room-Based)

This app is now multi-room (not single `room_main`).
Any logged-in users can create a room code or join by room code.

## Appwrite setup (required)

Use one database and one collection:

Collection ID: `shared_notes`

Columns:
- `roomCode` -> string (required, size 6)
- `text` -> string (required)
- `done` -> boolean (required)
- `updatedBy` -> string (required)
- `updatedAt` -> datetime (required)

No manual row creation required. App creates room rows automatically.
No per-user manual permission edits required for this flow.

### Extra collection for widget push

Collection ID: `device_tokens`

Columns:
- `userId` -> string (required)
- `roomId` -> string (required)
- `token` -> string (required)
- `platform` -> string (required)
- `updatedAt` -> datetime (required)

Recommended indexes:
- `roomId`
- `userId`
- `token`

## Config file

Edit `src/config/appwriteConfig.js` with your endpoint/project/database/collection IDs.

## Appwrite function (FCM push)

Function source is in:
- `appwrite/functions/push-widget-update/index.js`

Set trigger event:
- `databases.*.tables.*.rows.*.update`
- `databases.*.tables.*.rows.*.create`

Set function env vars:
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY`
- `APPWRITE_DATABASE_ID`
- `APPWRITE_SHARED_NOTES_COLLECTION_ID=shared_notes`
- `APPWRITE_DEVICE_TOKENS_COLLECTION_ID=device_tokens`
- `FCM_PROJECT_ID`
- `FCM_SERVICE_ACCOUNT_JSON`

## Run

```bash
npm install
npm run android
npx expo start --lan --port 8081
```

## How to use

1. Signup/login user A
2. Create room -> copy room code
3. Signup/login user B
4. Join room with that code
5. Both users now sync text + Done/Clear in realtime
6. Add Android homescreen widget "Candle Shared Note" and it follows selected room

