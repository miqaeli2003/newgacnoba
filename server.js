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

// ── Constants ─────────────────────────────────────────────────────────────────
const TENOR_KEY          = process.env.TENOR_KEY || "LIVDSRZULELA";
const NAME_MIN           = 2;
const NAME_MAX           = 20;
const MSG_MAX            = 2000;
const RECONNECT_GRACE_MS = 4000;
const MAX_BLOCKS_RX      = 3;
const MAX_BLOCKS_TX      = 10;  // max users one socket can block per session
const MSG_RATE_MAX       = 20;
const MSG_RATE_WINDOW_MS = 5000;

const VALID_TAGS = new Set([
  "gaming","music","movies","books","sports",
  "tech","art","food","travel","memes",
]);
const VALID_EMOJIS = new Set(["❤️","😂","😢"]);
const BANNED_WORDS = new Set([]);

// ── Load facts & questions ────────────────────────────────────────────────────
function loadLines(filename) {
  try {
    return fs.readFileSync(path.join(__dirname, filename), "utf8")
      .split("\n").map(l => l.trim()).filter(Boolean);
  } catch { return []; }
}

let FACTS     = loadLines("facts.txt");
let QUESTIONS = loadLines("questions.txt");

function randomItem(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(compression());
app.use(express.static(path.join(__dirname)));

const gifHttpLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

app.get("/api/gifs", gifHttpLimiter, async (req, res) => {
  const q = (req.query.q || "").trim().slice(0, 100);
  const endpoint = q
    ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`
    : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Tenor HTTP ${response.status}`);
    const data = await response.json();
    res.set("Cache-Control", "public, max-age=300");
    res.json(data);
  } catch { res.status(502).json({ error: "Failed to fetch GIFs" }); }
});

app.get("/api/random-fact", (req, res) => {
  FACTS = loadLines("facts.txt");
  const fact = randomItem(FACTS);
  if (!fact) return res.status(404).json({ error: "No facts available" });
  res.json({ fact });
});

app.get("/api/random-question", (req, res) => {
  QUESTIONS = loadLines("questions.txt");
  const question = randomItem(QUESTIONS);
  if (!question) return res.status(404).json({ error: "No questions available" });
  res.json({ question });
});

// ── In-memory state ───────────────────────────────────────────────────────────
let waitingQueue         = [];
const activeUsernames    = new Set();
const pendingDisconnects = new Map();
const reportLog          = [];

// ── Game state ────────────────────────────────────────────────────────────────
const gameBySocket = new Map(); // socketId → gameId
const gameById     = new Map(); // gameId   → game object

// ── General helpers ───────────────────────────────────────────────────────────
function updateOnlineCount() { io.emit("onlineCount", io.sockets.sockets.size); }

function cleanQueue() {
  waitingQueue = waitingQueue.filter(s => s.connected && !s.partner && s.userName);
}

function countTagOverlap(a = [], b = []) {
  const setB = new Set(b);
  return a.filter(t => setB.has(t)).length;
}

function broadcastQueuePositions() {
  cleanQueue();
  waitingQueue.forEach((s, i) => s.emit("queuePosition", { position: i + 1, total: waitingQueue.length }));
}

function makeRateLimiter(max, windowMs) {
  return {
    check(socket) {
      const now = Date.now();
      if (!socket._rl || now > socket._rl.resetAt) socket._rl = { count: 0, resetAt: now + windowMs };
      return ++socket._rl.count <= max;
    },
  };
}
const msgRateLimiter = makeRateLimiter(MSG_RATE_MAX, MSG_RATE_WINDOW_MS);

function hasProfanity(text) {
  if (!BANNED_WORDS.size) return false;
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) if (lower.includes(word)) return true;
  return false;
}

