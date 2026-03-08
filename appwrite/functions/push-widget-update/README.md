# Push Widget Update Function

This Appwrite Function listens to shared note updates and sends FCM data push notifications to room participants.

## Trigger

Use event trigger:

- `databases.*.collections.shared_notes.documents.*.update`

## Required environment variables

- `APPWRITE_ENDPOINT` = `https://cloud.appwrite.io/v1`
- `APPWRITE_PROJECT_ID` = your project ID
- `APPWRITE_API_KEY` = server key with `databases.read` permission
- `APPWRITE_DATABASE_ID` = your database ID
- `APPWRITE_SHARED_NOTES_COLLECTION_ID` = `shared_notes`
- `APPWRITE_DEVICE_TOKENS_COLLECTION_ID` = `device_tokens`
- `FCM_PROJECT_ID` = Firebase project ID
- `FCM_SERVICE_ACCOUNT_JSON` = complete JSON string of Firebase service account

## Collection requirement

Create `device_tokens` collection with attributes:

- `userId` (string, required)
- `roomId` (string, required)
- `token` (string, required)
- `platform` (string, required)
- `updatedAt` (datetime, required)

Recommended indexes:

- `roomId`
- `userId`
- `token`

## What the function sends

FCM data payload keys:

- `roomId`
- `roomCode`
- `text`
- `done`
- `updatedBy`
- `updatedAt`

Phone B receives this in background and updates widget immediately.
