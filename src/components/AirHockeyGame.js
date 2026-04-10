import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { io } from 'socket.io-client';
import { RPS_SOCKET_URL } from '../config/rpsSocketConfig';

const INTRO_MS = 2100;
const HEARTBEAT_MS = 1000;
const BOARD_RATIO = 0.54;
const PADDLE_RADIUS = 28;
const PUCK_RADIUS = 24;
const GOAL_WIDTH = 124;
const GOAL_HEIGHT = 26;
const GOAL_INNER_WIDTH = 92;
const GOAL_INNER_HEIGHT = 18;

function createInitialAirMatchState(roomCode = '') {
  return {
    version: 1,
    roomCode,
    redPlayerId: '',
    bluePlayerId: '',
    redOnline: false,
    blueOnline: false,
    redReady: false,
    blueReady: false,
    redScore: 0,
    blueScore: 0,
    serveRole: 'red',
    puck: { x: 0.5, y: 0.68, vx: 0, vy: 0 },
    redPaddle: { x: 0.5, y: 0.82, vx: 0, vy: 0 },
    bluePaddle: { x: 0.5, y: 0.18, vx: 0, vy: 0 },
    roundWinner: '',
    goalScoredBy: '',
    matchWinner: '',
    phase: 'lobby',
    phaseStartedAt: '',
    phaseEndsAt: '',
    serverNow: '',
    updatedAt: '',
    updatedBy: '',
  };
}

function normalizeAirMatchState(rawValue, roomCode = '') {
  return {
    ...createInitialAirMatchState(roomCode),
    ...(rawValue || {}),
    roomCode: rawValue?.roomCode || roomCode || '',
    puck: {
      ...createInitialAirMatchState(roomCode).puck,
      ...(rawValue?.puck || {}),
    },
    redPaddle: {
      ...createInitialAirMatchState(roomCode).redPaddle,
      ...(rawValue?.redPaddle || {}),
    },
    bluePaddle: {
      ...createInitialAirMatchState(roomCode).bluePaddle,
      ...(rawValue?.bluePaddle || {}),
    },
  };
}

function getAirRoleForUser(matchState, userId) {
  if (!matchState || !userId) {
    return '';
  }
  if (matchState.redPlayerId === userId) {
    return 'red';
  }
  if (matchState.bluePlayerId === userId) {
    return 'blue';
  }
  return '';
}