// ── Link / URL detection ──────────────────────────────────────────────────────
const LINK_RE = /(?:https?:\/\/|ftp:\/\/|www\.|\bt\.me\/|telegram\.me\/)[\w\-._~:/?#[\]@!$&'()*+,;=%]+|[\w\-]+\.(?:com|net|org|ge|io|ru|tv|me|gg|co|uk|us|info|biz|xyz|online|site|app|dev|ai|edu|gov|mil|int|eu|de|fr|es|it|pl|ua|by|kz|am|az|tr)(?:[/?\s]|$)/gi;

// ── Game helpers ──────────────────────────────────────────────────────────────
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMathQuestion() {
  const ops = ["+", "-", "*"];
  const op  = ops[rand(0, 2)];
  let a, b, answer;
  if (op === "+")      { a = rand(1, 50);  b = rand(1, 50); answer = a + b; }
  else if (op === "-") { a = rand(10, 99); b = rand(1, a);  answer = a - b; }
  else                 { a = rand(2, 12);  b = rand(2, 12); answer = a * b; }
  const display = op === "*" ? `${a} \u00d7 ${b}` : `${a} ${op} ${b}`;
  return { display, answer };
}

function checkTTTWinner(board) {
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return { symbol: board[a], line: [a, b, c] };
  }
  return null;
}

function getRPSWinner(c1, c2) {
  if (c1 === c2) return "draw";
  if (
    (c1 === "rock"     && c2 === "scissors") ||
    (c1 === "scissors" && c2 === "paper")    ||
    (c1 === "paper"    && c2 === "rock")
  ) return "p1";
  return "p2";
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
  const partnerId = game.players.find(id => id !== socketId);
  const ps        = partnerId ? io.sockets.sockets.get(partnerId) : null;
  if (ps) ps.emit("game:partnerLeft");
  cleanupGame(game);
}

