import { ensureAnonymousSession, getRoomById } from '../lib/appwrite';
import { syncWidgetNote } from './sharedWidget';

let messaging = null;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch {
  messaging = null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseNotePayload(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const hasInlineNote = typeof data.text === 'string' || typeof data.done === 'string' || typeof data.done === 'boolean';
  if (!hasInlineNote) {
    return null;
  }

  return {
    roomId: data.roomId || '',
    roomCode: data.roomCode || '',
    text: data.text ?? '',
    done: toBoolean(data.done),
    updatedBy: data.updatedBy || 'push',
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

async function getNoteForWidget(data) {
  const inlineNote = parseNotePayload(data);
  if (inlineNote) {
    return inlineNote;
  }

  const roomId = data?.roomId;
  if (!roomId) {
    return null;
  }

  await ensureAnonymousSession();
  return getRoomById(roomId);
}

export async function handleWidgetPushMessage(remoteMessage) {
  try {
    const note = await getNoteForWidget(remoteMessage?.data);
    if (!note) {
      return;
    }
    await syncWidgetNote(note);
  } catch {
    // Ignore failures in background message handling.
  }
}

export function registerFCMWidgetHandlers() {
  if (!messaging || typeof messaging !== 'function') {
    return () => {};
  }

  try {
    messaging().setBackgroundMessageHandler(handleWidgetPushMessage);
  } catch {
    // Ignore when native messaging is not configured yet.
  }

  let unsubscribe = () => {};
  try {
    unsubscribe = messaging().onMessage(handleWidgetPushMessage);
  } catch {
    unsubscribe = () => {};
  }

  return () => {
    unsubscribe();
  };
}

export async function initializeFCMDevice() {
  if (!messaging || typeof messaging !== 'function') {
    return null;
  }

  try {
    await messaging().registerDeviceForRemoteMessages();
  } catch {
    // Android usually doesn't need this, but keep it safe across platforms.
  }

  try {
    const token = await messaging().getToken();
    return token || null;
  } catch {
    return null;
  }
}
