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
// Store your real Tenor key in a TENOR_KEY environment variable for production.
const TENOR_KEY          = process.env.TENOR_KEY || "LIVDSRZULELA";
const NAME_MIN           = 2;
const NAME_MAX           = 20;
const MSG_MAX            = 2000;
const RECONNECT_GRACE_MS = 4000;  // ms before partner is told you disconnected
const MAX_BLOCKS_RX      = 3;     // auto-kick after being blocked this many times
const MSG_RATE_MAX       = 20;    // max messages…
const MSG_RATE_WINDOW_MS = 5000;  // …per 5 s

const VALID_TAGS = new Set([
  "gaming","music","movies","books","sports",
  "tech","art","food","travel","memes",
]);
const VALID_EMOJIS = new Set(["❤️","😂","😢"]);

// Add words to this Set to enable the profanity filter.
const BANNED_WORDS = new Set([]);

// ── Load facts & questions from txt files ─────────────────────────────────────
function loadLines(filename) {
  try {
    const filePath = path.join(__dirname, filename);
    return fs.readFileSync(filePath, "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
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

// ── GIF Proxy — keeps the Tenor API key off the client ───────────────────────
const gifHttpLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/gifs", gifHttpLimiter, async (req, res) => {
  const q = (req.query.q || "").trim().slice(0, 100);
  const endpoint = q
    ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`
    : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Tenor HTTP ${response.status}`);
    const data = await response.json();
    res.set("Cache-Control", "public, max-age=300"); // browser caches 5 min
    res.json(data);
  } catch {
    res.status(502).json({ error: "Failed to fetch GIFs" });
  }
});

// ── Random Fact API ───────────────────────────────────────────────────────────
app.get("/api/random-fact", (req, res) => {
  // Reload file on each request so you can update facts.txt without restart
  FACTS = loadLines("facts.txt");
  const fact = randomItem(FACTS);
  if (!fact) return res.status(404).json({ error: "No facts available" });
  res.json({ fact });
});

// ── Random Question API ───────────────────────────────────────────────────────
app.get("/api/random-question", (req, res) => {
  QUESTIONS = loadLines("questions.txt");
  const question = randomItem(QUESTIONS);
  if (!question) return res.status(404).json({ error: "No questions available" });
  res.json({ question });
});

// ── In-memory state ───────────────────────────────────────────────────────────
let waitingQueue     = [];
const activeUsernames    = new Set();
const pendingDisconnects = new Map(); // nameLower → { partner, timeout }
const reportLog          = [];        // append-only; persist to DB in production

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateOnlineCount() {
  io.emit("onlineCount", io.sockets.sockets.size);
}

function cleanQueue() {
  waitingQueue = waitingQueue.filter(s => s.connected && !s.partner && s.userName);
}

function countTagOverlap(a = [], b = []) {
  const setB = new Set(b);
  return a.filter(t => setB.has(t)).length;
}

function broadcastQueuePositions() {
  cleanQueue();
  waitingQueue.forEach((s, i) =>
    s.emit("queuePosition", { position: i + 1, total: waitingQueue.length })
  );
}

