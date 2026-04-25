'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const fs         = require('fs');
const path       = require('path');

/* ── Static data ─────────────────────────────────────────────────────────── */
const facts     = fs.readFileSync(path.join(__dirname, 'facts.txt'),     'utf8')
                    .split('\n').map(s => s.trim()).filter(Boolean);
const questions = fs.readFileSync(path.join(__dirname, 'questions.txt'), 'utf8')
                    .split('\n').map(s => s.trim()).filter(Boolean);

/* ── App / server setup ──────────────────────────────────────────────────── */
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout:  20000,
  pingInterval: 10000,
});

app.set('trust proxy', 1);
app.use(compression());

/* ── Rate limiting ───────────────────────────────────────────────────────── */
const limiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

/* ── Static files ────────────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  etag: true,
}));

/* ── REST helpers ────────────────────────────────────────────────────────── */
app.get('/api/fact', (_req, res) => {
  res.json({ fact: facts[Math.floor(Math.random() * facts.length)] });
});
app.get('/api/question', (_req, res) => {
  res.json({ question: questions[Math.floor(Math.random() * questions.length)] });
});

/* ══════════════════════════════════════════════════════════════════════════
   GAME STATE  (from server-games-patch.js)
══════════════════════════════════════════════════════════════════════════ */
const gameBySocket = new Map(); // socketId  → gameId
const gameById     = new Map(); // gameId    → game object

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMathQuestion() {
  const ops = ['+', '-', '*'];
  const op  = ops[rand(0, 2)];
  let a, b, answer;

  if (op === '+')      { a = rand(1, 50);  b = rand(1, 50); answer = a + b; }
  else if (op === '-') { a = rand(10, 99); b = rand(1, a);  answer = a - b; }
  else                 { a = rand(2, 12);  b = rand(2, 12); answer = a * b; }

  const display = op === '*' ? `${a} × ${b}` : `${a} ${op} ${b}`;
  return { display, answer };
}

function checkTTTWinner(board) {
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b,c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return { symbol: board[a], line: [a,b,c] };
  }
  return null;
}

function getRPSWinner(c1, c2) {
  if (c1 === c2) return 'draw';
  if (
    (c1 === 'rock'     && c2 === 'scissors') ||
    (c1 === 'scissors' && c2 === 'paper')    ||
    (c1 === 'paper'    && c2 === 'rock')
  ) return 'p1';
  return 'p2';
}

function cleanupGame(game) {
  game.players.forEach(pid => gameBySocket.delete(pid));
  gameById.delete(game.id);
}

function cleanupGameForSocket(socketId) {
  const gameId = gameBySocket.get(socketId);
  if (!gameId) return;
  const game = gameById.get(gameId);
  if (!game) { gameBySocket.delete(socketId); return; }

  const partnerId     = game.players.find(id => id !== socketId);
  const partnerSocket = partnerId && io.sockets.sockets.get(partnerId);
  if (partnerSocket) partnerSocket.emit('game:partnerLeft');

  cleanupGame(game);
}

/* ══════════════════════════════════════════════════════════════════════════
   CHAT STATE
══════════════════════════════════════════════════════════════════════════ */
let   waitingSocket = null;              // single-slot waiting queue
const blockedPairs  = new Set();         // "id1:id2" canonical pairs

function pairKey(a, b) {
  return [a, b].sort().join(':');
}

function broadcastOnlineCount() {
  io.emit('onlineCount', io.engine.clientsCount);
}

