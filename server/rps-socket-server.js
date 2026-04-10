const http = require('http');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || process.env.RPS_SOCKET_PORT || 3001);
const INTRO_MS = 2100;
const COUNTDOWN_MS = 5000;
const RESULT_MS = 1000;
const OFFLINE_MS = 4000;
const TTT_DRAW_RESET_MS = 1100;
const AIR_INTRO_MS = 2100;
const AIR_GOAL_PAUSE_MS = 1000;
const AIR_MATCH_SCORE = 5;
const AIR_TICK_MS = 1000 / 60;
const AIR_PUCK_RADIUS = 0.033;
const AIR_PADDLE_RADIUS = 0.068;
const AIR_GOAL_HALF_WIDTH = 0.17;
const AIR_MAX_PADDLE_SPEED = 3.4;
const AIR_BASE_PUCK_SPEED = 0.92;
const AIR_MAX_PUCK_SPEED = 1.75;
const AIR_PADDLE_INFLUENCE = 0.28;
const TTT_WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const rpsRooms = new Map();
const tttRooms = new Map();
const airRooms = new Map();

function createPlayerRoomState(roomId, roomCode = '') {
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
    phase: 'lobby',
    phaseStartedAt: '',
    phaseEndsAt: '',
    updatedAt: '',
    updatedBy: '',
    redSocketId: '',
    blueSocketId: '',
    redLastSeenAt: '',
    blueLastSeenAt: '',
    timers: [],
    loopId: null,
  };
}

function createRpsRoomState(roomId, roomCode = '') {
  return {
    ...createPlayerRoomState(roomId, roomCode),
    redChoice: 0,
    blueChoice: 0,
    resolvedRedChoice: 0,
    resolvedBlueChoice: 0,
    redScore: 0,
    blueScore: 0,
    roundWinner: '',
    matchWinner: '',
  };
}

function createTttRoomState(roomId, roomCode = '') {
  return {
    ...createPlayerRoomState(roomId, roomCode),
    board: Array(9).fill(''),
    currentTurn: 'red',
    startingTurn: 'red',
    winningCells: [],
    roundWinner: '',
    matchWinner: '',
  };
}

function createAirRoomState(roomId, roomCode = '') {
  return {
    ...createPlayerRoomState(roomId, roomCode),
    redScore: 0,
    blueScore: 0,
    serveRole: Math.random() > 0.5 ? 'red' : 'blue',
    puck: {
      x: 0.5,
      y: 0.68,
      vx: 0,
      vy: 0,
    },
    redPaddle: {
      x: 0.5,
      y: 0.82,
      vx: 0,
      vy: 0,
    },
    bluePaddle: {
      x: 0.5,
      y: 0.18,
      vx: 0,
      vy: 0,
    },
    matchWinner: '',
    roundWinner: '',
    goalScoredBy: '',
  };
}

function getRoom(store, createRoomState, roomId, roomCode = '') {
  if (!store.has(roomId)) {
    store.set(roomId, createRoomState(roomId, roomCode));
  }
  const room = store.get(roomId);
  if (roomCode && !room.roomCode) {
    room.roomCode = roomCode;
  }
  return room;
}

function clearTimers(room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
  if (room.loopId) {
    clearInterval(room.loopId);
    room.loopId = null;
  }
}

function markUpdated(room, userId = '') {
  room.updatedAt = new Date().toISOString();
  room.updatedBy = userId;
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

function assignRole(room, socket, roomCode) {
  let role = '';

  if (room.redPlayerId === socket.data.userId || !room.redPlayerId) {
    room.redPlayerId = socket.data.userId;
    room.redOnline = true;
    room.redSocketId = socket.id;
    room.redLastSeenAt = new Date().toISOString();
    role = 'red';
  } else if (room.bluePlayerId === socket.data.userId || !room.bluePlayerId) {
    room.bluePlayerId = socket.data.userId;
    room.blueOnline = true;
    room.blueSocketId = socket.id;
    room.blueLastSeenAt = new Date().toISOString();
    role = 'blue';
  } else {
    role = room.redOnline ? 'blue' : 'red';
  }

  if (roomCode && !room.roomCode) {
    room.roomCode = roomCode;
  }

  return role;
}

function toRpsClientState(room) {
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
    phaseEndsAt: room.phaseEndsAt,
    serverNow: new Date().toISOString(),
    updatedAt: room.updatedAt,
    updatedBy: room.updatedBy,
  };
}

