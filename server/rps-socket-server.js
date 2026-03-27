const http = require('http');
const { Server } = require('socket.io');

const PORT = Number(process.env.RPS_SOCKET_PORT || 3001);
const INTRO_MS = 2100;
const COUNTDOWN_MS = 2100;
const RESULT_MS = 1000;
const OFFLINE_MS = 7000;

const rooms = new Map();

function createRoomState(roomId, roomCode = '') {
  return {
    roomId,
    roomCode,
    version: 1,
    redPlayerId: '',
    bluePlayerId: '',
    redOnline: false,
    blueOnline: false,
    redReady: false,
    blueReady: false,
    redChoice: 0,
    blueChoice: 0,
    resolvedRedChoice: 0,
    resolvedBlueChoice: 0,
    redScore: 0,
    blueScore: 0,
    roundWinner: '',
    matchWinner: '',
    phase: 'lobby',
    phaseStartedAt: '',
    updatedAt: '',
    updatedBy: '',
    redSocketId: '',
    blueSocketId: '',
    redLastSeenAt: '',
    blueLastSeenAt: '',
    timers: [],
  };
}

function getRoom(roomId, roomCode = '') {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoomState(roomId, roomCode));
  }
  const room = rooms.get(roomId);
  if (roomCode && !room.roomCode) {
    room.roomCode = roomCode;
  }
  return room;
}

function toClientState(room) {
  return {
    version: room.version,
    roomCode: room.roomCode,
    redPlayerId: room.redPlayerId,
    bluePlayerId: room.bluePlayerId,
    redOnline: room.redOnline,
    blueOnline: room.blueOnline,
    redReady: room.redReady,
    blueReady: room.blueReady,
    redChoice: room.redChoice,
    blueChoice: room.blueChoice,
    resolvedRedChoice: room.resolvedRedChoice,
    resolvedBlueChoice: room.resolvedBlueChoice,
    redScore: room.redScore,
    blueScore: room.blueScore,
    roundWinner: room.roundWinner,
    matchWinner: room.matchWinner,
    phase: room.phase,
    phaseStartedAt: room.phaseStartedAt,
    updatedAt: room.updatedAt,
    updatedBy: room.updatedBy,
  };
}

function clearTimers(room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
}

function markUpdated(room, userId = '') {
  room.updatedAt = new Date().toISOString();
  room.updatedBy = userId;
}

function emitState(io, room) {
  io.to(room.roomId).emit('rps:state', toClientState(room));
}

function resolveResult(blueChoice, redChoice) {
  if (blueChoice && redChoice) {
    if (blueChoice === redChoice) {
      return 'DRAW';
    }
    const blueWins = (blueChoice === 1 && redChoice === 3)
      || (blueChoice === 2 && redChoice === 1)
      || (blueChoice === 3 && redChoice === 2);
    return blueWins ? 'FIRST' : 'SECOND';
  }
  if (blueChoice) {
    return 'FIRST';
  }
  if (redChoice) {
    return 'SECOND';
  }
  return 'DRAW';
}

