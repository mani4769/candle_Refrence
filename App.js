import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  createRoom,
  defaultNote,
  getCurrentUser,
  getRoomById,
  joinRoomByCode,
  signIn,
  signOut,
  signUp,
  upsertDeviceToken,
  updateRoomNote,
} from './src/lib/appwrite';
import { initializeFCMDevice } from './src/widgets/fcmWidgetSync';
import { readWidgetNote, readSelectedRoom, saveSelectedRoom, syncWidgetNote } from './src/widgets/sharedWidget';

function formatLastUpdate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Never';
  }
  return date.toLocaleString();
}

function toReadableError(error, fallback) {
  const message = error?.message || '';
  if (message.toLowerCase().includes('not authorized')) {
    return 'Not authorized. Login again and ensure shared_notes table permissions allow authenticated users.';
  }
  return message || fallback;
}

function lastRoomKey(userId) {
  return `last_room_${userId}`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const [user, setUser] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [activeRoom, setActiveRoom] = useState(null);

  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [updatedBy, setUpdatedBy] = useState('system');
  const [updatedAt, setUpdatedAt] = useState(new Date().toISOString());
  const [fcmToken, setFcmToken] = useState('');
  const latestSyncedAtRef = useRef(updatedAt);

  useEffect(() => {
    latestSyncedAtRef.current = updatedAt;
  }, [updatedAt]);

  async function applyRoomState(room, userId) {
    setActiveRoom(room);
    setText(room.text);
    setDone(room.done);
    setUpdatedBy(room.updatedBy);
    setUpdatedAt(room.updatedAt);

    if (userId) {
      await AsyncStorage.setItem(lastRoomKey(userId), room.roomId);
    }

    await saveSelectedRoom({ roomId: room.roomId, roomCode: room.roomCode });
    await syncWidgetNote(room);
  }

  async function clearRoomState(userId) {
    setActiveRoom(null);
    setText(defaultNote.text);
    setDone(defaultNote.done);
    setUpdatedBy(defaultNote.updatedBy);
    setUpdatedAt(defaultNote.updatedAt);

    if (userId) {
      await AsyncStorage.removeItem(lastRoomKey(userId));
    }

    await saveSelectedRoom(null);
    await syncWidgetNote(defaultNote);
  }

  async function loadSavedRoomForUser(userObj) {
    if (!userObj?.$id) {
      return;
    }

    const savedRoomId = await AsyncStorage.getItem(lastRoomKey(userObj.$id));
    if (savedRoomId) {
      try {
        const room = await getRoomById(savedRoomId);
        await applyRoomState(room, userObj.$id);
        return;
      } catch {
        await AsyncStorage.removeItem(lastRoomKey(userObj.$id));
      }
    }

    const selectedRoom = await readSelectedRoom();
    if (selectedRoom?.roomId) {
      try {
        const room = await getRoomById(selectedRoom.roomId);
        await applyRoomState(room, userObj.$id);
      } catch {
        await saveSelectedRoom(null);
      }
      return;
    }

    const widgetNote = await readWidgetNote();
    setText(widgetNote.text ?? '');
    setDone(Boolean(widgetNote.done));
    setUpdatedBy(widgetNote.updatedBy ?? 'system');
    setUpdatedAt(widgetNote.updatedAt ?? new Date().toISOString());
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const current = await getCurrentUser();
        if (!mounted) return;

        setUser(current);
        await loadSavedRoomForUser(current);
      } catch {
        if (!mounted) return;
        setUser(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeRoom?.roomId) {
      return undefined;
    }

    const timer = setInterval(async () => {
      try {
        const latest = await getRoomById(activeRoom.roomId);
        if (latest.updatedAt === latestSyncedAtRef.current) {
          return;
        }

        await applyRoomState(latest, user?.$id);
      } catch {
        // Ignore transient polling failures.
      }
    }, 2000);

    return () => {
      clearInterval(timer);
    };
  }, [activeRoom?.roomId, user?.$id]);

  useEffect(() => {
    if (!user?.$id) {
      return;
    }

    initializeFCMDevice()
      .then((token) => {
        if (token) {
          setFcmToken(token);
          console.log('FCM token for widget push:', token);
        }
      })
      .catch(() => {
        // Ignore token init failures; widget still works with polling/open-app sync.
      });
  }, [user?.$id]);

  useEffect(() => {
    if (!user?.$id || !activeRoom?.roomId || !fcmToken) {
      return;
    }

    upsertDeviceToken({
      userId: user.$id,
      roomId: activeRoom.roomId,
      token: fcmToken,
      platform: 'android',
    })
      .then((saved) => {
        if (saved?.id) {
          console.log('FCM token saved to Appwrite:', saved.id);
        }
      })
      .catch((err) => {
        console.log('FCM token save failed:', err?.message || err);
        // Keep non-blocking behavior, but expose the failure reason in logs.
      });
  }, [activeRoom?.roomId, fcmToken, user?.$id]);

  async function runAuth() {
    const safeEmail = email.trim().toLowerCase();
    if (!safeEmail || !password) {
      Alert.alert('Missing fields', 'Email and password are required.');
      return;
    }

    setWorking(true);
    try {
      let didSignUp = false;
      if (authMode === 'signup') {
        await signUp(safeEmail, password, name.trim() || safeEmail.split('@')[0]);
        didSignUp = true;
      } else {
        await signIn(safeEmail, password);
      }

      const current = await getCurrentUser();
      setUser(current);
      await loadSavedRoomForUser(current);
      if (didSignUp) {
        Alert.alert('Signup success', 'Account created and logged in.');
      }
    } catch (error) {
      Alert.alert('Auth failed', toReadableError(error, 'Authentication failed.'));
    } finally {
      setWorking(false);
    }
  }

  async function handleCreateRoom() {
    if (!user) return;

    setWorking(true);
    try {
      const actor = user.name || user.email || 'user';
      const room = await createRoom({ actor });
      await applyRoomState(room, user.$id);
      Alert.alert('Room created', `Share this code: ${room.roomCode}`);
    } catch (error) {
      Alert.alert('Create room failed', toReadableError(error, 'Could not create room.'));
    } finally {
      setWorking(false);
    }
  }

  async function handleJoinRoom() {
    if (!user) return;

    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Invalid code', 'Room code must be 6 characters.');
      return;
    }

    setWorking(true);
    try {
      const room = await joinRoomByCode(code);
      await applyRoomState(room, user.$id);
      setJoinCode('');
    } catch (error) {
      Alert.alert('Join failed', toReadableError(error, 'Could not join room.'));
    } finally {
      setWorking(false);
    }
  }

  async function saveNote(nextText = text, nextDone = done) {
    if (!activeRoom?.roomId || !user) {
      return;
    }

    setWorking(true);
    try {
      const updated = await updateRoomNote({
        roomId: activeRoom.roomId,
        roomCode: activeRoom.roomCode,
        text: nextText,
        done: nextDone,
        updatedBy: user.name || user.email || 'user',
      });

      await applyRoomState(updated, user.$id);
    } catch (error) {
      Alert.alert('Save failed', toReadableError(error, 'Could not save shared note.'));
    } finally {
      setWorking(false);
    }
  }

  async function onClear() {
    setText('');
    setDone(false);
    await saveNote('', false);
  }

  async function onDone() {
    setDone(true);
    await saveNote(text, true);
  }

  async function onSwitchRoom() {
    await clearRoomState(user?.$id);
  }

  async function onLogout() {
    setWorking(true);
    try {
      await signOut();
      await clearRoomState(user?.$id);
      setUser(null);
      setEmail('');
      setPassword('');
      setName('');
      setAuthMode('login');
    } catch (error) {
      Alert.alert('Logout failed', toReadableError(error, 'Could not log out.'));
    } finally {
      setWorking(false);
    }
  }

  const updatedLabel = useMemo(() => formatLastUpdate(updatedAt), [updatedAt]);

  if (loading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.centered}>
          <View style={styles.card}>
            <Text style={styles.title}>Candle Login</Text>
            <Text style={styles.subTitle}>Sign in or create account</Text>

            {authMode === 'signup' ? (
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#64748B"
              />
            ) : null}

            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748B"
              secureTextEntry
            />

            <TouchableOpacity style={styles.primaryButton} onPress={runAuth} disabled={working}>
              <Text style={styles.primaryButtonText}>{authMode === 'signup' ? 'Sign Up' : 'Login'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setAuthMode((prev) => (prev === 'signup' ? 'login' : 'signup'))}
            >
              <Text style={styles.secondaryButtonText}>
                {authMode === 'signup' ? 'Already have account? Login' : 'New user? Sign Up'}
              </Text>
            </TouchableOpacity>

            {working ? <ActivityIndicator color="#2563EB" style={styles.loader} /> : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!activeRoom?.roomId) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.centered}>
          <View style={styles.card}>
            <Text style={styles.title}>Choose Room</Text>
            <Text style={styles.subTitle}>Create a room or join with code</Text>

            <TouchableOpacity style={styles.primaryButton} onPress={handleCreateRoom} disabled={working}>
              <Text style={styles.primaryButtonText}>Create New Room</Text>
            </TouchableOpacity>

            <TextInput
              value={joinCode}
              onChangeText={(value) => setJoinCode(value.toUpperCase())}
              style={styles.input}
              placeholder="Enter room code"
              placeholderTextColor="#64748B"
              autoCapitalize="characters"
              maxLength={6}
            />

            <TouchableOpacity style={styles.doneButton} onPress={handleJoinRoom} disabled={working}>
              <Text style={styles.primaryButtonText}>Join Room</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={onLogout}>
              <Text style={styles.secondaryButtonText}>Logout</Text>
            </TouchableOpacity>

            {working ? <ActivityIndicator color="#2563EB" style={styles.loader} /> : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Shared Text Field</Text>
          <Text style={styles.roomCode}>Room Code: {activeRoom.roomCode}</Text>

          <TextInput
            multiline
            value={text}
            onChangeText={setText}
            style={styles.textArea}
            placeholder="Type shared text..."
            placeholderTextColor="#64748B"
          />

          <View style={styles.statusBox}>
            <Text style={styles.statusText}>Status: {done ? 'Done' : 'Pending'}</Text>
            <Text style={styles.statusText}>Updated by: {updatedBy}</Text>
            <Text style={styles.statusText}>Updated at: {updatedLabel}</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => saveNote()} disabled={working}>
              <Text style={styles.primaryButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneButton} onPress={onDone} disabled={working}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearButton} onPress={onClear} disabled={working}>
              <Text style={styles.primaryButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={onSwitchRoom}>
            <Text style={styles.secondaryButtonText}>Switch Room</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onLogout}>
            <Text style={styles.secondaryButtonText}>Logout</Text>
          </TouchableOpacity>

          {working ? <ActivityIndicator color="#2563EB" style={styles.loader} /> : null}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subTitle: {
    color: '#475569',
    marginBottom: 4,
  },
  roomCode: {
    color: '#1E40AF',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 170,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  statusBox: {
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    padding: 12,
    gap: 2,
  },
  statusText: {
    color: '#0F172A',
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingVertical: 11,
  },
  doneButton: {
    flex: 1,
    backgroundColor: '#15803D',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingVertical: 11,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#B91C1C',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  loader: {
    marginTop: 8,
  },
});
