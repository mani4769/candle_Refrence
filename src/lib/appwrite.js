import { Account, Client, Databases, ID, Permission, Query, Role } from 'react-native-appwrite';
import {
  APPWRITE_COLLECTION_ID,
  APPWRITE_DATABASE_ID,
  APPWRITE_DEVICE_TOKENS_COLLECTION_ID,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
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
  text: '',
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
    text: document.text ?? '',
    done: Boolean(document.done),
    updatedBy: document.updatedBy ?? 'system',
    updatedAt: document.updatedAt ?? new Date().toISOString(),
  };
}

function createSharedNotePayload({ roomCode, text, done, updatedBy }) {
  return {
    roomCode,
    text,
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
      createSharedNotePayload({ roomCode, text: '', done: false, updatedBy: actor }),
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

export async function updateRoomNote({ roomId, roomCode, text, done, updatedBy }) {
  const payload = createSharedNotePayload({ roomCode, text, done, updatedBy });
  const updated = await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, roomId, payload);
  return toRoomNote(updated);
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