function startCountdown(io, room) {
  clearTimers(room);
  room.redChoice = 0;
  room.blueChoice = 0;
  room.resolvedRedChoice = 0;
  room.resolvedBlueChoice = 0;
  room.roundWinner = '';
  room.phase = 'countdown';
  room.phaseStartedAt = new Date().toISOString();
  markUpdated(room);
  emitState(io, room);

  room.timers.push(setTimeout(() => {
    const result = resolveResult(room.blueChoice, room.redChoice);
    let nextRoundWinner = '';

    room.resolvedBlueChoice = room.blueChoice;
    room.resolvedRedChoice = room.redChoice;

    if (result === 'FIRST') {
      room.blueScore += 1;
      nextRoundWinner = 'BLUE WINS';
      if (room.blueScore >= 5) {
        room.matchWinner = 'BLUE WINS';
      }
    } else if (result === 'SECOND') {
      room.redScore += 1;
      nextRoundWinner = 'RED WINS';
      if (room.redScore >= 5) {
        room.matchWinner = 'RED WINS';
      }
    } else {
      room.blueScore += 1;
      room.redScore += 1;
      nextRoundWinner = (!room.blueChoice && !room.redChoice) ? 'NO PICK TIE +1 +1' : 'TIE +1 +1';
      if (room.blueScore >= 5 || room.redScore >= 5) {
        if (room.blueScore === room.redScore) {
          room.matchWinner = 'TIE GAME';
        } else if (room.blueScore > room.redScore) {
          room.matchWinner = 'BLUE WINS';
        } else {
          room.matchWinner = 'RED WINS';
        }
      }
    }

    room.roundWinner = nextRoundWinner;
    room.phase = room.matchWinner ? 'match' : 'result';
    room.phaseStartedAt = new Date().toISOString();
    markUpdated(room);
    emitState(io, room);

    if (room.matchWinner) {
      return;
    }

    room.timers.push(setTimeout(() => {
      if (!room.redOnline || !room.blueOnline) {
        room.phase = 'lobby';
        room.redReady = false;
        room.blueReady = false;
        markUpdated(room);
        emitState(io, room);
        return;
      }
      startCountdown(io, room);
    }, RESULT_MS));
  }, COUNTDOWN_MS));
}

function startIntro(io, room) {
  clearTimers(room);
  room.redChoice = 0;
  room.blueChoice = 0;
  room.resolvedRedChoice = 0;
  room.resolvedBlueChoice = 0;
  room.roundWinner = '';
  room.matchWinner = '';
  room.phase = 'intro';
  room.phaseStartedAt = new Date().toISOString();
  markUpdated(room);
  emitState(io, room);

  room.timers.push(setTimeout(() => {
    if (!room.redOnline || !room.blueOnline || !room.redReady || !room.blueReady) {
      room.phase = 'lobby';
      markUpdated(room);
      emitState(io, room);
      return;
    }
    startCountdown(io, room);
  }, INTRO_MS));
}

function maybeStartMatch(io, room) {
  if (room.phase !== 'lobby') {
    return;
  }
  if (room.redPlayerId && room.bluePlayerId && room.redOnline && room.blueOnline && room.redReady && room.blueReady) {
    startIntro(io, room);
  } else {
    markUpdated(room);
    emitState(io, room);
  }
}

function roleForSocket(room, socket) {
  if (room.redSocketId === socket.id) {
    return 'red';
  }
  if (room.blueSocketId === socket.id) {
    return 'blue';
  }
  if (room.redPlayerId === socket.data.userId) {
    return 'red';
  }
  if (room.bluePlayerId === socket.data.userId) {
    return 'blue';
  }
  return '';
}

function removePlayer(io, room, role, clearIdentity = false) {
  if (!role) {
    return;
  }
  const isRed = role === 'red';
  if (clearIdentity) {
    if (isRed) {
      room.redPlayerId = '';
    } else {
      room.bluePlayerId = '';
    }
  }
  if (isRed) {
    room.redOnline = false;
    room.redReady = false;
    room.redChoice = 0;
    room.redSocketId = '';
    room.redLastSeenAt = '';
  } else {
    room.blueOnline = false;
    room.blueReady = false;
    room.blueChoice = 0;
    room.blueSocketId = '';
    room.blueLastSeenAt = '';
  }
  room.resolvedRedChoice = 0;
  room.resolvedBlueChoice = 0;
  room.roundWinner = '';
  room.matchWinner = '';
  room.redScore = 0;
  room.blueScore = 0;
  room.phase = 'lobby';
  room.phaseStartedAt = '';
  clearTimers(room);
  markUpdated(room);
  emitState(io, room);
}

const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