/* ══════════════════════════════════════════════════════════════════════════
   SOCKET.IO
══════════════════════════════════════════════════════════════════════════ */
io.on('connection', socket => {
  socket.partner = null;   // typed partner socket reference
  broadcastOnlineCount();

  /* ── SEARCH / MATCH ───────────────────────────────────────────────────── */
  socket.on('search', ({ name, bio } = {}) => {
    // Store user metadata
    socket.userName = (typeof name === 'string' ? name.slice(0, 20) : 'უცნობი') || 'უცნობი';
    socket.userBio  = typeof bio === 'string' ? bio.slice(0, 60) : '';

    // Already paired — skip first
    if (socket.partner) {
      disconnectPartner(socket, 'partnerLeft');
    }

    // Clean up any active game
    cleanupGameForSocket(socket.id);

    if (
      waitingSocket &&
      waitingSocket.id !== socket.id &&
      waitingSocket.connected &&
      !blockedPairs.has(pairKey(socket.id, waitingSocket.id))
    ) {
      // Pair them
      const other = waitingSocket;
      waitingSocket = null;

      socket.partner = other;
      other.partner  = socket;

      socket.emit('matched', { partnerName: other.userName, partnerBio: other.userBio });
      other.emit('matched',  { partnerName: socket.userName, partnerBio: socket.userBio });
    } else {
      // Join queue (replace any stale waiter)
      waitingSocket = socket;
      socket.emit('waiting');
    }
  });

  /* ── CHAT MESSAGE ─────────────────────────────────────────────────────── */
  socket.on('message', (data) => {
    if (!socket.partner) return;
    const payload = {
      text:      typeof data.text === 'string'  ? data.text.slice(0, 500)  : null,
      gifUrl:    typeof data.gifUrl === 'string' ? data.gifUrl              : null,
      replyTo:   data.replyTo
               ? { name: String(data.replyTo.name || '').slice(0, 20),
                   text: String(data.replyTo.text || '').slice(0, 200) }
               : null,
    };
    socket.partner.emit('message', payload);
  });

  /* ── TYPING ───────────────────────────────────────────────────────────── */
  socket.on('typing', ({ isTyping }) => {
    if (socket.partner) socket.partner.emit('typing', { isTyping: !!isTyping });
  });

  /* ── BLOCK ────────────────────────────────────────────────────────────── */
  socket.on('block', () => {
    if (!socket.partner) return;
    blockedPairs.add(pairKey(socket.id, socket.partner.id));
    disconnectPartner(socket, 'blocked');
    socket.emit('blocked');
  });

  /* ── NEXT (voluntary skip) ────────────────────────────────────────────── */
  socket.on('next', () => {
    if (socket.partner) {
      disconnectPartner(socket, 'partnerLeft');
    }
    cleanupGameForSocket(socket.id);
  });

  /* ── RANDOM FACT ──────────────────────────────────────────────────────── */
  socket.on('requestFact', () => {
    socket.emit('fact', facts[Math.floor(Math.random() * facts.length)]);
  });

  /* ── RANDOM QUESTION ──────────────────────────────────────────────────── */
  socket.on('requestQuestion', () => {
    const q = questions[Math.floor(Math.random() * questions.length)];
    socket.emit('question', q);
    if (socket.partner) socket.partner.emit('question', q);
  });

  /* ══════════════════════════════════════════════════════════════════════
     GAME HANDLERS  (from server-games-patch.js)
  ══════════════════════════════════════════════════════════════════════ */

  socket.on('game:request', ({ gameType }) => {
    const partner = socket.partner;
    if (!partner) return;
    partner.emit('game:invite', { gameType, fromId: socket.id });
  });

  socket.on('game:response', ({ accepted, gameType, toId }) => {
    const requesterSocket = io.sockets.sockets.get(toId);
    if (!requesterSocket) return;

    if (!accepted) {
      requesterSocket.emit('game:declined');
      return;
    }

    const gameId  = `${toId}:${socket.id}`;
    const players = [toId, socket.id];

    let state;
    if (gameType === 'ttt') {
      state = { board: Array(9).fill(null), currentTurnSocketId: toId };
    } else if (gameType === 'rps') {
      state = { choices: {} };
    } else if (gameType === 'math') {
      state = { question: generateMathQuestion(), answered: false };
    }

    const game = { id: gameId, type: gameType, players, state };
    gameById.set(gameId, game);
    gameBySocket.set(toId,      gameId);
    gameBySocket.set(socket.id, gameId);

    const roles = { [toId]: 'X', [socket.id]: 'O' };
    [toId, socket.id].forEach(pid => {
      const s = io.sockets.sockets.get(pid);
      if (s) s.emit('game:start', {
        gameId, gameType,
        role:       roles[pid] ?? null,
        opponentId: pid === toId ? socket.id : toId,
        state,
      });
    });
  });

  socket.on('game:move', (data) => {
    const gameId = gameBySocket.get(socket.id);
    if (!gameId) return;
    const game = gameById.get(gameId);
    if (!game) return;

    const [p1Id, p2Id]  = game.players;
    const partnerId      = socket.id === p1Id ? p2Id : p1Id;
    const partnerSocket  = io.sockets.sockets.get(partnerId);

    if (game.type === 'ttt') {
      const { index } = data;
      const { board, currentTurnSocketId } = game.state;
      if (currentTurnSocketId !== socket.id) return;
      if (board[index] !== null) return;

      const symbol    = socket.id === p1Id ? 'X' : 'O';
      board[index]    = symbol;
      const winResult = checkTTTWinner(board);
      const draw      = !winResult && board.every(Boolean);

      if (!winResult && !draw) game.state.currentTurnSocketId = partnerId;

      const update = {
        board,
        currentTurnSocketId: game.state.currentTurnSocketId,
        winnerSocketId: winResult ? socket.id : undefined,
        winLine:        winResult ? winResult.line : undefined,
        draw:           draw || undefined,
      };
      socket.emit('game:update', update);
      if (partnerSocket) partnerSocket.emit('game:update', update);
      if (winResult || draw) cleanupGame(game);

    } else if (game.type === 'rps') {
      if (game.state.choices[socket.id]) return;
      game.state.choices[socket.id] = data.choice;
      if (partnerSocket) partnerSocket.emit('game:update', { opponentChose: true });

      if (Object.keys(game.state.choices).length === 2) {
        const c1     = game.state.choices[p1Id];
        const c2     = game.state.choices[p2Id];
        const result = getRPSWinner(c1, c2);
        const winnerSocketId = result === 'draw' ? null : result === 'p1' ? p1Id : p2Id;
        const update = { choices: game.state.choices, winnerSocketId, draw: result === 'draw' };
        socket.emit('game:update', update);
        if (partnerSocket) partnerSocket.emit('game:update', update);
        cleanupGame(game);
      }

    } else if (game.type === 'math') {
      if (game.state.answered) return;
      if (data.answer === game.state.question.answer) {
        game.state.answered = true;
        const update = {
          winnerSocketId: socket.id,
          answer:   game.state.question.answer,
          question: game.state.question,
        };
        socket.emit('game:update', update);
        if (partnerSocket) partnerSocket.emit('game:update', update);
        cleanupGame(game);
      } else {
        socket.emit('game:update', { wrong: true });
      }
    }
  });

  socket.on('game:rematch', ({ gameType, toId }) => {
    const target = io.sockets.sockets.get(toId);
    if (!target) return;
    target.emit('game:invite', { gameType, fromId: socket.id, isRematch: true });
  });

  /* ── DISCONNECT ───────────────────────────────────────────────────────── */
  socket.on('disconnect', () => {
    if (waitingSocket?.id === socket.id) waitingSocket = null;
    disconnectPartner(socket, 'partnerLeft');
    cleanupGameForSocket(socket.id);
    broadcastOnlineCount();
  });

  /* ── helper: sever partnership ────────────────────────────────────────── */
  function disconnectPartner(sock, event) {
    const partner = sock.partner;
    if (!partner) return;
    sock.partner     = null;
    partner.partner  = null;
    partner.emit(event);
  }
});

/* ── Start ───────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅  GAICANI listening on :${PORT}`));