function makeRateLimiter(max, windowMs) {
  return {
    check(socket) {
      const now = Date.now();
      if (!socket._rl || now > socket._rl.resetAt) {
        socket._rl = { count: 0, resetAt: now + windowMs };
      }
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

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.userName         = "";
  socket.partner          = null;
  socket.lastPartnerName  = "";   // remember last partner for post-disconnect block
  socket.blockedNames     = [];
  socket.recentPartnerIds = new Set();
  socket.interests        = [];
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
        // The old socket for this name just dropped — let it be reclaimed
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
      !s.blockedNames.includes(socket.userName.toLowerCase())
    );

    if (!candidates.length) {
      if (!waitingQueue.some(s => s.id === socket.id)) waitingQueue.push(socket);
      broadcastQueuePositions();
      return;
    }

    // Prefer candidate with most shared interests; fall back to first available
    let best = candidates[0];
    let bestScore = countTagOverlap(socket.interests, best.interests);
    for (let i = 1; i < candidates.length; i++) {
      const score = countTagOverlap(socket.interests, candidates[i].interests);
      if (score > bestScore) { bestScore = score; best = candidates[i]; }
    }

    const partnerSocket = best;
    waitingQueue = waitingQueue.filter(
      s => s.id !== partnerSocket.id && s.id !== socket.id
    );

    socket.partner        = partnerSocket;
    partnerSocket.partner = socket;
    socket.lastPartnerName        = partnerSocket.userName;
    partnerSocket.lastPartnerName = socket.userName;

    const sharedTags = (socket.interests || []).filter(t =>
      (partnerSocket.interests || []).includes(t)
    );

    socket.emit("partnerFound",        { name: partnerSocket.userName, sharedTags });
    partnerSocket.emit("partnerFound", { name: socket.userName,        sharedTags });
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
    if (!msgRateLimiter.check(socket)) return; // silently drop if rate exceeded

    let text = "", messageId = null, replyTo = null;
    if (typeof msg === "string") {
      text = msg;
    } else if (msg && typeof msg.text === "string") {
      text = msg.text;
      messageId = msg.messageId;
      // Validate and sanitise the replyTo payload
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

    socket.partner.emit("message", { text, messageId, replyTo });
  });

  // ── Question card ─────────────────────────────────────────────────────────
  socket.on("sendQuestion", ({ text }) => {
    if (!socket.partner || typeof text !== "string") return;
    const safeText = text.slice(0, 300).replace(/<[^>]*>/g, "").trim();
    if (!safeText) return;
    // Relay the question card to the partner (sender already displayed it)
    socket.partner.emit("partnerQuestion", { text: safeText, senderName: socket.userName });
  });

  // ── Seen indicator ───────────────────────────────────────────────────────
  socket.on("seen", ({ messageId }) => {
    if (socket.partner && messageId) {
      socket.partner.emit("partnerSeen", { messageId });
    }
  });

  // ── GIF ──────────────────────────────────────────────────────────────────
  socket.on("gif", (data) => {
    if (!socket.partner || typeof data?.url !== "string") return;
    if (!data.url.startsWith("https://media.tenor.com/")) return; // Tenor CDN only
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

      socket.partner              = null;
      oldPartner.partner          = null;
      socket.lastPartnerName      = "";
      // Keep oldPartner.lastPartnerName so they can still block the user who just left
      oldPartner.emit("partnerDisconnected", { name: socket.userName });

      socket.recentPartnerIds.add(oldPartnerId);
      oldPartner.recentPartnerIds.add(socket.id);
      setTimeout(() => {
        socket.recentPartnerIds.delete(oldPartnerId);
        if (oldPartner.connected) oldPartner.recentPartnerIds.delete(socket.id);
      }, 5000);
    }

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    tryFindPartner();
  });

  // ── Block ────────────────────────────────────────────────────────────────
  socket.on("blockUser", () => {
    // Allow blocking an active partner OR one who just disconnected
    if (!socket.partner && !socket.lastPartnerName) return;

    if (socket.partner) {
      // Partner still connected — normal block flow
      const blockedName        = socket.partner.userName.toLowerCase();
      const blockedDisplayName = socket.partner.userName;
      const blockedSocket      = socket.partner;

      if (!socket.blockedNames.includes(blockedName)) socket.blockedNames.push(blockedName);

      socket.partner              = null;
      blockedSocket.partner       = null;
      socket.lastPartnerName      = "";
      blockedSocket.lastPartnerName = "";
      blockedSocket.emit("partnerDisconnected", { name: socket.userName });

      blockedSocket.blockedByCount = (blockedSocket.blockedByCount || 0) + 1;
      if (blockedSocket.blockedByCount >= MAX_BLOCKS_RX) {
        console.log(`Auto-kicking ${blockedSocket.userName}: blocked ${MAX_BLOCKS_RX}x`);
        blockedSocket.emit("autoKicked");
        blockedSocket.disconnect(true);
        return;
      }

      socket.emit("userBlocked", { name: blockedDisplayName });
    } else {
      // Partner already left — just add their name to blocked list
      const blockedName        = socket.lastPartnerName.toLowerCase();
      const blockedDisplayName = socket.lastPartnerName;
      if (!socket.blockedNames.includes(blockedName)) socket.blockedNames.push(blockedName);
      socket.lastPartnerName = "";
      socket.emit("userBlocked", { name: blockedDisplayName });
    }
    // Do NOT auto-search — client will call findPartner when user presses ძებნა
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());

    if (socket.partner) {
      const partner   = socket.partner;
      const name      = socket.userName || "Anonymous";
      const nameLower = name.toLowerCase();

      socket.partner  = null;
      partner.partner = null;

      if (socket.userName) {
        // Grace period: give user 4 s to reconnect before telling partner
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
