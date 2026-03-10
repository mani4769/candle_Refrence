import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { defaultNote } from '../lib/appwrite';

// Native module for widget refresh (pure native widget - no react-native-android-widget)
const WidgetModule = Platform.OS === 'android' ? NativeModules.WidgetModule : null;

export const SHARED_WIDGET_NAME = 'SharedNoteWidget';
const STORAGE_KEY = 'shared_note_widget_state';
const SELECTED_ROOM_KEY = 'selected_room';

// formatTime is no longer needed for widget rendering (native widget handles it)

export async function readWidgetNote() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultNote;
  try {
    return JSON.parse(raw);
  } catch {
    return defaultNote;
  }
}

export async function readSelectedRoom() {
  const raw = await AsyncStorage.getItem(SELECTED_ROOM_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSelectedRoom(room) {
  if (!room) {
    await AsyncStorage.removeItem(SELECTED_ROOM_KEY);
    return;
  }
  await AsyncStorage.setItem(SELECTED_ROOM_KEY, JSON.stringify(room));
}

export async function syncWidgetNote(note) {
  // Save to AsyncStorage (native widget reads from here)
  // note contains: roomCode, drawingData (JSON stroke paths), done, updatedBy, updatedAt
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(note));
  
  // Trigger native widget refresh via NativeModule
  try {
    if (WidgetModule && typeof WidgetModule.refreshWidget === 'function') {
      WidgetModule.refreshWidget();
    }
  } catch {
    // Ignore errors (widget may not be placed on home screen)
  }
}