io.on('connection', (socket) => {
  socket.on('rps:join', ({ roomId, roomCode, userId }) => {
    if (!roomId || !userId) {
      return;
    }

    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.join(roomId);

    const room = getRoom(roomId, roomCode);

    let role = '';
    if (room.redPlayerId === userId || !room.redPlayerId) {
      room.redPlayerId = userId;
      room.redOnline = true;
      room.redSocketId = socket.id;
      room.redLastSeenAt = new Date().toISOString();
      role = 'red';
    } else if (room.bluePlayerId === userId || !room.bluePlayerId) {
      room.bluePlayerId = userId;
      room.blueOnline = true;
      room.blueSocketId = socket.id;
      room.blueLastSeenAt = new Date().toISOString();
      role = 'blue';
    } else {
      role = room.redOnline ? 'blue' : 'red';
    }

    socket.emit('rps:role', { role });
    markUpdated(room, userId);
    emitState(io, room);
  });

  socket.on('rps:start', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    const role = roleForSocket(room, socket);
    if (!role) {
      return;
    }
    if (role === 'red') {
      room.redReady = true;
      room.redOnline = true;
      room.redSocketId = socket.id;
      room.redLastSeenAt = new Date().toISOString();
    } else {
      room.blueReady = true;
      room.blueOnline = true;
      room.blueSocketId = socket.id;
      room.blueLastSeenAt = new Date().toISOString();
    }
    markUpdated(room, socket.data.userId);
    maybeStartMatch(io, room);
  });

  socket.on('rps:choice', ({ choiceId }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== 'countdown' || room.matchWinner) {
      return;
    }
    const role = roleForSocket(room, socket);
    if (role === 'red' && !room.redChoice) {
      room.redChoice = Number(choiceId) || 0;
    }
    if (role === 'blue' && !room.blueChoice) {
      room.blueChoice = Number(choiceId) || 0;
    }
    markUpdated(room, socket.data.userId);
    emitState(io, room);
  });

  socket.on('rps:replay', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    room.redScore = 0;
    room.blueScore = 0;
    room.redChoice = 0;
    room.blueChoice = 0;
    room.resolvedRedChoice = 0;
    room.resolvedBlueChoice = 0;
    room.roundWinner = '';
    room.matchWinner = '';
    room.redReady = Boolean(room.redPlayerId && room.redOnline);
    room.blueReady = Boolean(room.bluePlayerId && room.blueOnline);
    if (room.redReady && room.blueReady) {
      startIntro(io, room);
    } else {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      markUpdated(room, socket.data.userId);
      emitState(io, room);
    }
  });

  socket.on('rps:ping', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    const role = roleForSocket(room, socket);
    if (!role) {
      return;
    }
    if (role === 'red') {
      room.redOnline = true;
      room.redLastSeenAt = new Date().toISOString();
      room.redSocketId = socket.id;
    } else {
      room.blueOnline = true;
      room.blueLastSeenAt = new Date().toISOString();
      room.blueSocketId = socket.id;
    }
    markUpdated(room, socket.data.userId);
    emitState(io, room);
  });

  socket.on('rps:leave', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    removePlayer(io, room, roleForSocket(room, socket), true);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    const role = roleForSocket(room, socket);
    if (!role) {
      return;
    }

    if (role === 'red') {
      room.redOnline = false;
      room.redReady = false;
      room.redChoice = 0;
      room.redSocketId = '';
    } else {
      room.blueOnline = false;
      room.blueReady = false;
      room.blueChoice = 0;
      room.blueSocketId = '';
    }
    room.phase = 'lobby';
    room.phaseStartedAt = '';
    room.roundWinner = '';
    room.matchWinner = '';
    room.resolvedRedChoice = 0;
    room.resolvedBlueChoice = 0;
    clearTimers(room);
    markUpdated(room, socket.data.userId);
    emitState(io, room);

    setTimeout(() => {
      const stillRoom = rooms.get(socket.data.roomId);
      if (!stillRoom) {
        return;
      }
      const lastSeen = role === 'red' ? stillRoom.redLastSeenAt : stillRoom.blueLastSeenAt;
      const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
      if (!lastSeenMs || (Date.now() - lastSeenMs) >= OFFLINE_MS) {
        removePlayer(io, stillRoom, role, true);
      }
    }, OFFLINE_MS);
  });
});

httpServer.listen(PORT, () => {
  console.log(`RPS socket server listening on http://0.0.0.0:${PORT}`);
});