function getCountdownValue(phaseEndsAt, now = Date.now()) {
  if (!phaseEndsAt) {
    return 0;
  }
  const endsAt = new Date(phaseEndsAt).getTime();
  if (!Number.isFinite(endsAt)) {
    return 0;
  }
  const remaining = endsAt - now;
  if (remaining > 1400) {
    return 3;
  }
  if (remaining > 700) {
    return 2;
  }
  if (remaining > 0) {
    return 1;
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function AirHockeyGame({ activeRoom, user, onExit }) {
  const [matchState, setMatchState] = useState(createInitialAirMatchState(activeRoom?.roomCode || ''));
  const [localRole, setLocalRole] = useState('');
  const [localReadyLock, setLocalReadyLock] = useState(false);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [roomNow, setRoomNow] = useState(Date.now());
  const [boardLayout, setBoardLayout] = useState({ width: 0, height: 0 });
  const [dragPaddle, setDragPaddle] = useState(null);

  const socketRef = useRef(null);
  const lastMoveSentAtRef = useRef(0);

  const myRole = getAirRoleForUser(matchState, user?.$id) || localRole;
  const friendOffline = myRole === 'red'
    ? Boolean(matchState.bluePlayerId && !matchState.blueOnline)
    : myRole === 'blue'
      ? Boolean(matchState.redPlayerId && !matchState.redOnline)
      : false;
  const bothPlayersReady = Boolean(matchState.redPlayerId && matchState.bluePlayerId);
  const syncedNow = roomNow + serverOffsetMs;
  const introCountdown = matchState.phase === 'intro'
    ? getCountdownValue(matchState.phaseEndsAt, syncedNow)
    : 0;

  useEffect(() => {
    setMatchState(createInitialAirMatchState(activeRoom?.roomCode || ''));
    setLocalRole('');
    setLocalReadyLock(false);
    setDragPaddle(null);
  }, [activeRoom?.roomCode, activeRoom?.roomId]);

  useEffect(() => {
    if (!activeRoom?.roomId || !user?.$id) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return undefined;
    }

    const socket = io(RPS_SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('air:join', {
        roomId: activeRoom.roomId,
        roomCode: activeRoom.roomCode,
        userId: user.$id,
      });
    });

    socket.on('air:role', (payload) => {
      setLocalRole(payload?.role || '');
    });

    socket.on('air:state', (nextState) => {
      setMatchState(normalizeAirMatchState(nextState, activeRoom.roomCode));
      const nextServerNow = nextState?.serverNow ? new Date(nextState.serverNow).getTime() : 0;
      if (Number.isFinite(nextServerNow) && nextServerNow > 0) {
        setServerOffsetMs(nextServerNow - Date.now());
      }
      setRoomNow(Date.now());
    });

    socket.on('disconnect', () => {
      setMatchState((current) => ({
        ...current,
        redOnline: current.redPlayerId ? false : current.redOnline,
        blueOnline: current.bluePlayerId ? false : current.blueOnline,
      }));
    });

    const pingTimer = setInterval(() => {
      socket.emit('air:ping');
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(pingTimer);
      socket.emit('air:leave');
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [activeRoom?.roomCode, activeRoom?.roomId, user?.$id]);

  useEffect(() => {
    if (matchState.phase !== 'intro') {
      return undefined;
    }
    const timer = setInterval(() => setRoomNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [matchState.phase]);

  useEffect(() => {
    if (!myRole) {
      setLocalReadyLock(false);
      return;
    }
    if (matchState.phase !== 'lobby' || matchState.matchWinner) {
      setLocalReadyLock(false);
      return;
    }
    const syncedReady = myRole === 'red' ? matchState.redReady : matchState.blueReady;
    setLocalReadyLock(Boolean(syncedReady));
  }, [matchState.blueReady, matchState.matchWinner, matchState.phase, matchState.redReady, myRole]);

  const paddleFromState = myRole === 'blue' ? matchState.bluePaddle : matchState.redPaddle;
  const paddlePosition = dragPaddle || paddleFromState;
  const isBluePerspective = myRole === 'blue';

  function mapDisplayY(y) {
    return isBluePerspective ? 1 - y : y;
  }

  const boardMetrics = useMemo(() => {
    const width = boardLayout.width || 1;
    const height = boardLayout.height || 1;
    const puckDisplayY = mapDisplayY(matchState.puck.y);
    const redDisplayY = mapDisplayY(matchState.redPaddle.y);
    const blueDisplayY = mapDisplayY(matchState.bluePaddle.y);
    return {
      width,
      height,
      puckSize: PUCK_RADIUS * 2,
      paddleSize: PADDLE_RADIUS * 2,
      puckLeft: (matchState.puck.x * width) - PUCK_RADIUS,
      puckTop: (puckDisplayY * height) - PUCK_RADIUS,
      redLeft: (matchState.redPaddle.x * width) - PADDLE_RADIUS,
      redTop: (redDisplayY * height) - PADDLE_RADIUS,
      blueLeft: (matchState.bluePaddle.x * width) - PADDLE_RADIUS,
      blueTop: (blueDisplayY * height) - PADDLE_RADIUS,
    };
  }, [boardLayout.height, boardLayout.width, isBluePerspective, matchState.bluePaddle, matchState.puck, matchState.redPaddle]);

  function emitMove(nextPosition) {
    const now = Date.now();
    if (!socketRef.current || now - lastMoveSentAtRef.current < 6) {
      return;
    }
    lastMoveSentAtRef.current = now;
    socketRef.current.emit('air:move', nextPosition);
  }

  function emitStop(nextPosition) {
    if (!socketRef.current || !nextPosition) {
      return;
    }
    socketRef.current.emit('air:stop', nextPosition);
  }

  function toNormalizedPosition(pageX, pageY) {
    if (!boardLayout.width || !boardLayout.height) {
      return null;
    }
    const x = clamp(pageX / boardLayout.width, 0.08, 0.92);
    const displayY = pageY / boardLayout.height;
    const rawY = isBluePerspective ? 1 - displayY : displayY;
    const y = myRole === 'blue'
      ? clamp(rawY, 0.08, 0.46)
      : clamp(rawY, 0.54, 0.92);
    return { x, y };
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => matchState.phase === 'playing' && Boolean(myRole),
    onMoveShouldSetPanResponder: () => matchState.phase === 'playing' && Boolean(myRole),
    onPanResponderGrant: (event) => {
      const position = toNormalizedPosition(event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (!position) {
        return;
      }
      setDragPaddle(position);
      emitMove(position);
    },
    onPanResponderMove: (event) => {
      const position = toNormalizedPosition(event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (!position) {
        return;
      }
      setDragPaddle(position);
      emitMove(position);
    },
    onPanResponderRelease: () => {
      emitStop(dragPaddle || paddlePosition);
      setDragPaddle(null);
    },
    onPanResponderTerminate: () => {
      emitStop(dragPaddle || paddlePosition);
      setDragPaddle(null);
    },
  }), [boardLayout.height, boardLayout.width, dragPaddle, matchState.phase, myRole, paddlePosition]);

  const lobbyMessage = !bothPlayersReady
    ? 'Waiting for another user to join.'
    : friendOffline
      ? 'Another user is not in the game. Go offline.'
      : localReadyLock
        ? 'Waiting for other user to start the match.'
        : 'Both users are here. Tap start when ready.';

  const lobbyButtonLabel = friendOffline
    ? 'GO OFFLINE'
    : localReadyLock
      ? 'WAITING...'
      : 'START';

  const boardPanHandlers = matchState.phase === 'playing' ? panResponder.panHandlers : {};

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable style={[styles.sidePill, styles.scorePill]}>
          <Text style={styles.scoreBlue}>{matchState.blueScore}</Text>
          <Text style={styles.scoreDivider}>•</Text>
          <Text style={styles.scoreRed}>{matchState.redScore}</Text>
        </Pressable>
        <Pressable
          style={[styles.sidePill, styles.exitPill]}
          onPress={() => {
            socketRef.current?.emit('air:leave');
            onExit?.();
          }}
        >
          <Text style={styles.exitText}>EXIT</Text>
        </Pressable>
      </View>

      <View
        style={styles.boardWrap}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setBoardLayout({
            width,
            height: width / BOARD_RATIO,
          });
        }}
      >
        <View style={[styles.board, { aspectRatio: BOARD_RATIO }]}>
          <View style={styles.boardShade} />
          <View style={[styles.goalShell, styles.goalTopShell, styles.goalTop]}>
            <View
              style={[
                styles.goalInner,
                styles.goalInnerTop,
                isBluePerspective ? styles.goalInnerRed : styles.goalInnerBlue,
              ]}
            />
          </View>
          <View style={[styles.goalShell, styles.goalBottomShell, styles.goalBottom]}>
            <View
              style={[
                styles.goalInner,
                styles.goalInnerBottom,
                isBluePerspective ? styles.goalInnerBlue : styles.goalInnerRed,
              ]}
            />
          </View>

          <View style={styles.centerLine} />

          <View style={[styles.centerPuckLine, styles.centerPuckLineTop]} />
          <View style={[styles.centerPuckLine, styles.centerPuckLineBottom]} />

          <View style={[styles.puck, { left: boardMetrics.puckLeft, top: boardMetrics.puckTop }]} />

          <View
            style={[
              styles.paddle,
              styles.bluePaddle,
              {
                left: myRole === 'blue' && dragPaddle
                  ? ((paddlePosition.x * boardMetrics.width) - PADDLE_RADIUS)
                  : boardMetrics.blueLeft,
                top: myRole === 'blue' && dragPaddle
                  ? ((mapDisplayY(paddlePosition.y) * boardMetrics.height) - PADDLE_RADIUS)
                  : boardMetrics.blueTop,
              },
            ]}
          />
          <View
            style={[
              styles.paddle,
              styles.redPaddle,
              {
                left: myRole === 'red' && dragPaddle
                  ? ((paddlePosition.x * boardMetrics.width) - PADDLE_RADIUS)
                  : boardMetrics.redLeft,
                top: myRole === 'red' && dragPaddle
                  ? ((mapDisplayY(paddlePosition.y) * boardMetrics.height) - PADDLE_RADIUS)
                  : boardMetrics.redTop,
              },
            ]}
          />

          <View style={StyleSheet.absoluteFill} {...boardPanHandlers} />

          {matchState.phase === 'intro' ? (
            <View style={styles.countdownOverlay}>
              <Text style={styles.countdownText}>{introCountdown || 1}</Text>
            </View>
          ) : null}

          {matchState.phase === 'lobby' ? (
            <View style={styles.lobbyOverlay}>
              <Text style={styles.lobbyTitle}>Air Hockey</Text>
              <Text style={styles.lobbyText}>{lobbyMessage}</Text>
              {myRole ? (
                <Text style={[styles.lobbyMeta, myRole === 'blue' ? styles.lobbyMetaBlue : styles.lobbyMetaRed]}>
                  {`You are ${myRole.toUpperCase()}`}
                </Text>
              ) : null}
              <Pressable
                style={[styles.lobbyButton, localReadyLock && !friendOffline ? styles.lobbyButtonMuted : null]}
                onPress={() => {
                  if (friendOffline) {
                    socketRef.current?.emit('air:leave');
                    onExit?.();
                    return;
                  }
                  if (!localReadyLock) {
                    socketRef.current?.emit('air:start');
                  }
                }}
              >
                <Text style={styles.lobbyButtonText}>{lobbyButtonLabel}</Text>
              </Pressable>
            </View>
          ) : null}

          {matchState.phase === 'match' ? (
            <View style={styles.lobbyOverlay}>
              <Text style={styles.lobbyTitle}>{matchState.matchWinner || 'Match Over'}</Text>
              <Text style={styles.lobbyText}>Tap replay when both users are ready again.</Text>
              <Pressable
                style={styles.lobbyButton}
                onPress={() => {
                  socketRef.current?.emit('air:replay');
                }}
              >
                <Text style={styles.lobbyButtonText}>PLAY AGAIN</Text>
              </Pressable>
            </View>
          ) : null}

          {!myRole ? (
            <View style={styles.loadingRole}>
              <ActivityIndicator color="#111111" size="small" />
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const ringBase = {
  borderWidth: 10,
  borderColor: '#050505',
  shadowColor: '#000000',
  shadowOpacity: 0.22,
  shadowRadius: 4,
  shadowOffset: { width: 6, height: 7 },
  elevation: 5,
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#163E69',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sidePill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#0E0E0E',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  scorePill: {
    flexDirection: 'row',
    gap: 6,
  },
  exitPill: {
    minWidth: 88,
  },
  scoreBlue: {
    color: '#1AA7F6',
    fontSize: 26,
    fontWeight: '900',
  },
  scoreDivider: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '900',
  },
  scoreRed: {
    color: '#FF5B67',
    fontSize: 26,
    fontWeight: '900',
  },
  exitText: {
    color: '#24324A',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  boardWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  board: {
    backgroundColor: '#FFFFFF',
    borderWidth: 12,
    borderColor: '#060606',
    borderRadius: 22,
    overflow: 'visible',
    alignSelf: 'stretch',
  },
  boardShade: {
    display: 'none',
  },
  goalShell: {
    position: 'absolute',
    left: '50%',
    marginLeft: -(GOAL_WIDTH / 2),
    width: GOAL_WIDTH,
    height: GOAL_HEIGHT,
    backgroundColor: '#050505',
    alignItems: 'center',
  },
  goalTopShell: {
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  goalBottomShell: {
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
  },
  goalTop: {
    top: -24,
  },
  goalBottom: {
    bottom: -24,
  },
  goalInner: {
    width: GOAL_INNER_WIDTH,
    height: GOAL_INNER_HEIGHT,
  },
  goalInnerTop: {
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    marginTop: 5,
  },
  goalInnerBottom: {
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    marginTop: 3,
  },
  goalInnerBlue: {
    backgroundColor: '#1CB4FF',
  },
  goalInnerRed: {
    backgroundColor: '#FF5C67',
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: -1,
    right: -1,
    height: 18,
    marginTop: -9,
    backgroundColor: '#FF2E79',
    borderRadius: 999,
  },
  centerPuckLine: {
    display: 'none',
  },
  centerPuckLineTop: {
    top: '32%',
    height: 110,
  },
  centerPuckLineBottom: {
    bottom: '22%',
    height: 110,
  },
  puck: {
    position: 'absolute',
    width: PUCK_RADIUS * 2,
    height: PUCK_RADIUS * 2,
    borderRadius: 999,
    backgroundColor: '#4B5563',
    borderWidth: 8,
    borderColor: '#090909',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 6, height: 7 },
    elevation: 5,
  },
  paddle: {
    position: 'absolute',
    width: PADDLE_RADIUS * 2,
    height: PADDLE_RADIUS * 2,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bluePaddle: {
    ...ringBase,
    backgroundColor: '#19B3FF',
  },
  redPaddle: {
    ...ringBase,
    backgroundColor: '#FF5C67',
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(125, 220, 255, 0.26)',
  },
  countdownText: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 180,
    fontWeight: '900',
    lineHeight: 180,
  },
  lobbyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(240, 246, 255, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  lobbyTitle: {
    color: '#0F1827',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 10,
  },
  lobbyText: {
    color: '#24324A',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 12,
  },
  lobbyMeta: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 18,
  },
  lobbyMetaBlue: {
    color: '#1AA7F6',
  },
  lobbyMetaRed: {
    color: '#FF5C67',
  },
  lobbyButton: {
    minWidth: 180,
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: '#111111',
    alignItems: 'center',
  },
  lobbyButtonMuted: {
    opacity: 0.65,
  },
  lobbyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  loadingRole: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
