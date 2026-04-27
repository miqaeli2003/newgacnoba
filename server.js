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
const RECONNECT_GRACE_MS = 60000; // 60 s — lets mobile users switch apps and return
const MAX_BLOCKS_RX      = 3;
const MAX_BLOCKS_TX      = 10;  // max users one socket can block per session
const MSG_RATE_MAX       = 20;
const MSG_RATE_WINDOW_MS = 5000;

const VALID_TAGS = new Set([
  "gaming","music","movies","books","sports",
  "tech","art","food","travel","memes",
]);
const VALID_EMOJIS = new Set(["❤️","😂","😢"]);
const BANNED_WORDS = new Set([
  // common spam/commercial phrases (lower-case, partial match)
  "subscribe", "subscribers", "telegram", "whatsapp", "viber",
  "onlyfans", "only fans", "follow me", "follow us",
  "join our", "join my", "join now", "click here", "click the link",
  "check out", "check my", "check our",
  "buy now", "buy here", "sale", "discount", "promo", "coupon",
  "free money", "earn money", "make money", "investment", "crypto",
  "casino", "betting", "gamble", "jackpot",
  "კარგი შემოსავალი", "გამოიმუშავე", "ჩვენი არხი", "ჩვენი ჯგუფი",
  "მოგვყვანი",
]);

