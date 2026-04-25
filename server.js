const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const path       = require("path");
const fs         = require("fs");
const compression   = require("compression");
const rateLimit     = require("express-rate-limit");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);


// ── GAME STORAGE ─────────────────────────────────────────────
const gameBySocket = new Map();
const gameById     = new Map();


// ── BASIC CONFIG ─────────────────────────────────────────────
app.use(compression());
app.use(express.static(path.join(__dirname)));


// ── GAME HELPERS ─────────────────────────────────────────────
function rand(n) {
  return Math.floor(Math.random() * n);
}

function generateMathQuestion() {
  const a = rand(10) + 1;
  const b = rand(10) + 1;

  return {
    question: `${a} + ${b} = ?`,
    answer: a + b
  };
}

function checkTTTWinner(board) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return board.every(Boolean) ? "draw" : null;
}

function getRPSWinner(a, b) {
  if (a === b) return "draw";

  if (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  ) return 1;

  return 2;
}

function cleanupGame(gameId) {
  const game = gameById.get(gameId);
  if (!game) return;

  gameBySocket.delete(game.p1);
  gameBySocket.delete(game.p2);
  gameById.delete(gameId);
}

function cleanupGameForSocket(socketId) {
  const gameId = gameBySocket.get(socketId);
  if (gameId) cleanupGame(gameId);
}


// ── SIMPLE MATCHMAKING ──────────────────────────────────────
let waiting = [];

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.partner = null;

  // ── MATCHMAKING ─────────────────────────────────────────
  socket.on("find", () => {
    if (socket.partner) return;

    const other = waiting.find(s => s.id !== socket.id);

    if (other) {
      waiting = waiting.filter(s => s.id !== other.id);

      socket.partner = other;
      other.partner  = socket;

      socket.emit("connected");
      other.emit("connected");
    } else {
      waiting.push(socket);
    }
  });


  // ── CHAT ────────────────────────────────────────────────
  socket.on("message", (msg) => {
    if (socket.partner) {
      socket.partner.emit("message", msg);
    }
  });


  // ── NEXT ────────────────────────────────────────────────
  socket.on("next", () => {
    cleanupGameForSocket(socket.id);

    if (socket.partner) {
      socket.partner.partner = null;
      socket.partner.emit("partnerLeft");
      socket.partner = null;
    }

    socket.emit("waiting");
  });


  // ── GAME REQUEST ────────────────────────────────────────
  socket.on("game:request", ({ type }) => {
    if (!socket.partner) return;
    socket.partner.emit("game:request", { type });
  });


  // ── GAME RESPONSE ───────────────────────────────────────
  socket.on("game:response", ({ accepted, type }) => {
    if (!accepted || !socket.partner) return;

    const gameId = socket.id + "_" + socket.partner.id;

    let game = {
      id: gameId,
      type,
      p1: socket.id,
      p2: socket.partner.id
    };

    // initialize game state
    if (type === "ttt") {
      game.board = Array(9).fill(null);
      game.turn = socket.id;
    }

    if (type === "math") {
      game.qa = generateMathQuestion();
    }

    if (type === "rps") {
      game.moves = {};
    }

    gameById.set(gameId, game);
    gameBySocket.set(socket.id, gameId);
    gameBySocket.set(socket.partner.id, gameId);

    io.to(socket.id).emit("game:start", game);
    io.to(socket.partner.id).emit("game:start", game);
  });


  // ── GAME MOVE ───────────────────────────────────────────
  socket.on("game:move", (data) => {
    const gameId = gameBySocket.get(socket.id);
    if (!gameId) return;

    const game = gameById.get(gameId);
    if (!game) return;

    const opponent = game.p1 === socket.id ? game.p2 : game.p1;

    // ── TIC TAC TOE ───────────────────────────────────
    if (game.type === "ttt") {
      if (game.turn !== socket.id) return;

      const i = data.index;
      if (game.board[i]) return;

      game.board[i] = socket.id === game.p1 ? "X" : "O";
      game.turn = opponent;

      const winner = checkTTTWinner(game.board);

      io.to(game.p1).emit("game:update", game);
      io.to(game.p2).emit("game:update", game);

      if (winner) {
        io.to(game.p1).emit("game:end", winner);
        io.to(game.p2).emit("game:end", winner);
        cleanupGame(gameId);
      }
    }

    // ── ROCK PAPER SCISSORS ──────────────────────────
    if (game.type === "rps") {
      game.moves[socket.id] = data.move;

      if (game.moves[game.p1] && game.moves[game.p2]) {
        const result = getRPSWinner(
          game.moves[game.p1],
          game.moves[game.p2]
        );

        io.to(game.p1).emit("game:end", result);
        io.to(game.p2).emit("game:end", result);

        cleanupGame(gameId);
      }
    }

    // ── MATH GAME ────────────────────────────────────
    if (game.type === "math") {
      if (data.answer == game.qa.answer) {
        io.to(socket.id).emit("game:end", "win");
        io.to(opponent).emit("game:end", "lose");
      } else {
        io.to(socket.id).emit("game:end", "lose");
        io.to(opponent).emit("game:end", "win");
      }

      cleanupGame(gameId);
    }
  });


  // ── REMATCH ───────────────────────────────────────────
  socket.on("game:rematch", () => {
    cleanupGameForSocket(socket.id);
  });


  // ── DISCONNECT ────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    cleanupGameForSocket(socket.id);

    if (socket.partner) {
      socket.partner.emit("partnerLeft");
      socket.partner.partner = null;
    }

    waiting = waiting.filter(s => s.id !== socket.id);
  });
});


// ── START SERVER ─────────────────────────────────────────
const PORT = 3000;
server.listen(PORT, () => {
  console.log("Server running on http://localhost:3000");
});