function emitRpsState(io, room) {
  io.to(room.roomId).emit('rps:state', toRpsClientState(room));
}

function resolveRpsResult(blueChoice, redChoice) {
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

function startRpsCountdown(io, room) {
  clearTimers(room);
  room.redChoice = 0;
  room.blueChoice = 0;
  room.resolvedRedChoice = 0;
  room.resolvedBlueChoice = 0;
  room.roundWinner = '';
  room.phase = 'countdown';
  room.phaseStartedAt = new Date().toISOString();
  room.phaseEndsAt = new Date(Date.now() + COUNTDOWN_MS).toISOString();
  markUpdated(room);
  emitRpsState(io, room);

  room.timers.push(setTimeout(() => {
    const result = resolveRpsResult(room.blueChoice, room.redChoice);
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
      nextRoundWinner = (!room.blueChoice && !room.redChoice) ? 'NO PICK DRAW' : 'DRAW';
    }

    room.roundWinner = nextRoundWinner;
    room.phase = room.matchWinner ? 'match' : 'result';
    room.phaseStartedAt = new Date().toISOString();
    room.phaseEndsAt = room.matchWinner ? '' : new Date(Date.now() + RESULT_MS).toISOString();
    markUpdated(room);
    emitRpsState(io, room);

    if (room.matchWinner) {
      return;
    }

    room.timers.push(setTimeout(() => {
      if (!room.redOnline || !room.blueOnline) {
        room.phase = 'lobby';
        room.phaseStartedAt = '';
        room.phaseEndsAt = '';
        room.redReady = false;
        room.blueReady = false;
        markUpdated(room);
        emitRpsState(io, room);
        return;
      }
      startRpsCountdown(io, room);
    }, RESULT_MS));
  }, COUNTDOWN_MS));
}

function startRpsIntro(io, room) {
  clearTimers(room);
  room.redChoice = 0;
  room.blueChoice = 0;
  room.resolvedRedChoice = 0;
  room.resolvedBlueChoice = 0;
  room.roundWinner = '';
  room.matchWinner = '';
  room.phase = 'intro';
  room.phaseStartedAt = new Date().toISOString();
  room.phaseEndsAt = new Date(Date.now() + INTRO_MS).toISOString();
  markUpdated(room);
  emitRpsState(io, room);

  room.timers.push(setTimeout(() => {
    if (!room.redOnline || !room.blueOnline || !room.redReady || !room.blueReady) {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      markUpdated(room);
      emitRpsState(io, room);
      return;
    }
    startRpsCountdown(io, room);
  }, INTRO_MS));
}

function maybeStartRpsMatch(io, room) {
  if (room.phase !== 'lobby') {
    return;
  }
  if (room.redPlayerId && room.bluePlayerId && room.redOnline && room.blueOnline && room.redReady && room.blueReady) {
    startRpsIntro(io, room);
  } else {
    markUpdated(room);
    emitRpsState(io, room);
  }
}

function resetRpsRoom(room) {
  room.redReady = false;
  room.blueReady = false;
  room.redChoice = 0;
  room.blueChoice = 0;
  room.resolvedRedChoice = 0;
  room.resolvedBlueChoice = 0;
  room.redScore = 0;
  room.blueScore = 0;
  room.roundWinner = '';
  room.matchWinner = '';
  room.phase = 'lobby';
  room.phaseStartedAt = '';
  room.phaseEndsAt = '';
  clearTimers(room);
}

function removeRpsPlayer(io, room, role, clearIdentity = false) {
  if (!role) {
    return;
  }

  if (clearIdentity) {
    if (role === 'red') {
      room.redPlayerId = '';
    } else {
      room.bluePlayerId = '';
    }
  }

  if (role === 'red') {
    room.redOnline = false;
    room.redSocketId = '';
    room.redLastSeenAt = '';
  } else {
    room.blueOnline = false;
    room.blueSocketId = '';
    room.blueLastSeenAt = '';
  }

  resetRpsRoom(room);
  markUpdated(room);
  emitRpsState(io, room);
}

