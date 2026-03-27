import { Account, Client, Databases, ID, Permission, Query, Role } from 'react-native-appwrite';
import {
  APPWRITE_COLLECTION_ID,
  APPWRITE_DATABASE_ID,
  APPWRITE_DEVICE_TOKENS_COLLECTION_ID,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_SAVED_DRAWINGS_COLLECTION_ID,
} from '../config/appwriteConfig';

export const client = new Client();

client
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

export const account = new Account(client);
export const databases = new Databases(client);

export async function ensureAnonymousSession() {
  try {
    await account.get();
    return;
  } catch {
    // No active session.
  }

  try {
    await account.createAnonymousSession();
  } catch (error) {
    if (error?.code === 409) {
      return;
    }
    throw error;
  }
}

export const defaultNote = {
  roomId: '',
  roomCode: '',
  drawingData: '',
  done: false,
  updatedBy: 'system',
  updatedAt: new Date().toISOString(),
};

function randomCode(length = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function toRoomNote(document) {
  return {
    roomId: document.$id,
    roomCode: document.roomCode,
    drawingData: document.drawingData ?? '',
    done: Boolean(document.done),
    updatedBy: document.updatedBy ?? 'system',
    updatedAt: document.updatedAt ?? new Date().toISOString(),
    statusText: document.statusText ?? '',
    statusFromUserId: document.statusFromUserId ?? '',
    statusImageBase64: document.statusImageBase64 ?? '',
    statusImageFromUserId: document.statusImageFromUserId ?? '',
    statusUpdatedAt: document.statusUpdatedAt ?? document.updatedAt ?? new Date().toISOString(),
  };
}

function createSharedNotePayload({ roomCode, drawingData, done, updatedBy }) {
  return {
    roomCode,
    drawingData,
    done,
    updatedBy,
    updatedAt: new Date().toISOString(),
  };
}

export function roomChannel(roomId) {
  return `databases.${APPWRITE_DATABASE_ID}.collections.${APPWRITE_COLLECTION_ID}.documents.${roomId}`;
}

export async function createRoom({ actor }) {
  for (let i = 0; i < 5; i += 1) {
    const roomCode = randomCode();
    const existing = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, [
      Query.equal('roomCode', roomCode),
      Query.limit(1),
    ]);

    if (existing.total > 0) {
      continue;
    }

    const created = await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_COLLECTION_ID,
      ID.unique(),
      createSharedNotePayload({ roomCode, drawingData: '', done: false, updatedBy: actor }),
      [Permission.read(Role.users()), Permission.update(Role.users())],
    );

    return toRoomNote(created);
  }

  throw new Error('Unable to generate a unique room code. Try again.');
}

export async function joinRoomByCode(code) {
  const roomCode = (code || '').trim().toUpperCase();
  if (!roomCode) {
    throw new Error('Room code is required.');
  }

  const result = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, [
    Query.equal('roomCode', roomCode),
    Query.limit(1),
  ]);

  if (!result.documents.length) {
    throw new Error('Room not found. Check code and try again.');
  }

  return toRoomNote(result.documents[0]);
}

export async function getRoomById(roomId) {
  const doc = await databases.getDocument(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, roomId);
  return toRoomNote(doc);
}

export async function updateRoomNote({ roomId, roomCode, drawingData, done, updatedBy }) {
  const payload = createSharedNotePayload({ roomCode, drawingData, done, updatedBy });
  const updated = await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, roomId, payload);
  return toRoomNote(updated);
}

// Update room-scoped "status share" payloads (image + status) used by home-screen widgets.
// Note: Appwrite collection schema must include these attributes.
export async function updateRoomStatusShare({
  roomId,
  statusText,
  statusFromUserId,
  statusImageBase64,
  statusImageFromUserId,
  statusUpdatedAt = new Date().toISOString(),
}) {
  if (!roomId) {
    throw new Error('roomId is required.');
  }

  const payload = {
    statusUpdatedAt,
  };

  if (typeof statusText === 'string') {
    payload.statusText = statusText;
  }
  if (typeof statusFromUserId === 'string') {
    payload.statusFromUserId = statusFromUserId;
  }
  if (typeof statusImageBase64 === 'string') {
    payload.statusImageBase64 = statusImageBase64;
  }
  if (typeof statusImageFromUserId === 'string') {
    payload.statusImageFromUserId = statusImageFromUserId;
  }

  return databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, roomId, payload);
}

export async function signIn(email, password) {
  return account.createEmailPasswordSession(email, password);
}

export async function signUp(email, password, name) {
  await account.create(ID.unique(), email, password, name);
  return signIn(email, password);
}

export async function getCurrentUser() {
  return account.get();
}

export async function signOut() {
  return account.deleteSession('current');
}

function toDeviceTokenDoc(document) {
  return {
    id: document.$id,
    userId: document.userId ?? '',
    roomId: document.roomId ?? '',
    token: document.token ?? '',
    platform: document.platform ?? 'android',
    updatedAt: document.updatedAt ?? document.$updatedAt ?? new Date().toISOString(),
  };
}

