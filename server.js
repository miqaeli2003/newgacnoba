const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const path       = require("path");
const fs         = require("fs");
const compression   = require("compression");
const rateLimit     = require("express-rate-limit");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  pingTimeout:  20000,
  pingInterval: 25000,
});

// ── 1. Game Maps (Addition) ──────────────────────────────────────────────────
const gameBySocket = new Map();
const gameById     = new Map();

// ── Constants ─────────────────────────────────────────────────────────────────
const TENOR_KEY          = process.env.TENOR_KEY || "LIVDSRZULELA";
const NAME_MIN           = 2;
const NAME_MAX           = 20;
const MSG_MAX            = 2000;
const RECONNECT_GRACE_MS = 4000;
const MAX_BLOCKS_RX      = 3;
const MSG_RATE_MAX       = 20;
const MSG_RATE_WINDOW_MS = 5000;

const VALID_TAGS = new Set([
  "gaming","music","movies","books","sports",
  "tech","art","food","travel","memes",
]);
const VALID_EMOJIS = new Set(["❤️","😂","😢"]);
const BANNED_WORDS = new Set([]);

// ── 2. Helper Functions (Addition) ───────────────────────────────────────────
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function generateMathQuestion() { 
  const a = rand(1, 50), b = rand(1, 50);
  return { q: `${a} + ${b} = ?`, a: a + b }; 
}
function checkTTTWinner(board) { /* Tic-Tac-Toe logic here */ return null; }
function getRPSWinner(p1, p2) { /* Rock-Paper-Scissors logic here */ return 0; }
function cleanupGame(gameId) {
  const game = gameById.get(gameId);
  if (game) {
    gameBySocket.delete(game.p1);
    gameBySocket.delete(game.p2);
    gameById.delete(gameId);
  }
}
function cleanupGameForSocket(socketId) {
  const gameId = gameBySocket.get(socketId);
  if (gameId) {
    const game = gameById.get(gameId);
    if (game) {
      const other = (game.p1 === socketId) ? game.p2 : game.p1;
      const otherSock = io.sockets.sockets.get(other);
      if (otherSock) otherSock.emit("game:ended", { reason: "Partner left" });
      cleanupGame(gameId);
    }
  }
}

// ── File Loading ─────────────────────────────────────────────────────────────
function loadLines(filename) {
  try {
    const filePath = path.join(__dirname, filename);
    return fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
  } catch { return []; }
}
let FACTS = loadLines("facts.txt");
let QUESTIONS = loadLines("questions.txt");
function randomItem(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(compression());
app.use(express.static(path.join(__dirname)));

const gifHttpLimiter = rateLimit({ windowMs: 60_000, max: 120 });
app.get("/api/gifs", gifHttpLimiter, async (req, res) => {
  const q = (req.query.q || "").trim().slice(0, 100);
  const endpoint = q
    ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`
    : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`;
  try {
    const response = await fetch(endpoint);
    const data = await response.json();
    res.json(data);
  } catch { res.status(502).json({ error: "Failed to fetch GIFs" }); }
});

app.get("/api/random-fact", (req, res) => {
  FACTS = loadLines("facts.txt");
  const fact = randomItem(FACTS);
  fact ? res.json({ fact }) : res.status(404).json({ error: "No facts" });
});

app.get("/api/random-question", (req, res) => {
  QUESTIONS = loadLines("questions.txt");
  const question = randomItem(QUESTIONS);
  question ? res.json({ question }) : res.status(404).json({ error: "No questions" });
});

// ── Socket State ─────────────────────────────────────────────────────────────
let waitingQueue = [];
const activeUsernames = new Set();
const pendingDisconnects = new Map();
const reportLog = [];

function updateOnlineCount() { io.emit("onlineCount", io.sockets.sockets.size); }
function cleanQueue() { waitingQueue = waitingQueue.filter(s => s.connected && !s.partner && s.userName); }
function countTagOverlap(a = [], b = []) {
  const setB = new Set(b);
  return a.filter(t => setB.has(t)).length;
}
function broadcastQueuePositions() {
  cleanQueue();
  waitingQueue.forEach((s, i) => s.emit("queuePosition", { position: i + 1, total: waitingQueue.length }));
}
const msgRateLimiter = makeRateLimiter(MSG_RATE_MAX, MSG_RATE_WINDOW_MS);
function makeRateLimiter(max, windowMs) {
  return {
    check(socket) {
      const now = Date.now();
      if (!socket._rl || now > socket._rl.resetAt) socket._rl = { count: 0, resetAt: now + windowMs };
      return ++socket._rl.count <= max;
    },
  };
}
function hasProfanity(text) {
  if (!BANNED_WORDS.size) return false;
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) if (lower.includes(word)) return true;
  return false;
}

// ── Socket IO ─────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.userName = ""; socket.partner = null; socket.lastPartnerName = "";
  socket.blockedNames = []; socket.recentPartnerIds = new Set();
  socket.interests = []; socket.bio = ""; socket.blockedByCount = 0;
  updateOnlineCount();

  // ── 3. Game Socket Handlers (Addition) ─────────────────────────────────────
  socket.on('game:request', (data) => {
    if (socket.partner) socket.partner.emit('game:request', { type: data.type, from: socket.userName });
  });
  socket.on('game:response', (data) => {
    if (socket.partner) socket.partner.emit('game:response', data);
  });
  socket.on('game:move', (data) => {
    if (socket.partner) socket.partner.emit('game:move', data);
  });
  socket.on('game:rematch', (data) => {
    if (socket.partner) socket.partner.emit('game:rematch', data);
  });

  // ── Standard Handlers ─────────────────────────────────────────────────────
  socket.on("setName", (name) => {
    if (typeof name !== "string") return;
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return;
    if (activeUsernames.has(trimmed.toLowerCase()) && !pendingDisconnects.has(trimmed.toLowerCase())) {
      socket.emit("nameTaken"); return;
    }
    socket.userName = trimmed;
    activeUsernames.add(trimmed.toLowerCase());
    socket.emit("nameAccepted", trimmed);
  });

  socket.on("message", (msg) => {
    if (!socket.partner || !msgRateLimiter.check(socket)) return;
    let text = typeof msg === "string" ? msg : msg.text;
    text = text.slice(0, MSG_MAX).replace(/<[^>]*>/g, "").trim();
    if (!text || hasProfanity(text)) return;
    socket.partner.emit("message", { text, messageId: msg.messageId, replyTo: msg.replyTo });
  });

  socket.on("next", () => {
    if (!socket.userName) return;
    cleanupGameForSocket(socket.id); // Addition: Cleanup game on skip
    if (socket.partner) {
      const oldPartner = socket.partner;
      socket.partner = null;
      oldPartner.partner = null;
      oldPartner.emit("partnerDisconnected", { name: socket.userName });
    }
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    // matchmaking logic here...
  });

  socket.on("disconnect", () => {
    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    cleanupGameForSocket(socket.id); // Addition: Cleanup game on disconnect
    if (socket.partner) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName });
      socket.partner.partner = null;
    }
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    updateOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