function toTttClientState(room) {
  return {
    version: room.version,
    roomCode: room.roomCode,
    redPlayerId: room.redPlayerId,
    bluePlayerId: room.bluePlayerId,
    redOnline: room.redOnline,
    blueOnline: room.blueOnline,
    redReady: room.redReady,
    blueReady: room.blueReady,
    board: room.board,
    currentTurn: room.currentTurn,
    startingTurn: room.startingTurn,
    winningCells: room.winningCells,
    roundWinner: room.roundWinner,
    matchWinner: room.matchWinner,
    phase: room.phase,
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    serverNow: new Date().toISOString(),
    updatedAt: room.updatedAt,
    updatedBy: room.updatedBy,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positionAirPaddles(room) {
  room.redPaddle = {
    x: 0.5,
    y: 0.82,
    vx: 0,
    vy: 0,
  };
  room.bluePaddle = {
    x: 0.5,
    y: 0.18,
    vx: 0,
    vy: 0,
  };
}

function positionAirPuck(room, serveRole = room.serveRole || 'red') {
  room.serveRole = serveRole;
  room.puck = {
    x: 0.5,
    y: serveRole === 'red' ? 0.68 : 0.32,
    vx: 0,
    vy: 0,
  };
}

function toAirClientState(room) {
  return {
    version: room.version,
    roomCode: room.roomCode,
    redPlayerId: room.redPlayerId,
    bluePlayerId: room.bluePlayerId,
    redOnline: room.redOnline,
    blueOnline: room.blueOnline,
    redReady: room.redReady,
    blueReady: room.blueReady,
    redScore: room.redScore,
    blueScore: room.blueScore,
    serveRole: room.serveRole,
    puck: room.puck,
    redPaddle: room.redPaddle,
    bluePaddle: room.bluePaddle,
    roundWinner: room.roundWinner,
    goalScoredBy: room.goalScoredBy,
    matchWinner: room.matchWinner,
    phase: room.phase,
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    serverNow: new Date().toISOString(),
    updatedAt: room.updatedAt,
    updatedBy: room.updatedBy,
  };
}

function emitAirState(io, room) {
  io.to(room.roomId).emit('air:state', toAirClientState(room));
}

function resetAirRound(room, serveRole = room.serveRole || 'red') {
  positionAirPaddles(room);
  positionAirPuck(room, serveRole);
  room.roundWinner = '';
  room.goalScoredBy = '';
}

function bounceAirPuckOffPaddle(room, paddle) {
  const dx = room.puck.x - paddle.x;
  const dy = room.puck.y - paddle.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  const overlap = AIR_PADDLE_RADIUS + AIR_PUCK_RADIUS - distance;
  if (overlap <= 0) {
    return false;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  room.puck.x += nx * overlap;
  room.puck.y += ny * overlap;

  const dot = (room.puck.vx * nx) + (room.puck.vy * ny);
  if (dot < 0) {
    room.puck.vx -= 2 * dot * nx;
    room.puck.vy -= 2 * dot * ny;
  }

  room.puck.vx += paddle.vx * AIR_PADDLE_INFLUENCE;
  room.puck.vy += paddle.vy * AIR_PADDLE_INFLUENCE;

  const nextSpeed = Math.hypot(room.puck.vx, room.puck.vy);
  if (nextSpeed < 0.03) {
    room.puck.vx = 0;
    room.puck.vy = 0;
    return true;
  }

  const cappedSpeed = clamp(nextSpeed, 0, AIR_MAX_PUCK_SPEED);
  const nextAngle = Math.atan2(room.puck.vy, room.puck.vx);
  room.puck.vx = Math.cos(nextAngle) * cappedSpeed;
  room.puck.vy = Math.sin(nextAngle) * cappedSpeed;
  return true;
}

function scoreAirGoal(io, room, scorerRole) {
  clearTimers(room);

  room.goalScoredBy = scorerRole;
  room.roundWinner = scorerRole === 'red' ? 'RED SCORED' : 'BLUE SCORED';
  room.matchWinner = '';

  if (scorerRole === 'red') {
    room.redScore += 1;
    room.serveRole = 'blue';
    room.puck.x = 0.5;
    room.puck.y = 0.03;
  } else {
    room.blueScore += 1;
    room.serveRole = 'red';
    room.puck.x = 0.5;
    room.puck.y = 0.97;
  }

  room.puck.vx = 0;
  room.puck.vy = 0;
  room.phase = 'goal';
  room.phaseStartedAt = new Date().toISOString();
  room.phaseEndsAt = new Date(Date.now() + AIR_GOAL_PAUSE_MS).toISOString();

  if (room.redScore >= AIR_MATCH_SCORE) {
    room.matchWinner = 'RED WINS';
    room.phase = 'match';
    room.phaseEndsAt = '';
  } else if (room.blueScore >= AIR_MATCH_SCORE) {
    room.matchWinner = 'BLUE WINS';
    room.phase = 'match';
    room.phaseEndsAt = '';
  }

  markUpdated(room);
  emitAirState(io, room);

  if (room.matchWinner) {
    return;
  }

  room.timers.push(setTimeout(() => {
    if (!room.redOnline || !room.blueOnline) {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      room.redReady = false;
      room.blueReady = false;
      markUpdated(room);
      emitAirState(io, room);
      return;
    }

    resetAirRound(room, room.serveRole);
    room.phase = 'playing';
    room.phaseStartedAt = new Date().toISOString();
    room.phaseEndsAt = '';
    markUpdated(room);
    emitAirState(io, room);
    startAirLoop(io, room);
  }, AIR_GOAL_PAUSE_MS));
}

function stepAirRoom(io, room) {
  if (room.phase !== 'playing') {
    return;
  }

  const dt = AIR_TICK_MS / 1000;
  room.puck.x += room.puck.vx * dt;
  room.puck.y += room.puck.vy * dt;

  if (Math.abs(room.puck.vx) < 0.001 && Math.abs(room.puck.vy) < 0.001) {
    room.puck.vx = 0;
    room.puck.vy = 0;
  }

  if (room.puck.x <= AIR_PUCK_RADIUS) {
    room.puck.x = AIR_PUCK_RADIUS;
    room.puck.vx = Math.abs(room.puck.vx);
  } else if (room.puck.x >= 1 - AIR_PUCK_RADIUS) {
    room.puck.x = 1 - AIR_PUCK_RADIUS;
    room.puck.vx = -Math.abs(room.puck.vx);
  }

  bounceAirPuckOffPaddle(room, room.redPaddle);
  bounceAirPuckOffPaddle(room, room.bluePaddle);

  const inGoalChannel = Math.abs(room.puck.x - 0.5) <= AIR_GOAL_HALF_WIDTH;
  if (room.puck.y <= AIR_PUCK_RADIUS) {
    if (inGoalChannel) {
      scoreAirGoal(io, room, 'red');
      return;
    }
    room.puck.y = AIR_PUCK_RADIUS;
    room.puck.vy = Math.abs(room.puck.vy);
  } else if (room.puck.y >= 1 - AIR_PUCK_RADIUS) {
    if (inGoalChannel) {
      scoreAirGoal(io, room, 'blue');
      return;
    }
    room.puck.y = 1 - AIR_PUCK_RADIUS;
    room.puck.vy = -Math.abs(room.puck.vy);
  }

  room.puck.vx *= 0.9985;
  room.puck.vy *= 0.9985;
  if (Math.abs(room.puck.vx) < 0.01) {
    room.puck.vx = 0;
  }
  if (Math.abs(room.puck.vy) < 0.01) {
    room.puck.vy = 0;
  }
  emitAirState(io, room);
}

function startAirLoop(io, room) {
  if (room.loopId) {
    clearInterval(room.loopId);
  }
  room.loopId = setInterval(() => {
    stepAirRoom(io, room);
  }, AIR_TICK_MS);
}

function startAirIntro(io, room) {
  clearTimers(room);
  room.matchWinner = '';
  room.redScore = 0;
  room.blueScore = 0;
  room.serveRole = Math.random() > 0.5 ? 'red' : 'blue';
  resetAirRound(room, room.serveRole);
  room.phase = 'intro';
  room.phaseStartedAt = new Date().toISOString();
  room.phaseEndsAt = new Date(Date.now() + AIR_INTRO_MS).toISOString();
  markUpdated(room);
  emitAirState(io, room);

  room.timers.push(setTimeout(() => {
    if (!room.redOnline || !room.blueOnline || !room.redReady || !room.blueReady) {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      markUpdated(room);
      emitAirState(io, room);
      return;
    }

    room.phase = 'playing';
    room.phaseStartedAt = new Date().toISOString();
    room.phaseEndsAt = '';
    markUpdated(room);
    emitAirState(io, room);
    startAirLoop(io, room);
  }, AIR_INTRO_MS));
}

function maybeStartAirMatch(io, room) {
  if (room.phase !== 'lobby') {
    return;
  }
  if (room.redPlayerId && room.bluePlayerId && room.redOnline && room.blueOnline && room.redReady && room.blueReady) {
    startAirIntro(io, room);
  } else {
    markUpdated(room);
    emitAirState(io, room);
  }
}

function resetAirRoom(room) {
  room.redReady = false;
  room.blueReady = false;
  room.redScore = 0;
  room.blueScore = 0;
  room.serveRole = 'red';
  resetAirRound(room, room.serveRole);
  room.matchWinner = '';
  room.phase = 'lobby';
  room.phaseStartedAt = '';
  room.phaseEndsAt = '';
  clearTimers(room);
}

function removeAirPlayer(io, room, role, clearIdentity = false) {
  if (!role) {
    return;
  }

  if (clearIdentity) {
    if (role === 'red') {
      room.redPlayerId = '';
    } else {
      room.bluePlayerId = '';
    }
  }

  if (role === 'red') {
    room.redOnline = false;
    room.redSocketId = '';
    room.redLastSeenAt = '';
  } else {
    room.blueOnline = false;
    room.blueSocketId = '';
    room.blueLastSeenAt = '';
  }

  resetAirRoom(room);
  markUpdated(room);
  emitAirState(io, room);
}

function emitTttState(io, room) {
  io.to(room.roomId).emit('ttt:state', toTttClientState(room));
}

function resetTttBoard(room, keepWinner = false) {
  room.board = Array(9).fill('');
  room.winningCells = [];
  room.currentTurn = room.startingTurn;
  room.roundWinner = '';
  if (!keepWinner) {
    room.matchWinner = '';
  }
}

function startTttIntro(io, room) {
  clearTimers(room);
  room.startingTurn = room.startingTurn || 'red';
  resetTttBoard(room);
  room.phase = 'intro';
  room.phaseStartedAt = new Date().toISOString();
  room.phaseEndsAt = new Date(Date.now() + INTRO_MS).toISOString();
  markUpdated(room);
  emitTttState(io, room);

  room.timers.push(setTimeout(() => {
    if (!room.redOnline || !room.blueOnline || !room.redReady || !room.blueReady) {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      markUpdated(room);
      emitTttState(io, room);
      return;
    }

    room.phase = 'playing';
    room.phaseStartedAt = new Date().toISOString();
    room.phaseEndsAt = '';
    room.currentTurn = room.startingTurn;
    markUpdated(room);
    emitTttState(io, room);
  }, INTRO_MS));
}

function maybeStartTttMatch(io, room) {
  if (room.phase !== 'lobby') {
    return;
  }
  if (room.redPlayerId && room.bluePlayerId && room.redOnline && room.blueOnline && room.redReady && room.blueReady) {
    startTttIntro(io, room);
  } else {
    markUpdated(room);
    emitTttState(io, room);
  }
}

function getTttWinningCells(board) {
  for (const line of TTT_WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return line;
    }
  }
  return [];
}

function scheduleTttDrawReset(io, room) {
  clearTimers(room);
  room.timers.push(setTimeout(() => {
    if (!room.redOnline || !room.blueOnline || !room.redReady || !room.blueReady) {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      room.redReady = false;
      room.blueReady = false;
      markUpdated(room);
      emitTttState(io, room);
      return;
    }

    room.startingTurn = room.startingTurn === 'red' ? 'blue' : 'red';
    resetTttBoard(room);
    room.phase = 'playing';
    room.phaseStartedAt = new Date().toISOString();
    room.phaseEndsAt = '';
    room.currentTurn = room.startingTurn;
    markUpdated(room);
    emitTttState(io, room);
  }, TTT_DRAW_RESET_MS));
}

function resetTttRoom(room) {
  room.redReady = false;
  room.blueReady = false;
  room.startingTurn = 'red';
  resetTttBoard(room);
  room.phase = 'lobby';
  room.phaseStartedAt = '';
  room.phaseEndsAt = '';
  clearTimers(room);
}

function removeTttPlayer(io, room, role, clearIdentity = false) {
  if (!role) {
    return;
  }

  if (clearIdentity) {
    if (role === 'red') {
      room.redPlayerId = '';
    } else {
      room.bluePlayerId = '';
    }
  }

  if (role === 'red') {
    room.redOnline = false;
    room.redSocketId = '';
    room.redLastSeenAt = '';
  } else {
    room.blueOnline = false;
    room.blueSocketId = '';
    room.blueLastSeenAt = '';
  }

  resetTttRoom(room);
  markUpdated(room);
  emitTttState(io, room);
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
    socket.data.gameType = 'rps';
    socket.join(roomId);

    const room = getRoom(rpsRooms, createRpsRoomState, roomId, roomCode);
    const role = assignRole(room, socket, roomCode);

    socket.emit('rps:role', { role });
    markUpdated(room, userId);
    emitRpsState(io, room);
  });

  socket.on('rps:start', () => {
    const room = rpsRooms.get(socket.data.roomId);
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
    maybeStartRpsMatch(io, room);
  });

  socket.on('rps:choice', ({ choiceId }) => {
    const room = rpsRooms.get(socket.data.roomId);
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
    emitRpsState(io, room);
  });

  socket.on('rps:replay', () => {
    const room = rpsRooms.get(socket.data.roomId);
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
      startRpsIntro(io, room);
    } else {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      markUpdated(room, socket.data.userId);
      emitRpsState(io, room);
    }
  });

  socket.on('rps:ping', () => {
    const room = rpsRooms.get(socket.data.roomId);
    if (!room) {
      return;
    }

    const role = roleForSocket(room, socket);
    if (!role) {
      return;
    }

    let shouldEmit = false;
    if (role === 'red') {
      shouldEmit = !room.redOnline;
      room.redOnline = true;
      room.redLastSeenAt = new Date().toISOString();
      room.redSocketId = socket.id;
    } else {
      shouldEmit = !room.blueOnline;
      room.blueOnline = true;
      room.blueLastSeenAt = new Date().toISOString();
      room.blueSocketId = socket.id;
    }

    if (shouldEmit) {
      markUpdated(room, socket.data.userId);
      emitRpsState(io, room);
    }
  });

  socket.on('rps:leave', () => {
    const room = rpsRooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    removeRpsPlayer(io, room, roleForSocket(room, socket), true);
  });

  socket.on('ttt:join', ({ roomId, roomCode, userId }) => {
    if (!roomId || !userId) {
      return;
    }

    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.gameType = 'ttt';
    socket.join(roomId);

    const room = getRoom(tttRooms, createTttRoomState, roomId, roomCode);
    const role = assignRole(room, socket, roomCode);

    socket.emit('ttt:role', { role });
    markUpdated(room, userId);
    emitTttState(io, room);
  });

  socket.on('ttt:start', () => {
    const room = tttRooms.get(socket.data.roomId);
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
    maybeStartTttMatch(io, room);
  });

  socket.on('ttt:move', ({ cellIndex }) => {
    const room = tttRooms.get(socket.data.roomId);
    if (!room || room.phase !== 'playing' || room.matchWinner) {
      return;
    }

    const role = roleForSocket(room, socket);
    const index = Number(cellIndex);
    if (!role || !Number.isInteger(index) || index < 0 || index > 8) {
      return;
    }
    if (room.currentTurn !== role || room.board[index]) {
      return;
    }

    room.board[index] = role === 'red' ? 'X' : 'O';
    const winningCells = getTttWinningCells(room.board);

    if (winningCells.length) {
      room.winningCells = winningCells;
      room.roundWinner = role === 'red' ? 'RED WINS' : 'BLUE WINS';
      room.matchWinner = room.roundWinner;
      room.phase = 'match';
      room.phaseStartedAt = new Date().toISOString();
      room.phaseEndsAt = '';
      room.startingTurn = role === 'red' ? 'blue' : 'red';
      clearTimers(room);
    } else if (room.board.every(Boolean)) {
      room.winningCells = [];
      room.roundWinner = 'DRAW';
      room.matchWinner = '';
      room.phase = 'draw';
      room.phaseStartedAt = new Date().toISOString();
      room.phaseEndsAt = '';
      markUpdated(room, socket.data.userId);
      emitTttState(io, room);
      scheduleTttDrawReset(io, room);
      return;
    } else {
      room.winningCells = [];
      room.roundWinner = '';
      room.currentTurn = role === 'red' ? 'blue' : 'red';
      room.phase = 'playing';
      room.phaseStartedAt = new Date().toISOString();
      room.phaseEndsAt = '';
    }

    markUpdated(room, socket.data.userId);
    emitTttState(io, room);
  });

  socket.on('ttt:replay', () => {
    const room = tttRooms.get(socket.data.roomId);
    if (!room) {
      return;
    }

    room.redReady = Boolean(room.redPlayerId && room.redOnline);
    room.blueReady = Boolean(room.bluePlayerId && room.blueOnline);
    room.startingTurn = room.startingTurn === 'blue' ? 'blue' : 'red';
    resetTttBoard(room);

    if (room.redReady && room.blueReady) {
      startTttIntro(io, room);
    } else {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      markUpdated(room, socket.data.userId);
      emitTttState(io, room);
    }
  });

  socket.on('ttt:ping', () => {
    const room = tttRooms.get(socket.data.roomId);
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
  });

  socket.on('ttt:leave', () => {
    const room = tttRooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    removeTttPlayer(io, room, roleForSocket(room, socket), true);
  });

  socket.on('air:join', ({ roomId, roomCode, userId }) => {
    if (!roomId || !userId) {
      return;
    }

    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.gameType = 'air';
    socket.join(roomId);

    const room = getRoom(airRooms, createAirRoomState, roomId, roomCode);
    const role = assignRole(room, socket, roomCode);

    socket.emit('air:role', { role });
    markUpdated(room, userId);
    emitAirState(io, room);
  });

  socket.on('air:start', () => {
    const room = airRooms.get(socket.data.roomId);
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
    maybeStartAirMatch(io, room);
  });

  socket.on('air:move', ({ x, y }) => {
    const room = airRooms.get(socket.data.roomId);
    if (!room || !['playing', 'goal', 'intro'].includes(room.phase)) {
      return;
    }

    const role = roleForSocket(room, socket);
    if (!role) {
      return;
    }

    const nextX = clamp(Number(x) || 0.5, AIR_PADDLE_RADIUS, 1 - AIR_PADDLE_RADIUS);
    const nextY = Number(y) || 0.5;
    const key = role === 'red' ? 'redPaddle' : 'bluePaddle';
    const paddle = room[key];
    const clampedY = role === 'red'
      ? clamp(nextY, 0.54, 1 - AIR_PADDLE_RADIUS)
      : clamp(nextY, AIR_PADDLE_RADIUS, 0.46);
    const dt = AIR_TICK_MS / 1000;
    const vx = clamp((nextX - paddle.x) / dt, -AIR_MAX_PADDLE_SPEED, AIR_MAX_PADDLE_SPEED);
    const vy = clamp((clampedY - paddle.y) / dt, -AIR_MAX_PADDLE_SPEED, AIR_MAX_PADDLE_SPEED);

    paddle.x = nextX;
    paddle.y = clampedY;
    paddle.vx = vx;
    paddle.vy = vy;

    markUpdated(room, socket.data.userId);
    emitAirState(io, room);
  });

  socket.on('air:replay', () => {
    const room = airRooms.get(socket.data.roomId);
    if (!room) {
      return;
    }

    room.redReady = Boolean(room.redPlayerId && room.redOnline);
    room.blueReady = Boolean(room.bluePlayerId && room.blueOnline);
    room.matchWinner = '';
    room.roundWinner = '';
    room.goalScoredBy = '';

    if (room.redReady && room.blueReady) {
      startAirIntro(io, room);
    } else {
      room.phase = 'lobby';
      room.phaseStartedAt = '';
      room.phaseEndsAt = '';
      markUpdated(room, socket.data.userId);
      emitAirState(io, room);
    }
  });

  socket.on('air:ping', () => {
    const room = airRooms.get(socket.data.roomId);
    if (!room) {
      return;
    }

    const role = roleForSocket(room, socket);
    if (!role) {
      return;
    }

    let shouldEmit = false;
    if (role === 'red') {
      shouldEmit = !room.redOnline;
      room.redOnline = true;
      room.redLastSeenAt = new Date().toISOString();
      room.redSocketId = socket.id;
    } else {
      shouldEmit = !room.blueOnline;
      room.blueOnline = true;
      room.blueLastSeenAt = new Date().toISOString();
      room.blueSocketId = socket.id;
    }

    if (shouldEmit) {
      markUpdated(room, socket.data.userId);
      emitAirState(io, room);
    }
  });

  socket.on('air:leave', () => {
    const room = airRooms.get(socket.data.roomId);
    if (!room) {
      return;
    }
    removeAirPlayer(io, room, roleForSocket(room, socket), true);
  });

  socket.on('disconnect', () => {
    const rpsRoom = socket.data.gameType === 'rps' ? rpsRooms.get(socket.data.roomId) : null;
    if (rpsRoom) {
      const rpsRole = roleForSocket(rpsRoom, socket);
      if (rpsRole) {
        if (rpsRole === 'red') {
          rpsRoom.redOnline = false;
          rpsRoom.redReady = false;
          rpsRoom.redChoice = 0;
          rpsRoom.redSocketId = '';
        } else {
          rpsRoom.blueOnline = false;
          rpsRoom.blueReady = false;
          rpsRoom.blueChoice = 0;
          rpsRoom.blueSocketId = '';
        }

        rpsRoom.phase = 'lobby';
        rpsRoom.phaseStartedAt = '';
        rpsRoom.phaseEndsAt = '';
        rpsRoom.roundWinner = '';
        rpsRoom.matchWinner = '';
        rpsRoom.resolvedRedChoice = 0;
        rpsRoom.resolvedBlueChoice = 0;
        clearTimers(rpsRoom);
        markUpdated(rpsRoom, socket.data.userId);
        emitRpsState(io, rpsRoom);

        setTimeout(() => {
          const stillRoom = rpsRooms.get(socket.data.roomId);
          if (!stillRoom) {
            return;
          }
          const lastSeen = rpsRole === 'red' ? stillRoom.redLastSeenAt : stillRoom.blueLastSeenAt;
          const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
          if (!lastSeenMs || (Date.now() - lastSeenMs) >= OFFLINE_MS) {
            removeRpsPlayer(io, stillRoom, rpsRole, true);
          }
        }, OFFLINE_MS);
      }
    }

    const tttRoom = socket.data.gameType === 'ttt' ? tttRooms.get(socket.data.roomId) : null;
    if (tttRoom) {
      const tttRole = roleForSocket(tttRoom, socket);
      if (tttRole) {
        if (tttRole === 'red') {
          tttRoom.redOnline = false;
          tttRoom.redReady = false;
          tttRoom.redSocketId = '';
        } else {
          tttRoom.blueOnline = false;
          tttRoom.blueReady = false;
          tttRoom.blueSocketId = '';
        }

        tttRoom.phase = 'lobby';
        tttRoom.phaseStartedAt = '';
        tttRoom.phaseEndsAt = '';
        tttRoom.roundWinner = '';
        tttRoom.matchWinner = '';
        tttRoom.winningCells = [];
        tttRoom.board = Array(9).fill('');
        clearTimers(tttRoom);
        markUpdated(tttRoom, socket.data.userId);
        emitTttState(io, tttRoom);

        setTimeout(() => {
          const stillRoom = tttRooms.get(socket.data.roomId);
          if (!stillRoom) {
            return;
          }
          const lastSeen = tttRole === 'red' ? stillRoom.redLastSeenAt : stillRoom.blueLastSeenAt;
          const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
          if (!lastSeenMs || (Date.now() - lastSeenMs) >= OFFLINE_MS) {
            removeTttPlayer(io, stillRoom, tttRole, true);
          }
        }, OFFLINE_MS);
      }
    }

    const airRoom = socket.data.gameType === 'air' ? airRooms.get(socket.data.roomId) : null;
    if (airRoom) {
      const airRole = roleForSocket(airRoom, socket);
      if (airRole) {
        if (airRole === 'red') {
          airRoom.redOnline = false;
          airRoom.redReady = false;
          airRoom.redSocketId = '';
        } else {
          airRoom.blueOnline = false;
          airRoom.blueReady = false;
          airRoom.blueSocketId = '';
        }

        airRoom.phase = 'lobby';
        airRoom.phaseStartedAt = '';
        airRoom.phaseEndsAt = '';
        airRoom.roundWinner = '';
        airRoom.goalScoredBy = '';
        airRoom.matchWinner = '';
        clearTimers(airRoom);
        markUpdated(airRoom, socket.data.userId);
        emitAirState(io, airRoom);

        setTimeout(() => {
          const stillRoom = airRooms.get(socket.data.roomId);
          if (!stillRoom) {
            return;
          }
          const lastSeen = airRole === 'red' ? stillRoom.redLastSeenAt : stillRoom.blueLastSeenAt;
          const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
          if (!lastSeenMs || (Date.now() - lastSeenMs) >= OFFLINE_MS) {
            removeAirPlayer(io, stillRoom, airRole, true);
          }
        }, OFFLINE_MS);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`RPS socket server listening on http://0.0.0.0:${PORT}`);
});