// Phone number pattern — bots often drop numbers when links are blocked
const PHONE_RE = /(?:\+?[0-9]{1,3}[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?)[\d\s\-.]{6,}/g;

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

// ── Challenge Token + Proof-of-Work (anti-bot) ───────────────────────────────
// 1. Client fetches /api/challenge  → { token, nonce }
// 2. Client computes powAnswer = (nonce * 31 + nonce % 97)  [done in real browser JS]
// 3. Client sends { name, token, powAnswer } with setName
// 4. Server checks powAnswer matches — Selenium bots are blocked client-side
//    before they even reach this step (navigator.webdriver check in script.js)
const challengeTokens = new Map(); // token → { expiry, powAnswer }

setInterval(() => {
  const now = Date.now();
  for (const [t, v] of challengeTokens) if (now > v.expiry) challengeTokens.delete(t);
}, 60_000);

app.get("/api/challenge", (req, res) => {
  const token     = Math.random().toString(36).slice(2) +
                    Math.random().toString(36).slice(2) +
                    Math.random().toString(36).slice(2);
  const nonce     = Math.floor(Math.random() * 90000) + 10000; // 5-digit random
  const powAnswer = (nonce * 31 + nonce % 97);                 // expected client answer

  challengeTokens.set(token, { expiry: Date.now() + 5 * 60_000, powAnswer });
  res.json({ token, nonce });
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
  socket.blockedNames     = [];
  socket.blockedIds       = new Set();
  socket.recentPartnerIds = new Set();
  socket.interests        = [];
  socket.bio              = "";
  socket.blockedByCount   = 0;
  socket._rl              = null;
  // ── Anti-bot tracking ──────────────────────────────────────────────────────
  socket.verified         = false;   // passed challenge token
  socket.hasTyped         = false;   // fired typing event before sending
  socket.chatStartedAt    = 0;       // timestamp when current partner was found
  socket.lastMessages     = [];      // ring buffer — detect copy-paste spam
  socket.spamStrikes      = 0;       // repeated violations → kick

  updateOnlineCount();

  // ── Username registration ────────────────────────────────────────────────
  socket.on("setName", (data) => {
    // Accept either plain string (legacy) or { name, token, powAnswer } object
    let name, token, powAnswer, webdriver;
    if (typeof data === "string") {
      name  = data;
      token = null;
    } else if (data && typeof data === "object") {
      name      = data.name;
      token     = data.token;
      powAnswer = data.powAnswer;
      webdriver = data.webdriver; // client reports navigator.webdriver
    } else return;

    // ── Hard block: client self-reported as WebDriver ──────────────────────
    if (webdriver === true) {
      console.warn(`[BOT-WEBDRIVER] WebDriver flag detected — ${socket.id}`);
      socket.disconnect(true);
      return;
    }

    // ── Challenge token + proof-of-work check ─────────────────────────────
    if (!socket.verified) {
      const entry = token ? challengeTokens.get(token) : null;
      const tokenOk  = entry && Date.now() <= entry.expiry;
      const powOk    = tokenOk && (Number(powAnswer) === entry.powAnswer);

      if (!tokenOk || !powOk) {
        console.warn(`[BOT-TOKEN] Rejected — tokenOk=${tokenOk} powOk=${powOk} id=${socket.id}`);
        socket.emit("tokenInvalid");
        setTimeout(() => { if (!socket.verified) socket.disconnect(true); }, 5000);
        return;
      }
      challengeTokens.delete(token); // one-time use
      socket.verified = true;
    }

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

    // ── Reset anti-bot state for both users ────────────────────────────────
    const now = Date.now();
    socket.hasTyped      = false;  socket.chatStartedAt = now;
    partnerSocket.hasTyped = false; partnerSocket.chatStartedAt = now;
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

    // ── Anti-bot layer 1: typing gate ─────────────────────────────────────
    // Real users always trigger the 'input' event which emits typing:true.
    // Bots sending via socket.io-client skip this entirely.
    if (!socket.hasTyped) {
      console.warn(`[BOT-TYPING] No typing event before message — ${socket.userName}`);
      socket.spamStrikes++;
      if (socket.spamStrikes >= 2) {
        socket.emit("autoKicked");
        socket.disconnect(true);
      }
      return;
    }
    socket.hasTyped = false; // reset — must type again for next message

    // ── Anti-bot layer 2: minimum time gate ───────────────────────────────
    // Bots message within milliseconds of partner matching. Real users take
    // at least a second to read the partner name and start typing.
    const MIN_MSG_DELAY_MS = 1200;
    if (Date.now() - socket.chatStartedAt < MIN_MSG_DELAY_MS) {
      console.warn(`[BOT-SPEED] Message too fast after match — ${socket.userName}`);
      return; // silently drop — not worth striking, could be very fast human
    }

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

    // ── Anti-bot layer 3: phone number detection ──────────────────────────
    PHONE_RE.lastIndex = 0;
    if (PHONE_RE.test(text)) {
      console.warn(`[BOT-PHONE] Phone number in message — ${socket.userName}: ${text.slice(0,60)}`);
      socket.emit("messageFlagged");
      socket.spamStrikes++;
      if (socket.spamStrikes >= 2) { socket.emit("autoKicked"); socket.disconnect(true); }
      return;
    }

    // ── Anti-bot layer 4: copy-paste repetition detection ─────────────────
    // Bots send the same pre-written message to every matched partner.
    const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (socket.lastMessages.includes(normalised)) {
      console.warn(`[BOT-REPEAT] Repeated message — ${socket.userName}: ${normalised.slice(0,60)}`);
      socket.spamStrikes++;
      if (socket.spamStrikes >= 2) { socket.emit("autoKicked"); socket.disconnect(true); }
      return; // silently drop
    }
    socket.lastMessages.push(normalised);
    if (socket.lastMessages.length > 6) socket.lastMessages.shift(); // keep last 6

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
    if (isTyping) socket.hasTyped = true;   // ← anti-bot gate
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

  // ── Tab Away / Back (notify partner of tab visibility changes) ──────────────
  // Fired immediately when the client's tab is hidden or shown again.
  // Lets the partner display a live countdown without waiting for socket drop.
  socket.on("tabAway", () => {
    if (!socket.partner) return;
    socket.partner.emit("partnerTabAway");
  });

  socket.on("tabBack", () => {
    if (!socket.partner) return;
    socket.partner.emit("partnerTabBack");
  });

  // ── Tab Away Timeout ─────────────────────────────────────────────────────
  // Fired by the client after 60 s of the tab being hidden while in a chat.
  // The socket is still alive — we just cleanly end the pairing.
  socket.on("tabAwayTimeout", () => {
    if (!socket.partner) return;

    const partner = socket.partner;
    const name    = socket.userName || "Anonymous";

    // Cancel any active game first
    cleanupGameForSocket(socket.id);

    socket.partner         = null;
    partner.partner        = null;
    socket.lastPartnerName = "";
    partner.lastPartnerName = name;

    // Tell partner the chat ended (they can search for someone new)
    partner.emit("partnerDisconnected", { name });
    partner.lastPartnerName      = name;
    partner.canBlockDisconnected = true;

    // Tell the away user that their chat was ended due to being away
    socket.emit("awayTimeout");
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