export async function getRealtimeSlot({ roomId, userId, platform }) {
  if (!roomId || !userId || !platform) {
    return null;
  }

  const existing = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_DEVICE_TOKENS_COLLECTION_ID, [
    Query.equal('roomId', roomId),
    Query.equal('userId', userId),
    Query.equal('platform', platform),
    Query.limit(1),
  ]);

  if (!existing.documents.length) {
    return null;
  }

  return toDeviceTokenDoc(existing.documents[0]);
}

export async function listRealtimeSlots({ roomId, platform, limit = 100 }) {
  if (!roomId || !platform) {
    return [];
  }

  const result = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_DEVICE_TOKENS_COLLECTION_ID, [
    Query.equal('roomId', roomId),
    Query.equal('platform', platform),
    Query.limit(limit),
  ]);

  return result.documents.map(toDeviceTokenDoc);
}

export async function upsertRealtimeSlot({
  roomId,
  userId,
  platform,
  token,
}) {
  if (!roomId || !userId || !platform) {
    return null;
  }

  const payload = {
    userId,
    roomId,
    token: token ?? '',
    platform,
  };

  const existing = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_DEVICE_TOKENS_COLLECTION_ID, [
    Query.equal('roomId', roomId),
    Query.equal('userId', userId),
    Query.equal('platform', platform),
    Query.limit(1),
  ]);

  if (existing.total > 0) {
    const updated = await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_DEVICE_TOKENS_COLLECTION_ID,
      existing.documents[0].$id,
      payload,
    );
    return toDeviceTokenDoc(updated);
  }

  const created = await databases.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_DEVICE_TOKENS_COLLECTION_ID,
    ID.unique(),
    payload,
    [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())],
  );

  return toDeviceTokenDoc(created);
}

function toSavedDrawingDoc(document) {
  let parsedPaths = [];
  try {
    parsedPaths = JSON.parse(document.drawingData ?? '[]');
  } catch {
    parsedPaths = [];
  }

  return {
    id: document.$id,
    roomId: document.roomId ?? '',
    userId: document.userId ?? '',
    paths: Array.isArray(parsedPaths) ? parsedPaths : [],
    createdAt: document.createdAt ?? document.$createdAt ?? new Date().toISOString(),
  };
}

export async function upsertDeviceToken({ userId, roomId, token, platform = 'android' }) {
  if (!userId || !roomId || !token) {
    return null;
  }

  const existing = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_DEVICE_TOKENS_COLLECTION_ID, [
    Query.equal('userId', userId),
    Query.equal('roomId', roomId),
    Query.equal('platform', platform),
    Query.limit(1),
  ]);

  const payload = {
    userId,
    roomId,
    token,
    platform,
  };

  if (existing.total > 0) {
    const updated = await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_DEVICE_TOKENS_COLLECTION_ID,
      existing.documents[0].$id,
      payload,
    );
    return toDeviceTokenDoc(updated);
  }

  const created = await databases.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_DEVICE_TOKENS_COLLECTION_ID,
    ID.unique(),
    payload,
    [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())],
  );

  return toDeviceTokenDoc(created);
}

export async function listSavedDrawings({ roomId, userId, limit = 100 }) {
  if (!roomId || !userId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  let filtered = [];
  let fetchedCount = 0;

  // Preferred path: server-side filter (fast and accurate when indexes exist).
  try {
    const direct = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_SAVED_DRAWINGS_COLLECTION_ID, [
      Query.equal('roomId', roomId),
      Query.equal('userId', userId),
      Query.orderDesc('createdAt'),
      Query.limit(safeLimit),
    ]);

    fetchedCount = direct.documents.length;
    filtered = direct.documents.map(toSavedDrawingDoc);
  } catch (error) {
    // Fallback: paginate through readable rows and filter client-side.
    // This avoids empty/missing results when indexes are not configured yet.
    const pageSize = 100;
    let offset = 0;
    let keepGoing = true;
    const allDocs = [];

    while (keepGoing && allDocs.length < 1000) {
      const page = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_SAVED_DRAWINGS_COLLECTION_ID, [
        Query.limit(pageSize),
        Query.offset(offset),
      ]);

      allDocs.push(...page.documents);
      fetchedCount += page.documents.length;

      if (page.documents.length < pageSize) {
        keepGoing = false;
      } else {
        offset += pageSize;
      }
    }

    filtered = allDocs
      .map(toSavedDrawingDoc)
      .filter((item) => item.roomId === roomId && item.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);
  }

  console.log(
    '[saved_drawings] list',
    JSON.stringify({
      requestedRoomId: roomId,
      requestedUserId: userId,
      fetchedCount,
      filteredCount: filtered.length,
      safeLimit,
    }),
  );

  return filtered;
}

export async function createSavedDrawing({ roomId, userId, paths }) {
  if (!roomId || !userId || !Array.isArray(paths) || paths.length === 0) {
    throw new Error('roomId, userId and non-empty paths are required.');
  }

  const createdAt = new Date().toISOString();
  const payload = {
    roomId,
    userId,
    drawingData: JSON.stringify(paths),
    createdAt,
  };

  const created = await databases.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_SAVED_DRAWINGS_COLLECTION_ID,
    ID.unique(),
    payload,
    [Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))],
  );

  return toSavedDrawingDoc(created);
}

export async function deleteSavedDrawingById(savedDrawingId) {
  if (!savedDrawingId) {
    return;
  }

  await databases.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_SAVED_DRAWINGS_COLLECTION_ID, savedDrawingId);
}