// ── Socket handlers ───────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.userName         = "";
  socket.partner          = null;
  socket.lastPartnerName  = "";
  socket.blockedNames     = [];   // blocked by username (survives name-changes poorly — kept for queue filter)
  socket.blockedIds       = new Set(); // blocked by socket ID (reliable within a session)
  socket.recentPartnerIds = new Set();
  socket.interests        = [];
  socket.bio              = "";
  socket.blockedByCount   = 0;
  socket._rl              = null;

  updateOnlineCount();

  // ── Username registration ────────────────────────────────────────────────
  socket.on("setName", (name) => {
    if (typeof name !== "string") return;
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return;

    if (socket.userName.toLowerCase() === trimmed.toLowerCase()) {
      socket.emit("nameAccepted", socket.userName);
      tryRestorePartnership(socket, trimmed.toLowerCase());
      return;
    }

    if (activeUsernames.has(trimmed.toLowerCase())) {
      if (pendingDisconnects.has(trimmed.toLowerCase())) {
        activeUsernames.delete(trimmed.toLowerCase());
      } else {
        socket.emit("nameTaken");
        return;
      }
    }

    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    socket.userName = trimmed;
    activeUsernames.add(trimmed.toLowerCase());
    socket.emit("nameAccepted", trimmed);
    tryRestorePartnership(socket, trimmed.toLowerCase());
  });

  function tryRestorePartnership(sock, nameLower) {
    if (!pendingDisconnects.has(nameLower)) return false;
    const { partner, timeout } = pendingDisconnects.get(nameLower);
    clearTimeout(timeout);
    pendingDisconnects.delete(nameLower);
    if (partner.connected && !partner.partner) {
      sock.partner    = partner;
      partner.partner = sock;
      sock.emit("partnerRestored",       { name: partner.userName });
      partner.emit("partnerReconnected", { name: sock.userName });
      return true;
    }
    return false;
  }

  // ── Bio ──────────────────────────────────────────────────────────────────
  socket.on("setBio", (bio) => {
    if (typeof bio !== "string") return;
    socket.bio = bio.slice(0, 60).replace(/<[^>]*>/g, "").trim();
  });

  // ── Interests ────────────────────────────────────────────────────────────
  socket.on("setInterests", (tags) => {
    if (!Array.isArray(tags)) return;
    socket.interests = tags.filter(t => typeof t === "string" && VALID_TAGS.has(t)).slice(0, 10);
  });

  // ── Matchmaking ──────────────────────────────────────────────────────────
  function tryFindPartner() {
    if (!socket.userName || socket.partner) return;
    cleanQueue();

    const candidates = waitingQueue.filter(s =>
      s.id !== socket.id &&
      !socket.recentPartnerIds.has(s.id) &&
      !s.recentPartnerIds.has(socket.id) &&
      !socket.blockedNames.includes(s.userName.toLowerCase()) &&
      !s.blockedNames.includes(socket.userName.toLowerCase()) &&
      !socket.blockedIds.has(s.id) &&
      !s.blockedIds.has(socket.id)
    );

    if (!candidates.length) {
      if (!waitingQueue.some(s => s.id === socket.id)) waitingQueue.push(socket);
      broadcastQueuePositions();
      return;
    }

    let best = candidates[0];
    let bestScore = countTagOverlap(socket.interests, best.interests);
    for (let i = 1; i < candidates.length; i++) {
      const score = countTagOverlap(socket.interests, candidates[i].interests);
      if (score > bestScore) { bestScore = score; best = candidates[i]; }
    }

    const partnerSocket = best;
    waitingQueue = waitingQueue.filter(s => s.id !== partnerSocket.id && s.id !== socket.id);

    socket.partner        = partnerSocket;
    partnerSocket.partner = socket;
    socket.lastPartnerName        = partnerSocket.userName;
    partnerSocket.lastPartnerName = socket.userName;

    const sharedTags = (socket.interests || []).filter(t => (partnerSocket.interests || []).includes(t));

    socket.emit("partnerFound",        { name: partnerSocket.userName, sharedTags, partnerBio: partnerSocket.bio });
    partnerSocket.emit("partnerFound", { name: socket.userName,        sharedTags, partnerBio: socket.bio });
    broadcastQueuePositions();
  }

  socket.on("findPartner", () => {
    if (!socket.userName || socket.partner) return;
    socket.lastPartnerName = "";
    tryFindPartner();
  });

  // ── Messaging ────────────────────────────────────────────────────────────
  socket.on("message", (msg) => {
    if (!socket.partner) return;
    if (!msgRateLimiter.check(socket)) return;

    let text = "", messageId = null, replyTo = null;
    if (typeof msg === "string") {
      text = msg;
    } else if (msg && typeof msg.text === "string") {
      text = msg.text;
      messageId = msg.messageId;
      if (msg.replyTo && typeof msg.replyTo.text === "string") {
        replyTo = {
          text:       msg.replyTo.text.slice(0, 100).replace(/<[^>]*>/g, "").trim(),
          senderName: String(msg.replyTo.senderName || "").slice(0, 30).replace(/<[^>]*>/g, "").trim(),
        };
      }
    }

    text = text.slice(0, MSG_MAX).replace(/<[^>]*>/g, "").trim();
    if (!text) return;
    if (hasProfanity(text)) { socket.emit("messageFlagged"); return; }
    if (LINK_RE.test(text)) {
      LINK_RE.lastIndex = 0;
      const kickedPartner = socket.partner;
      socket.emit("linkKicked");
      if (kickedPartner) kickedPartner.emit("partnerLinkKicked");
      socket.partner = null;
      if (kickedPartner) { kickedPartner.partner = null; kickedPartner.lastPartnerName = ""; }
      cleanupGameForSocket(socket.id);
      setTimeout(() => socket.disconnect(true), 1500);
      return;
    }
    LINK_RE.lastIndex = 0;
    socket.partner.emit("message", { text, messageId, replyTo });
  });

  // ── Question card ─────────────────────────────────────────────────────────
  socket.on("sendQuestion", ({ text }) => {
    if (!socket.partner || typeof text !== "string") return;
    const safeText = text.slice(0, 300).replace(/<[^>]*>/g, "").trim();
    if (!safeText) return;
    socket.partner.emit("partnerQuestion", { text: safeText, senderName: socket.userName });
  });

  // ── Seen indicator ───────────────────────────────────────────────────────
  socket.on("seen", ({ messageId }) => {
    if (socket.partner && messageId) socket.partner.emit("partnerSeen", { messageId });
  });

  // ── GIF ──────────────────────────────────────────────────────────────────
  socket.on("gif", (data) => {
    if (!socket.partner || typeof data?.url !== "string") return;
    if (!data.url.startsWith("https://media.tenor.com/")) return;
    socket.partner.emit("gif", { url: data.url, preview: data.preview });
  });

  // ── Reactions ────────────────────────────────────────────────────────────
  socket.on("react", ({ messageId, emoji }) => {
    if (!socket.partner || !messageId || !emoji) return;
    if (!VALID_EMOJIS.has(emoji)) return;
    socket.partner.emit("reacted", { messageId, emoji });
  });

  // ── Typing ───────────────────────────────────────────────────────────────
  socket.on("typing", (isTyping) => {
    if (socket.partner) socket.partner.emit("partnerTyping", Boolean(isTyping));
  });

  // ── Report ───────────────────────────────────────────────────────────────
  socket.on("reportUser", ({ reason }) => {
    if (!socket.partner) return;
    const entry = {
      reportedId:   socket.partner.id,
      reportedName: socket.partner.userName,
      reportedBy:   socket.userName,
      reason:       (reason || "").slice(0, 200),
      timestamp:    new Date().toISOString(),
    };
    reportLog.push(entry);
    console.log("REPORT:", JSON.stringify(entry));
    socket.emit("reportConfirmed");
  });

  // ── Next ─────────────────────────────────────────────────────────────────
  socket.on("next", () => {
    if (!socket.userName) return;

    if (socket.partner) {
      const oldPartner   = socket.partner;
      const oldPartnerId = oldPartner.id;

      socket.partner         = null;
      oldPartner.partner     = null;
      socket.lastPartnerName = "";
      oldPartner.emit("partnerDisconnected", { name: socket.userName });

      socket.recentPartnerIds.add(oldPartnerId);
      oldPartner.recentPartnerIds.add(socket.id);
      setTimeout(() => {
        socket.recentPartnerIds.delete(oldPartnerId);
        if (oldPartner.connected) oldPartner.recentPartnerIds.delete(socket.id);
      }, 5000);

      // Cancel any active game
      cleanupGameForSocket(socket.id);
    }

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    tryFindPartner();
  });

  socket.on("blockUser", () => {
    if (!socket.partner && !socket.lastPartnerName) return;

    // Enforce per-session block limit
    if (socket.blockedNames.length >= MAX_BLOCKS_TX) {
      socket.emit("blockLimitReached");
      return;
    }

    if (socket.partner) {
      const blockedName        = socket.partner.userName.toLowerCase();
      const blockedDisplayName = socket.partner.userName;
      const blockedSocket      = socket.partner;

      if (!socket.blockedNames.includes(blockedName)) socket.blockedNames.push(blockedName);
      socket.blockedIds.add(blockedSocket.id); // ID-based block — immune to name changes

      // Cancel any active game
      cleanupGameForSocket(socket.id);

      socket.partner                = null;
      blockedSocket.partner         = null;
      socket.lastPartnerName        = "";
      blockedSocket.lastPartnerName = "";
      blockedSocket.emit("youWereBlocked", { name: socket.userName });

      blockedSocket.blockedByCount = (blockedSocket.blockedByCount || 0) + 1;
      if (blockedSocket.blockedByCount >= MAX_BLOCKS_RX) {
        console.log(`Auto-kicking ${blockedSocket.userName}: blocked ${MAX_BLOCKS_RX}x`);
        blockedSocket.emit("autoKicked");
        blockedSocket.disconnect(true);
        return;
      }
      socket.emit("userBlocked", { name: blockedDisplayName });
    } else {
      const blockedName        = socket.lastPartnerName.toLowerCase();
      const blockedDisplayName = socket.lastPartnerName;
      if (!socket.blockedNames.includes(blockedName)) socket.blockedNames.push(blockedName);
      // Note: no socket ID available after partner left — name-only block for this case
      socket.lastPartnerName = "";
      socket.emit("userBlocked", { name: blockedDisplayName });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  MINI GAMES
  // ════════════════════════════════════════════════════════════════

  // Send game request to partner
  socket.on("game:request", ({ gameType }) => {
    if (!socket.partner) return;
    if (!["ttt", "rps", "math"].includes(gameType)) return;
    socket.partner.emit("game:invite", { gameType, fromId: socket.id });
  });

  // Accept or decline a game invite
  socket.on("game:response", ({ accepted, gameType, toId }) => {
    const requester = io.sockets.sockets.get(toId);
    if (!requester) return;

    if (!accepted) {
      requester.emit("game:declined");
      return;
    }

    const gameId  = `${toId}:${socket.id}`;
    const players = [toId, socket.id]; // [requester=X/p1, accepter=O/p2]
    let state;

    if (gameType === "ttt") {
      state = { board: Array(9).fill(null), currentTurnSocketId: toId };
    } else if (gameType === "rps") {
      state = { choices: {} };
    } else if (gameType === "math") {
      state = { question: generateMathQuestion(), answered: false };
    } else return;

    const game = { id: gameId, type: gameType, players, state };
    gameById.set(gameId, game);
    gameBySocket.set(toId,      gameId);
    gameBySocket.set(socket.id, gameId);

    const roles = { [toId]: "X", [socket.id]: "O" };
    players.forEach(pid => {
      const s = io.sockets.sockets.get(pid);
      if (s) s.emit("game:start", {
        gameId,
        gameType,
        role:       roles[pid] ?? null,
        opponentId: pid === toId ? socket.id : toId,
        state,
      });
    });
  });

  // Handle game moves
  socket.on("game:move", (data) => {
    const gameId = gameBySocket.get(socket.id);
    if (!gameId) return;
    const game = gameById.get(gameId);
    if (!game) return;

    const [p1Id, p2Id] = game.players;
    const partnerId    = socket.id === p1Id ? p2Id : p1Id;
    const partner      = io.sockets.sockets.get(partnerId);

    // ── Tic Tac Toe ──────────────────────────────────────────────
    if (game.type === "ttt") {
      const { index } = data;
      if (typeof index !== "number" || index < 0 || index > 8) return;
      const { board, currentTurnSocketId } = game.state;
      if (currentTurnSocketId !== socket.id) return;
      if (board[index] !== null) return;

      const symbol    = socket.id === p1Id ? "X" : "O";
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
      socket.emit("game:update", update);
      if (partner) partner.emit("game:update", update);
      if (winResult || draw) cleanupGame(game);

    // ── Rock Paper Scissors ───────────────────────────────────────
    } else if (game.type === "rps") {
      const { choice } = data;
      if (!["rock", "paper", "scissors"].includes(choice)) return;
      if (game.state.choices[socket.id]) return;
      game.state.choices[socket.id] = choice;

      if (partner) partner.emit("game:update", { opponentChose: true });

      if (Object.keys(game.state.choices).length === 2) {
        const c1     = game.state.choices[p1Id];
        const c2     = game.state.choices[p2Id];
        const result = getRPSWinner(c1, c2);
        const winnerSocketId = result === "draw" ? null : result === "p1" ? p1Id : p2Id;
        const update = { choices: game.state.choices, winnerSocketId, draw: result === "draw" };
        socket.emit("game:update", update);
        if (partner) partner.emit("game:update", update);
        cleanupGame(game);
      }

    // ── Math Duel ─────────────────────────────────────────────────
    } else if (game.type === "math") {
      if (game.state.answered) return;
      const submitted = parseInt(data.answer, 10);
      if (isNaN(submitted)) return;

      if (submitted === game.state.question.answer) {
        game.state.answered = true;
        const update = {
          winnerSocketId: socket.id,
          answer:         game.state.question.answer,
          question:       game.state.question,
        };
        socket.emit("game:update", update);
        if (partner) partner.emit("game:update", update);
        cleanupGame(game);
      } else {
        socket.emit("game:update", { wrong: true });
      }
    }
  });

  // Rematch request
  socket.on("game:rematch", ({ gameType, toId }) => {
    if (!["ttt", "rps", "math"].includes(gameType)) return;
    const target = io.sockets.sockets.get(toId);
    if (target) target.emit("game:invite", { gameType, fromId: socket.id, isRematch: true });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

    // Cancel any active game first
    cleanupGameForSocket(socket.id);

    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());

    if (socket.partner) {
      const partner   = socket.partner;
      const name      = socket.userName || "Anonymous";
      const nameLower = name.toLowerCase();

      socket.partner  = null;
      partner.partner = null;

      if (socket.userName) {
        partner.emit("partnerReconnecting", { name });
        const timeout = setTimeout(() => {
          pendingDisconnects.delete(nameLower);
          if (partner.connected) partner.emit("partnerDisconnected", { name });
        }, RECONNECT_GRACE_MS);
        pendingDisconnects.set(nameLower, { partner, timeout });
      } else {
        partner.emit("partnerDisconnected", { name: "Anonymous" });
      }
    }

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    updateOnlineCount();
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
