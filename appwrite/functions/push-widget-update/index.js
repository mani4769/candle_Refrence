const sdk = require('node-appwrite');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

function parsePayload(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function getString(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function toPushData(note) {
  return {
    roomId: getString(note.roomId || note.$id),
    roomCode: getString(note.roomCode),
    text: getString(note.text),
    done: getString(note.done, 'false'),
    updatedBy: getString(note.updatedBy, 'push'),
    updatedAt: getString(note.updatedAt, new Date().toISOString()),
  };
}

async function getAccessToken(serviceAccountJson) {
  const credentials = JSON.parse(serviceAccountJson);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse?.token || tokenResponse;
}

async function sendFCM({ projectId, accessToken, token, data }) {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        android: {
          priority: 'high',
          ttl: '120s',
          direct_boot_ok: true,
        },
        data,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FCM send failed (${response.status}): ${text}`);
  }
}

module.exports = async ({ req, res, log, error }) => {
  try {
    log('Function triggered!');
    log(`Headers: ${JSON.stringify(req.headers || {})}`);
    log(`Body type: ${typeof req.body}`);
    log(`Body: ${JSON.stringify(req.body)}`);
    
    const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const notesCollectionId = process.env.APPWRITE_SHARED_NOTES_COLLECTION_ID || 'shared_notes';
    const tokensCollectionId = process.env.APPWRITE_DEVICE_TOKENS_COLLECTION_ID || 'device_tokens';
    const fcmProjectId = process.env.FCM_PROJECT_ID;
    const fcmServiceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;

    if (!projectId || !apiKey || !databaseId || !fcmProjectId || !fcmServiceAccountJson) {
      return res.json({
        ok: false,
        message: 'Missing env vars. Check function variables.',
      });
    }

    const payload = parsePayload(req.body);
    log(`Parsed payload: ${JSON.stringify(payload)}`);
    
    // Handle both manual execution and event trigger
    // Event trigger: payload.$id contains document ID
    // Manual execution: payload.roomId contains document ID
    const roomId = payload.roomId || payload.$id;
    log(`Extracted roomId: ${roomId}`);
    
    if (!roomId) {
      log('No roomId found in payload');
      return res.json({ ok: true, message: 'No roomId in trigger payload. Skipped.' });
    }

    const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new sdk.Databases(client);

    const latest = await databases.getDocument(databaseId, notesCollectionId, roomId);
    const data = toPushData(latest);

    const tokensResult = await databases.listDocuments(databaseId, tokensCollectionId, [
      sdk.Query.equal('roomId', roomId),
      sdk.Query.limit(500),
    ]);

    const uniqueTokens = [...new Set(tokensResult.documents.map((doc) => doc.token).filter(Boolean))];
    if (!uniqueTokens.length) {
      return res.json({ ok: true, message: `No tokens found for room ${roomId}` });
    }

    const accessToken = await getAccessToken(fcmServiceAccountJson);

    let success = 0;
    let failed = 0;
    await Promise.all(
      uniqueTokens.map(async (token) => {
        try {
          await sendFCM({ projectId: fcmProjectId, accessToken, token, data });
          success += 1;
        } catch (sendErr) {
          failed += 1;
          error(`FCM fail for token: ${token} -> ${sendErr.message}`);
        }
      }),
    );

    log(`Push result room=${roomId} success=${success} failed=${failed}`);
    return res.json({ ok: true, roomId, total: uniqueTokens.length, success, failed });
  } catch (err) {
    error(`Function error: ${err.message}`);
    return res.json({ ok: false, message: err.message });
  }
};
