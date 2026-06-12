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
  pingTimeout:  120000, // 120 s — give mobile plenty of time
  pingInterval: 25000,
  // Allow both polling and websocket so mobile fallback works
  transports: ["websocket", "polling"],
});

// ── Constants ─────────────────────────────────────────────────────────────────
const TENOR_KEY          = process.env.TENOR_KEY || "LIVDSRZULELA";
const NAME_MIN           = 2;
const NAME_MAX           = 20;
const MSG_MAX            = 2000;
const RECONNECT_GRACE_MS = 1800000; // 30 min
const MAX_BLOCKS_RX      = 3;    // max blocks within the time window
const BLOCKS_RX_WINDOW_MS = 5 * 60 * 1000; // 5-minute sliding window
const MAX_BLOCKS_TX      = 10;  // max users one socket can block per session
const MSG_RATE_MAX       = 20;
const MSG_RATE_WINDOW_MS = 5000;

// ── Admin / Owner ─────────────────────────────────────────────────────────────
// All sensitive routes are locked to OWNER_IP only — no password needed.
const OWNER_IP  = "109.172.136.114";
const bannedIPs = new Set(); // persists for server lifetime

// ── Randomised secret route slugs ─────────────────────────────────────────────
// These replace every predictable /admin/* and old panel/stats paths.
const ROUTE = {
  panel:       "/x7k2mq9pn4w",  // visual admin panel  (users, ban/unban)
  stats:       "/r3tz8vj1qs6",  // stats dashboard HTML
  statsApi:    "/n5ph2ck7ew0",  // stats JSON API       (called by stats page)
  users:       "/b9wf4yd6ul3",  // list connected users JSON
  ban:         "/m2xg7rn0ks5",  // POST ban an IP
  unban:       "/q6jd1vc8zt4",  // POST unban an IP
  bans:        "/a4hs3oe9lp7",  // list banned IPs JSON
  reported:    "/f8nb5wx2cr1",  // list report-banned IPs JSON
  visitorLog:  "/t1uy6im0dg8",  // visitor log HTML
  visitorJson: "/e3kp9af5qh2",  // visitor log JSON
};

// ── Sensitive-URL visitor log ─────────────────────────────────────────────────
const MAX_VISITOR_LOG = 2000;
const sensitiveVisitorLog = [];
// Each entry: { ip, url, timestamp, userAgent, allowed }

const SENSITIVE_URL_PATTERNS = Object.values(ROUTE);

function recordSensitiveVisit(req, allowed) {
  const ip = (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
  const entry = {
    ip,
    url: req.originalUrl || req.url,
    timestamp: new Date().toISOString(),
    userAgent: (req.headers["user-agent"] || "").slice(0, 200),
    allowed,
  };
  sensitiveVisitorLog.push(entry);
  // Keep log from growing unbounded
  if (sensitiveVisitorLog.length > MAX_VISITOR_LOG)
    sensitiveVisitorLog.splice(0, sensitiveVisitorLog.length - MAX_VISITOR_LOG);
  if (!allowed) {
    console.warn(`[SENSITIVE-URL] UNAUTHORIZED access attempt — IP: ${ip} → ${entry.url}`);
  } else {
    console.log(`[SENSITIVE-URL] Authorized access — IP: ${ip} → ${entry.url}`);
  }
}

// Middleware: log every request to sensitive URLs (runs before auth checks)
function sensitiveUrlLogger(req, res, next) {
  const path = req.path || "";
  const isSensitive = SENSITIVE_URL_PATTERNS.some(p => path.startsWith(p));
  if (!isSensitive) return next();

  const ip = (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
  const isAllowed = (ip === OWNER_IP);
  recordSensitiveVisit(req, isAllowed);
  next();
}

// Owner-only middleware — only the owner IP may access the visitor log endpoint
function ownerOnly(req, res, next) {
  const ip = (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
  if (ip !== OWNER_IP) {
    res.status(403).send("Forbidden");
    return;
  }
  next();
}

// ── Statistics tracking ───────────────────────────────────────────────────────
const stats = {
  // Rolling 7-day window — each entry: { date: "YYYY-MM-DD", ips: Set, sessions: 0, totalDurationMs: 0, chats: 0 }
  days: new Map(),   // "YYYY-MM-DD" → { ips: Set, sessions, totalDurationMs, chats }
  allTimeIPs: new Set(),
  peakOnline: 0,
  peakOnlineAt: null,
  serverStartedAt: Date.now(),
};

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getOrCreateDay(key) {
  if (!stats.days.has(key)) {
    stats.days.set(key, { ips: new Set(), sessions: 0, totalDurationMs: 0, chats: 0 });
    // Keep only last 7 days
    const keys = [...stats.days.keys()].sort();
    while (keys.length > 7) { stats.days.delete(keys.shift()); keys.shift(); }
  }
  return stats.days.get(key);
}

function recordConnect(ip) {
  const day = getOrCreateDay(todayKey());
  day.ips.add(ip);
  day.sessions++;
  stats.allTimeIPs.add(ip);
  const current = io ? io.sockets.sockets.size : 0;
  if (current > stats.peakOnline) { stats.peakOnline = current; stats.peakOnlineAt = new Date().toISOString(); }
}

function recordDisconnect(ip, connectedAtMs) {
  if (!connectedAtMs) return;
  const durMs = Date.now() - connectedAtMs;
  const day = getOrCreateDay(todayKey());
  day.totalDurationMs += durMs;
}

function recordChatStarted() {
  getOrCreateDay(todayKey()).chats++;
}

// ── Link-strike system ────────────────────────────────────────────────────────
// 2 violations → 24-hour auto-ban
const LINK_BAN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const linkStrikes = new Map(); // ip → { count, bannedUntil }

function recordLinkStrike(ip) {
  // If we can't identify the IP reliably, just warn — never perma-ban unknowns
  if (!ip || ip === 'unknown' || ip === '::1' || ip === '127.0.0.1') return 'warning';
  const now   = Date.now();
  const entry = linkStrikes.get(ip) || { count: 0, bannedUntil: null };
  if (entry.bannedUntil && now < entry.bannedUntil) return 'banned'; // already banned
  entry.count++;
  if (entry.count >= 2) {
    entry.bannedUntil = now + LINK_BAN_DURATION_MS;
    console.warn(`[LINK-BAN] IP ${ip} auto-banned 24h after ${entry.count} violations`);
    linkStrikes.set(ip, entry);
    return 'banned';
  } else {
    console.warn(`[LINK-STRIKE] IP ${ip} — strike ${entry.count}/2`);
    linkStrikes.set(ip, entry);
    return 'warning';
  }
}

function isLinkBanned(ip) {
  const entry = linkStrikes.get(ip);
  if (!entry || !entry.bannedUntil) return false;
  if (Date.now() >= entry.bannedUntil) { linkStrikes.delete(ip); return false; }
  return true;
}

// Clean expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of linkStrikes)
    if (!entry.bannedUntil || now >= entry.bannedUntil) linkStrikes.delete(ip);
  for (const [ip, entry] of reportStrikes) {
    const expired = entry.bannedUntil && now >= entry.bannedUntil;
    const windowExpired = !entry.bannedUntil && entry.firstReportAt && (now - entry.firstReportAt) >= REPORT_BAN_DURATION_MS;
    if (expired || windowExpired) reportStrikes.delete(ip);
  }
}, 60 * 60 * 1000);

// ── Report-strike system ──────────────────────────────────────────────────────
// 5 reports from different sessions → 24-hour auto-ban; resets after 24h if not reached
const REPORT_BAN_DURATION_MS = 24 * 60 * 60 * 1000;
const REPORT_THRESHOLD       = 5;
const reportStrikes = new Map(); // ip → { count, bannedUntil, reporters: Set, firstReportAt }

function recordReport(reporterSocketId, targetIP) {
  if (!targetIP || targetIP === 'unknown') return false;
  const now   = Date.now();
  let entry   = reportStrikes.get(targetIP) || { count: 0, bannedUntil: null, reporters: new Set(), firstReportAt: null };
  if (entry.bannedUntil && now < entry.bannedUntil) return true; // already banned
  // After 24h without hitting threshold, reset count to 3 (not 0) — history still matters
  if (entry.firstReportAt && (now - entry.firstReportAt) >= REPORT_BAN_DURATION_MS) {
    const resetTo = Math.min(entry.count, 3);
    console.warn(`[REPORT-RESET] IP ${targetIP} — 24h passed, resetting ${entry.count} → ${resetTo} reports`);
    entry = { count: resetTo, bannedUntil: null, reporters: new Set(), firstReportAt: resetTo > 0 ? now : null };
  }
  // One report per socket id to prevent spam
  if (entry.reporters.has(reporterSocketId)) return false;
  entry.reporters.add(reporterSocketId);
  entry.count++;
  if (entry.count === 1) entry.firstReportAt = now; // start the 24h window
  if (entry.count >= REPORT_THRESHOLD) {
    entry.bannedUntil = now + REPORT_BAN_DURATION_MS;
    console.warn(`[REPORT-BAN] IP ${targetIP} auto-banned 24h after ${entry.count} reports`);
    reportStrikes.set(targetIP, entry);
    return true; // just got banned
  }
  console.warn(`[REPORT] IP ${targetIP} — ${entry.count}/${REPORT_THRESHOLD} reports`);
  reportStrikes.set(targetIP, entry);
  return false;
}

function isReportBanned(ip) {
  const entry = reportStrikes.get(ip);
  if (!entry || !entry.bannedUntil) return false;
  if (Date.now() >= entry.bannedUntil) { reportStrikes.delete(ip); return false; }
  return true;
}

const VALID_TAGS = new Set([
  "gaming","music","movies","books","sports",
  "tech","art","food","travel","memes",
]);
const VALID_EMOJIS = new Set(["❤️","😂","😢"]);
const BANNED_WORDS = new Set([
  // common spam/commercial phrases (lower-case, partial match)
 
]);

// ── Blocked phrases — messages containing these are silently dropped ──────────
const BLOCKED_PHRASES = [
  "Nuciko77",
  "NucikО77"
  
];

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
app.use(sensitiveUrlLogger); // log admin/stats visits BEFORE auth gates
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

// GET <users route>  — list all connected users with IPs
app.get(ROUTE.users, ownerOnly, (req, res) => {
  const users = [];
  for (const [, socket] of io.sockets.sockets) {
    users.push({
      id:        socket.id,
      name:      socket.userName || "(no name)",
      ip:        socket.clientIP || "unknown",
      partner:   socket.partner ? socket.partner.userName : null,
      connected: socket.connected,
    });
  }
  users.sort((a, b) => (b.partner ? 1 : 0) - (a.partner ? 1 : 0));
  res.json({ count: users.length, users });
});

// POST <ban route>?ip=1.2.3.4  — ban an IP and kick all matching sockets
app.post(ROUTE.ban, ownerOnly, (req, res) => {
  const ip = (req.query.ip || "").trim();
  if (!ip) return res.status(400).json({ error: "ip param required" });

  bannedIPs.add(ip);
  let kicked = 0;
  for (const [, socket] of io.sockets.sockets) {
    if (socket.clientIP === ip) {
      socket.emit("autoKicked");
      setTimeout(() => socket.disconnect(true), 500);
      kicked++;
    }
  }
  console.log(`[ADMIN] Banned IP ${ip} — kicked ${kicked} socket(s)`);
  res.json({ ok: true, ip, kicked });
});

// POST <unban route>?ip=1.2.3.4  — remove an IP ban
app.post(ROUTE.unban, ownerOnly, (req, res) => {
  const ip = (req.query.ip || "").trim();
  if (!ip) return res.status(400).json({ error: "ip param required" });
  const existed = bannedIPs.delete(ip);
  res.json({ ok: true, ip, wasBanned: existed });
});

// GET <bans route>  — list all currently banned IPs
app.get(ROUTE.bans, ownerOnly, (req, res) => {
  res.json({ count: bannedIPs.size, ips: [...bannedIPs] });
});

// GET <reported route>  — list IPs that hit 5 reports within 24h window
app.get(ROUTE.reported, ownerOnly, (req, res) => {
  const now = Date.now();
  const result = [];
  for (const [ip, entry] of reportStrikes) {
    if (!entry.bannedUntil) continue;
    if (now >= entry.bannedUntil) continue;
    const remainingMs  = entry.bannedUntil - now;
    const remainingHrs = Math.ceil(remainingMs / (60 * 60 * 1000));
    result.push({ ip, count: entry.count, remainingHrs });
  }
  res.json({ count: result.length, reported: result });
});

// GET <panel route>  — visual admin panel (IP-only, no key)
app.get(ROUTE.panel, ownerOnly, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin Panel</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e1f22;color:#dcddde;font-family:"Segoe UI",Arial,sans-serif;padding:24px}
h1{color:#fff;font-size:1.4em;margin-bottom:20px}
h2{color:#5865f2;font-size:1em;margin:24px 0 10px;text-transform:uppercase;letter-spacing:.5px}
.card{background:#2b2d31;border-radius:10px;padding:16px;margin-bottom:12px}
.ip{font-family:monospace;color:#fff;font-size:1em}
.ban-btn{background:#f23f42;color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:.85em;float:right;margin-top:-2px}
.ban-btn:hover{background:#c0393b}
.unban-btn{background:#3ba55d;color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:.85em}
.unban-btn:hover{background:#2d8a4e}
.badge{display:inline-block;background:rgba(88,101,242,.2);color:#5865f2;border-radius:4px;font-size:.75em;padding:2px 7px;margin-left:6px}
.badge.green{background:rgba(59,165,93,.2);color:#3ba55d}
.refresh-btn{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:.85em;margin-bottom:16px}
.refresh-btn:hover{background:#4752c4}
.section{margin-bottom:32px}
#status{color:#3ba55d;font-size:.85em;margin-left:10px;display:inline}
table{width:100%;border-collapse:collapse}
td,th{padding:8px 10px;text-align:left;font-size:.85em}
th{color:#72767d;font-weight:600;border-bottom:1px solid #1a1b1e}
tr:hover td{background:rgba(255,255,255,.03)}
</style>
</head>
<body>
<h1>🛡️ Admin Panel</h1>
<button class="refresh-btn" onclick="loadAll()">↻ Refresh</button><span id="status"></span>

<div class="section">
  <h2>Connected Users</h2>
  <div id="users">Loading...</div>
</div>

<div class="section">
  <h2>🚩 Reported IPs (5+ reports, active ban)</h2>
  <div id="reported">Loading...</div>
</div>

<div class="section">
  <h2>Banned IPs</h2>
  <div id="bans">Loading...</div>
</div>

<script>
const R = ${JSON.stringify(ROUTE)};

async function api(method, url) {
  const r = await fetch(url, { method });
  return r.json();
}

async function banIP(ip) {
  if (!confirm("Ban IP: " + ip + "?")) return;
  const d = await api("POST", R.ban + "?ip=" + encodeURIComponent(ip));
  setStatus("✅ Banned " + ip + " — " + (d.kicked || 0) + " kicked");
  loadAll();
}

async function unbanIP(ip) {
  await api("POST", R.unban + "?ip=" + encodeURIComponent(ip));
  setStatus("✅ Unbanned " + ip);
  loadAll();
}

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  setTimeout(() => el.textContent = "", 3000);
}

async function loadAll() {
  try {
    const d = await api("GET", R.users);
    const el = document.getElementById("users");
    if (!d.users || !d.users.length) { el.innerHTML = '<p style="color:#72767d;font-size:.9em">No connected users</p>'; }
    else {
      el.innerHTML = '<table><tr><th>Name</th><th>IP</th><th>Status</th><th></th></tr>' +
        d.users.map(u => \`<tr>
          <td><span class="ip">\${esc(u.name)}</span></td>
          <td style="font-family:monospace;color:#b5bac1">\${esc(u.ip)}</td>
          <td>\${u.partner ? '<span class="badge green">chatting</span>' : '<span class="badge">waiting</span>'}</td>
          <td><button class="ban-btn" onclick="banIP('\${esc(u.ip)}')">Ban IP</button></td>
        </tr>\`).join("") + "</table>";
    }
  } catch(e) { document.getElementById("users").textContent = "Error"; }

  try {
    const d = await api("GET", R.reported);
    const el = document.getElementById("reported");
    if (!d.reported || !d.reported.length) { el.innerHTML = '<p style="color:#72767d;font-size:.9em">No reported IPs right now</p>'; }
    else {
      el.innerHTML = '<table><tr><th>IP</th><th>Reports</th><th>Ban expires in</th><th></th></tr>' +
        d.reported.map(r => \`<tr>
          <td style="font-family:monospace;color:#fff">\${esc(r.ip)}</td>
          <td><span style="color:#f23f42;font-weight:700">\${r.count}</span></td>
          <td style="color:#72767d">\${r.remainingHrs}h</td>
          <td><button class="ban-btn" onclick="banIP('\${esc(r.ip)}')">Ban IP</button></td>
        </tr>\`).join("") + "</table>";
    }
  } catch(e) { document.getElementById("reported").textContent = "Error"; }

  try {
    const d = await api("GET", R.bans);
    const el = document.getElementById("bans");
    if (!d.ips || !d.ips.length) { el.innerHTML = '<p style="color:#72767d;font-size:.9em">No banned IPs</p>'; }
    else {
      el.innerHTML = d.ips.map(ip => \`<div class="card">
        <span class="ip">\${esc(ip)}</span>
        <button class="unban-btn" onclick="unbanIP('\${esc(ip)}')" style="float:right">Unban</button>
      </div>\`).join("");
    }
  } catch(e) { document.getElementById("bans").textContent = "Error"; }
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

loadAll();
setInterval(loadAll, 15000);
</script>
</body>
</html>`);
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
  waitingQueue = waitingQueue.filter(s =>
    s.connected &&
    !s.partner &&
    s.userName &&
    !s._isGhost   // exclude ghost sockets that are mid-reconnect
  );
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
// IMPORTANT: Never use a single shared /g-flag RegExp for .test() — the global
// flag keeps lastIndex between calls, so every other call returns a wrong result.
// We create a fresh RegExp each time via containsLink() to avoid this entirely.
const _LINK_RE_SRC = String.raw`(?:https?:\/\/|ftp:\/\/|www\.|\bt\.me\/|telegram\.me\/)[\w\-._~:/?#[\]@!$&'()*+,;=%]+|[\w\-]+\.(?:com|net|org|ge|io|ru|tv|me|gg|co|uk|us|info|biz|xyz|online|site|app|dev|ai|edu|gov|mil|int|eu|de|fr|es|it|pl|ua|by|kz|am|az|tr)(?:[/?\s]|$)`;
function containsLink(text) { return new RegExp(_LINK_RE_SRC, 'i').test(text); }
// Backwards-compat alias (no longer used with .test() directly)
const LINK_RE = { test: containsLink, lastIndex: 0 };

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
  // ── Capture real IP (works behind proxies like nginx/Render/Railway) ────────
  const rawIP =
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    socket.handshake.address ||
    "unknown";
  socket.clientIP = rawIP;

  // ── Drop banned IPs immediately ─────────────────────────────────────────────
  if (bannedIPs.has(rawIP) || isLinkBanned(rawIP) || isReportBanned(rawIP)) {
    socket.emit("autoKicked");
    setTimeout(() => socket.disconnect(true), 500);
    return;
  }

  console.log("User connected", socket.id, rawIP);
  socket._connectedAt = Date.now();
  recordConnect(rawIP);

  socket.userName           = "";
  socket.partner            = null;
  socket.lastPartnerName    = "";
  socket.lastPartnerIP      = "";   // stored so report works after partner leaves
  socket.lastPartnerSocketId = "";  // stored for dedup in reportStrikes
  socket.hasReportedLast    = false; // one report per partner
  socket.blockedNames       = [];
  socket.blockedIds         = new Set();
  socket.recentPartnerIds = new Set();
  socket.interests        = [];
  socket.bio              = "";
  socket.blockedByTimes   = []; // timestamps of recent blocks received
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

    const lowerTrimmed = trimmed.toLowerCase();

    // Allow reclaiming a name that is pending reconnect (user's own name during grace period)
    if (activeUsernames.has(lowerTrimmed)) {
      if (pendingDisconnects.has(lowerTrimmed)) {
        // This is the user reconnecting with their own name — allowed
        // (activeUsernames will be re-confirmed inside tryRestorePartnership)
      } else {
        socket.emit("nameTaken");
        return;
      }
    }

    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    socket.userName = trimmed;
    activeUsernames.add(lowerTrimmed);
    socket.emit("nameAccepted", trimmed);
    tryRestorePartnership(socket, lowerTrimmed);
  });

  function tryRestorePartnership(sock, nameLower) {
    if (!pendingDisconnects.has(nameLower)) return false;
    const { partner, timeout, ghostSocket } = pendingDisconnects.get(nameLower);
    clearTimeout(timeout);
    pendingDisconnects.delete(nameLower);
    activeUsernames.add(nameLower);
    const partnerAvailable = partner.connected &&
      (!partner.partner || partner.partner === ghostSocket || partner.partner === sock);
    if (partnerAvailable) {
      sock._isGhost    = false;
      sock.partner     = partner;
      partner.partner  = sock;
      ghostSocket.partner = null;   // clear stale partner ref on the ghost so it can't be reused
      // Flush queued messages from staying user (stored on the ghost socket)
      const queue = ghostSocket._messageQueue || [];
      ghostSocket._messageQueue = [];
      queue.forEach(m => sock.emit("message", m));
      sock.emit("partnerRestored",       { name: partner.userName });
      partner.emit("partnerReconnected", { name: sock.userName });
      // Reset repeat-detection ring for the restored session
      sock.lastMessages    = []; sock.spamStrikes    = 0;
      partner.lastMessages = []; partner.spamStrikes = 0;
      // Reset chatStartedAt on both sides so the anti-bot speed gate doesn't
      // lock out the reconnecting user (their timer was reset to 0 on connect)
      const now = Date.now();
      sock.chatStartedAt    = now;
      partner.chatStartedAt = now;
      sock.hasTyped         = false;
      partner.hasTyped      = false;
      // Clear recentPartnerIds between these two so they can be re-matched if
      // both press Next — otherwise the IDs linger and cause permanent exclusion
      sock.recentPartnerIds.delete(partner.id);
      partner.recentPartnerIds.delete(sock.id);
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

    // Double-check partner is still free — race condition guard
    // (partner could disconnect or get matched between cleanQueue() and now)
    if (!partnerSocket.connected || partnerSocket.partner || partnerSocket._isGhost) {
      if (!waitingQueue.some(s => s.id === socket.id)) waitingQueue.push(socket);
      broadcastQueuePositions();
      return;
    }

    waitingQueue = waitingQueue.filter(s => s.id !== partnerSocket.id && s.id !== socket.id);

    socket.partner        = partnerSocket;
    partnerSocket.partner = socket;
    socket.lastPartnerName        = partnerSocket.userName;
    partnerSocket.lastPartnerName = socket.userName;
    socket.lastPartnerIP           = partnerSocket.clientIP || "";
    partnerSocket.lastPartnerIP    = socket.clientIP || "";
    socket.lastPartnerSocketId     = partnerSocket.id;
    partnerSocket.lastPartnerSocketId = socket.id;
    socket.hasReportedLast         = false;
    partnerSocket.hasReportedLast  = false;

    const sharedTags = (socket.interests || []).filter(t => (partnerSocket.interests || []).includes(t));

    socket.emit("partnerFound",        { name: partnerSocket.userName, sharedTags, partnerBio: partnerSocket.bio });
    recordChatStarted();
    partnerSocket.emit("partnerFound", { name: socket.userName,        sharedTags, partnerBio: socket.bio });

    // ── Reset anti-bot state for both users ────────────────────────────────
    const now = Date.now();
    socket.hasTyped        = false;  socket.chatStartedAt = now;
    socket.lastMessages    = [];     socket.spamStrikes   = 0;
    partnerSocket.hasTyped = false;  partnerSocket.chatStartedAt = now;
    partnerSocket.lastMessages = []; partnerSocket.spamStrikes   = 0;
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
    // Typing gate: soft check only — do not kick real users for this
    // (paste, mobile autocomplete, reconnect can all skip the typing event)
    socket.hasTyped = false; // reset for next message

    // Speed gate removed — causes false drops on reconnect

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

    // ── Blocked-phrase filter — exact match → permanent IP ban + kick ────────────
    if (BLOCKED_PHRASES.some(p => text.includes(p))) {
      console.warn(`[PHRASE-BAN] "${text.slice(0,80)}" matched blocked phrase — banning ${socket.clientIP}`);
      bannedIPs.add(socket.clientIP);
      const bp = socket.partner;
      if (bp) {
        bp.partner = null;
        bp.emit("partnerDisconnected", { name: socket.userName });
      }
      socket.partner = null;
      cleanupGameForSocket(socket.id);
      socket.emit("autoKicked");
      setTimeout(() => socket.disconnect(true), 500);
      return;
    }

    // ── @ mention kick ────────────────────────────────────────────────────
    if (/(?:^|\s)@\s*\w/.test(text)) {
      console.warn(`[BOT-AT] @ mention message — ${socket.userName}: ${text.slice(0, 60)}`);
      const strikeResult1 = recordLinkStrike(socket.clientIP);
      if (strikeResult1 === 'warning') {
        // First offence — warn but don't kick
        socket.emit("linkWarning");
        return;
      }
      // Second offence — ban and kick
      const kickedPartner = socket.partner;
      socket.emit("linkBanned");
      if (kickedPartner) {
        kickedPartner.emit("partnerLinkKicked");
        kickedPartner.partner        = null;
        kickedPartner.lastPartnerName = "";
      }
      socket.partner = null;
      cleanupGameForSocket(socket.id);
      setTimeout(() => socket.disconnect(true), 1500);
      return;
    }

    if (containsLink(text)) {
      const strikeResult2 = recordLinkStrike(socket.clientIP);
      if (strikeResult2 === 'warning') {
        socket.emit("linkWarning");
        return;
      }
      const kickedPartner2 = socket.partner;
      socket.emit("linkBanned");
      if (kickedPartner2) kickedPartner2.emit("partnerLinkKicked");
      socket.partner = null;
      if (kickedPartner2) { kickedPartner2.partner = null; kickedPartner2.lastPartnerName = ""; }
      cleanupGameForSocket(socket.id);
      setTimeout(() => socket.disconnect(true), 1500);
      return;
    }
    if (!socket.partner) return; // partner left
    if (socket.partner._isGhost) {
      socket.partner._messageQueue = socket.partner._messageQueue || [];
      socket.partner._messageQueue.push({ text, messageId, replyTo });
    } else {
      socket.partner.emit("message", { text, messageId, replyTo });
    }
  });

  // ── Question card ─────────────────────────────────────────────────────────
  socket.on("sendQuestion", ({ text }) => {
    if (!socket.partner || typeof text !== "string") return;
    if (socket.partner._isGhost) return; // partner is mid-reconnect, skip
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
    if (socket.partner._isGhost) return; // partner mid-reconnect
    socket.partner.emit("gif", { url: data.url, preview: data.preview });
  });

  // ── PHOTO ─────────────────────────────────────────────────────────────────
  socket.on("photo", (data) => {
    if (!socket.partner || typeof data?.dataUrl !== "string") return;
    if (socket.partner._isGhost) return;
    // Validate it's a real image data URL and not too large (~3MB base64 ≈ 4MB string)
    if (!data.dataUrl.startsWith("data:image/")) return;
    if (data.dataUrl.length > 4 * 1024 * 1024) return;
    socket.partner.emit("photo", { dataUrl: data.dataUrl });
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
    // Allow reporting both: current partner OR the partner who just left.
    // NOTE: blockUser (often emitted together) clears lastPartnerName first but
    // keeps lastPartnerIP alive for 2s, so we can still look up the target.
    const targetIP         = socket.partner ? socket.partner.clientIP : socket.lastPartnerIP;
    const targetSocketId   = socket.partner ? socket.partner.id       : socket.lastPartnerSocketId;
    const targetName       = socket.partner ? socket.partner.userName : (socket.lastPartnerName || socket._lastReportedName || "");

    if (!targetIP) return; // nothing to report

    // Prevent double-reporting the same partner
    if (socket.hasReportedLast) return;
    socket.hasReportedLast = true;
    // Remember name for the log even if blockUser cleared lastPartnerName already
    if (targetName) socket._lastReportedName = targetName;

    const entry = {
      reportedId:   targetSocketId,
      reportedName: targetName,
      reportedBy:   socket.userName,
      reporterIP:   socket.clientIP,
      targetIP,
      reason:       (reason || "").slice(0, 200),
      timestamp:    new Date().toISOString(),
    };
    reportLog.push(entry);
    console.log("REPORT:", JSON.stringify(entry));

    const justBanned = recordReport(socket.id, targetIP);
    if (justBanned) {
      // Kick the reported partner if still connected
      const target = socket.partner || (targetSocketId ? io.sockets.sockets.get(targetSocketId) : null);
      if (target && target.connected) {
        target.emit("reportBanned");
        if (target.partner) { target.partner.partner = null; }
        target.partner = null;
        if (socket.partner && socket.partner.id === target.id) socket.partner = null;
        cleanupGameForSocket(target.id);
        setTimeout(() => target.disconnect(true), 1500);
      }
    }
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
      oldPartner.lastPartnerName  = "";   // prevent stale block target on the skipped side
      oldPartner.emit("partnerDisconnected", { name: socket.userName });

      socket.recentPartnerIds.add(oldPartnerId);
      oldPartner.recentPartnerIds.add(socket.id);
      setTimeout(() => {
        socket.recentPartnerIds.delete(oldPartnerId);
        if (oldPartner.connected) oldPartner.recentPartnerIds.delete(socket.id);
        // After cooldown, re-queue both sockets if still waiting — fixes small-pool deadlock
        if (socket.connected && !socket.partner && socket.userName) {
          if (!waitingQueue.some(s => s.id === socket.id)) waitingQueue.push(socket);
          broadcastQueuePositions();
        }
        // oldPartner was left — do NOT auto-queue them; they must press Next themselves
      }, 5000);

    // Cancel any active game for both sides
      cleanupGameForSocket(socket.id);
      cleanupGameForSocket(oldPartnerId);
    }

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    tryFindPartner();
  });

  socket.on("blockUser", (data) => {
    // Treat a ghost partner (mid-reconnect grace) the same as "partner already left"
    if (socket.partner && socket.partner._isGhost) {
      const ghostName = socket.partner.userName || "";
      const nameLower = ghostName.toLowerCase();
      if (pendingDisconnects.has(nameLower)) {
        const { timeout } = pendingDisconnects.get(nameLower);
        clearTimeout(timeout);
        pendingDisconnects.delete(nameLower);
        activeUsernames.delete(nameLower);
      }
      socket.partner.partner = null;
      socket.partner         = null;
      if (ghostName && !socket.lastPartnerName) socket.lastPartnerName = ghostName;
    }

    // Fallback: client sends the name it saw — use it if server lost it
    if (!socket.partner && !socket.lastPartnerName && data && data.targetName) {
      socket.lastPartnerName = String(data.targetName).trim();
    }

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

      // Time-windowed block counter — only count blocks within the last 5 minutes.
      // Bots get blocked rapidly in succession; real users don't hit this threshold.
      const now5 = Date.now();
      blockedSocket.blockedByTimes.push(now5);
      blockedSocket.blockedByTimes = blockedSocket.blockedByTimes.filter(
        t => now5 - t < BLOCKS_RX_WINDOW_MS
      );
      if (blockedSocket.blockedByTimes.length >= MAX_BLOCKS_RX) {
        console.log(`Auto-kicking ${blockedSocket.userName}: blocked ${MAX_BLOCKS_RX}x within 5 min`);
        blockedSocket.emit("autoKicked");
        blockedSocket.disconnect(true);
        // Still notify the blocker so the client redirects them to a new search
        socket.emit("userBlocked", { name: blockedDisplayName });
        return;
      }
      socket.emit("userBlocked", { name: blockedDisplayName });
    } else {
      const blockedName        = socket.lastPartnerName.toLowerCase();
      const blockedDisplayName = socket.lastPartnerName;
      if (!socket.blockedNames.includes(blockedName)) socket.blockedNames.push(blockedName);
      // Clear the name immediately so a double-click doesn't re-block.
      // Keep IP/socketId alive for 2s so a concurrent reportUser (sent in
      // the same button click) can still look up the target.
      socket.lastPartnerName = "";
      setTimeout(() => {
        socket.lastPartnerIP       = "";
        socket.lastPartnerSocketId = "";
      }, 2000);
      socket.emit("userBlocked", { name: blockedDisplayName });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  MINI GAMES
  // ════════════════════════════════════════════════════════════════

  // Send game request to partner
  socket.on("game:request", ({ gameType }) => {
    if (!socket.partner) return;
    if (socket.partner._isGhost) return; // partner mid-reconnect, can't start game
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

    // If partner is a ghost (mid-reconnect) we can't relay moves — end the game
    if (!partner || partner._isGhost) {
      socket.emit("game:partnerLeft");
      cleanupGame(game);
      return;
    }

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
    if (target && !target._isGhost) target.emit("game:invite", { gameType, fromId: socket.id, isRematch: true });
  });

  // Tab-away events disabled — no action taken when user hides browser tab

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
    recordDisconnect(socket.clientIP, socket._connectedAt);

    cleanupGameForSocket(socket.id);

    if (socket.partner) {
      const partner   = socket.partner;
      const name      = socket.userName || "Anonymous";
      const nameLower = name.toLowerCase();

      socket.partner       = null;
      socket._isGhost      = true;
      socket._messageQueue = [];

      // Immediately notify the staying partner so they see the disconnect
      // message and can block right away. We clear partner.partner now so
      // blockUser falls cleanly into the name-only block path.
      partner.lastPartnerName = name;
      partner.lastPartnerIP   = socket.clientIP || "";
      partner.lastPartnerSocketId = socket.id;
      partner.hasReportedLast = false;
      partner.partner         = null;
      if (partner.connected) partner.emit("partnerDisconnected", { name });

      if (socket.userName) {
        const timeout = setTimeout(() => {
          pendingDisconnects.delete(nameLower);
          activeUsernames.delete(nameLower);
        }, RECONNECT_GRACE_MS);
        pendingDisconnects.set(nameLower, { partner, timeout, ghostSocket: socket });
      } else {
        // Anonymous user — no reconnect grace needed
      }
    } else {
      if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    }

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    updateOnlineCount();
  });
});

// ── Stats API ────────────────────────────────────────────────────────────────
app.get(ROUTE.statsApi, ownerOnly, (req, res) => {
  const now = Date.now();
  const uptimeSec = Math.floor((now - stats.serverStartedAt) / 1000);
  const days = [];
  const sortedKeys = [...stats.days.keys()].sort();
  for (const dk of sortedKeys) {
    const d = stats.days.get(dk);
    const avgDurSec = d.sessions > 0 ? Math.round(d.totalDurationMs / d.sessions / 1000) : 0;
    days.push({ date: dk, uniqueIPs: d.ips.size, sessions: d.sessions, avgSessionSec: avgDurSec, chats: d.chats });
  }
  res.json({
    currentOnline: io.sockets.sockets.size,
    peakOnline: stats.peakOnline,
    peakOnlineAt: stats.peakOnlineAt,
    allTimeUniqueIPs: stats.allTimeIPs.size,
    uptimeSec,
    days,
  });
});


// GET <stats route> — stats dashboard (IP-only, no key)
app.get(ROUTE.stats, ownerOnly, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{background:#1e1f22;color:#dcddde;font-family:Segoe UI,Arial,sans-serif;padding:24px;max-width:900px;margin:0 auto}",
    "h1{color:#fff;font-size:1.4em;margin-bottom:6px}",
    ".sub{color:#72767d;font-size:.82em;margin-bottom:24px}",
    "h2{color:#5865f2;font-size:.9em;margin:28px 0 12px;text-transform:uppercase;letter-spacing:.5px}",
    ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:8px}",
    ".sc{background:#2b2d31;border-radius:10px;padding:16px 18px}",
    ".sv{font-size:1.8em;font-weight:700;color:#fff;line-height:1.1}",
    ".sv.g{color:#3ba55d}.sv.y{color:#faa61a}",
    ".sl{font-size:.75em;color:#72767d;margin-top:4px}",
    "table{width:100%;border-collapse:collapse;background:#2b2d31;border-radius:10px;overflow:hidden}",
    "th{background:#232428;color:#72767d;font-size:.78em;font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid #1a1b1e}",
    "td{padding:10px 14px;font-size:.85em;border-bottom:1px solid #1e1f22}",
    "tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}",
    ".bw{background:#1e1f22;border-radius:4px;height:8px;width:100%;margin-top:4px}",
    ".b{height:8px;border-radius:4px;background:#5865f2;min-width:2px;transition:width .4s}",
    ".b.g{background:#3ba55d}",
    ".rb{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:.85em}",
    ".rb:hover{background:#4752c4}",
    "#lu{color:#72767d;font-size:.78em;margin-left:10px}"
  ].join("");

  const STATS_API = ROUTE.statsApi;
  const JS =
    "function fmt(s){if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m '+(s%60)+'s';return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m';}" +
    "function pct(v,m){return m?Math.round(v/m*100):0;}" +
    "function esc(s){return String(s).replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'})[c];});}" +
    "async function load(){try{" +
    "var r=await fetch('" + STATS_API + "');" +
    "var d=await r.json();" +
    "document.getElementById('now').innerHTML=" +
    "  '<div class=\"sc\"><div class=\"sv g\">'+d.currentOnline+'</div><div class=\"sl\">Online now</div></div>'" +
    "  +'<div class=\"sc\"><div class=\"sv y\">'+d.peakOnline+'</div><div class=\"sl\">Peak online</div></div>';" +
    "document.getElementById('alltime').innerHTML=" +
    "  '<div class=\"sc\"><div class=\"sv\">'+d.allTimeUniqueIPs+'</div><div class=\"sl\">Unique IPs (all time)</div></div>'" +
    "  +'<div class=\"sc\"><div class=\"sv\">'+fmt(d.uptimeSec)+'</div><div class=\"sl\">Server uptime</div></div>';" +
    "if(!d.days||!d.days.length){document.getElementById('daily').innerHTML='<p style=\"color:#72767d;padding:12px 0\">No data yet</p>';return;}" +
    "var mi=Math.max.apply(null,d.days.map(function(x){return x.uniqueIPs;}),1);" +
    "var ms=Math.max.apply(null,d.days.map(function(x){return x.sessions;}),1);" +
    "var mc=Math.max.apply(null,d.days.map(function(x){return x.chats;}),1);" +
    "mi=mi||1;ms=ms||1;mc=mc||1;" +
    "var rows='<table><tr><th>Date</th><th>Unique IPs</th><th>Sessions</th><th>Chats started</th><th>Avg session</th></tr>';" +
    "[].concat(d.days).reverse().forEach(function(row){" +
    "  rows+='<tr><td style=\"color:#fff;font-weight:600\">'+esc(row.date)+'</td>'" +
    "    +'<td>'+row.uniqueIPs+'<div class=\"bw\"><div class=\"b\" style=\"width:'+pct(row.uniqueIPs,mi)+'%\"></div></div></td>'" +
    "    +'<td>'+row.sessions+'<div class=\"bw\"><div class=\"b\" style=\"width:'+pct(row.sessions,ms)+'%\"></div></div></td>'" +
    "    +'<td>'+row.chats+'<div class=\"bw\"><div class=\"b g\" style=\"width:'+pct(row.chats,mc)+'%\"></div></div></td>'" +
    "    +'<td style=\"color:#b5bac1\">'+fmt(row.avgSessionSec)+'</td></tr>';" +
    "});" +
    "rows+='</table>';" +
    "document.getElementById('daily').innerHTML=rows;" +
    "document.getElementById('lu').textContent='Updated '+new Date().toLocaleTimeString();" +
    "}catch(e){console.error(e);}}" +
    "load();setInterval(load,20000);";

  const html = "<!DOCTYPE html><html lang=\"en\"><head>" +
    "<meta charset=\"UTF-8\"/>" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>" +
    "<title>GAICANI Stats</title>" +
    "<style>" + CSS + "</style>" +
    "</head><body>" +
    "<h1>&#128202; GAICANI Statistics</h1>" +
    "<p class=\"sub\">Resets on server restart &middot; Last 7 days shown</p>" +
    "<button class=\"rb\" onclick=\"load()\">&#8635; Refresh</button><span id=\"lu\"></span>" +
    "<h2>Right Now</h2><div class=\"grid\" id=\"now\">Loading...</div>" +
    "<h2>All Time (since last restart)</h2><div class=\"grid\" id=\"alltime\">Loading...</div>" +
    "<h2>Daily Breakdown</h2><div id=\"daily\">Loading...</div>" +
    "<script>" + JS + "<\/script>" +
    "</body></html>";

  res.send(html);
});

// ── Sensitive-URL visitor log — owner eyes only ───────────────────────────────
app.get(ROUTE.visitorLog, ownerOnly, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

  const rows = [...sensitiveVisitorLog].reverse().map(e => {
    const cls = e.allowed ? "ok" : "bad";
    return `<tr class="${cls}">
      <td>${esc(e.timestamp)}</td>
      <td class="ip">${esc(e.ip)}</td>
      <td>${esc(e.url)}</td>
      <td>${e.allowed ? "✅ owner" : "🚫 denied"}</td>
      <td class="ua">${esc(e.userAgent)}</td>
    </tr>`;
  }).join("");

  const uniqueIPs = [...new Set(sensitiveVisitorLog.map(e => e.ip))];
  const denied    = sensitiveVisitorLog.filter(e => !e.allowed);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sensitive URL Visitor Log — GAICANI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e1f22;color:#dcddde;font-family:"Segoe UI",Arial,sans-serif;padding:24px}
h1{color:#fff;font-size:1.4em;margin-bottom:4px}
.sub{color:#72767d;font-size:.82em;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:28px}
.sc{background:#2b2d31;border-radius:10px;padding:16px 18px}
.sv{font-size:1.8em;font-weight:700;color:#fff;line-height:1.1}
.sv.r{color:#f23f42}.sv.g{color:#3ba55d}
.sl{font-size:.75em;color:#72767d;margin-top:4px}
h2{color:#5865f2;font-size:.9em;margin:24px 0 12px;text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;background:#2b2d31;border-radius:10px;overflow:hidden;font-size:.82em}
th{background:#232428;color:#72767d;font-weight:600;padding:10px 12px;text-align:left;border-bottom:1px solid #1a1b1e}
td{padding:8px 12px;border-bottom:1px solid #1e1f22;vertical-align:top}
tr:last-child td{border-bottom:none}
tr.bad td{background:rgba(242,63,66,.07)}
tr.ok td{background:rgba(59,165,93,.04)}
.ip{font-family:monospace;color:#fff;font-weight:600}
.ua{color:#72767d;font-size:.78em;max-width:280px;word-break:break-all}
.ip-list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.ip-tag{background:#2b2d31;border:1px solid #3a3c40;border-radius:6px;padding:4px 10px;font-family:monospace;font-size:.82em;color:#b5bac1}
.ip-tag.bad{border-color:rgba(242,63,66,.5);color:#f23f42}
button{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:.85em;margin-bottom:20px}
button:hover{background:#4752c4}
</style>
</head>
<body>
<h1>🔍 Sensitive URL Visitor Log</h1>
<p class="sub">All IPs that hit admin / stats URLs — only visible to you (${esc(OWNER_IP)})</p>
<button onclick="location.reload()">↻ Refresh</button>

<div class="grid">
  <div class="sc"><div class="sv">${sensitiveVisitorLog.length}</div><div class="sl">Total requests logged</div></div>
  <div class="sc"><div class="sv">${uniqueIPs.length}</div><div class="sl">Unique IPs seen</div></div>
  <div class="sc"><div class="sv r">${denied.length}</div><div class="sl">Denied (non-owner) attempts</div></div>
  <div class="sc"><div class="sv g">${sensitiveVisitorLog.length - denied.length}</div><div class="sl">Owner accesses</div></div>
</div>

<h2>All unique IPs that visited</h2>
<div class="ip-list">
  ${uniqueIPs.map(ip => {
    const hasDenied = denied.some(e => e.ip === ip);
    return `<span class="ip-tag${hasDenied ? " bad" : ""}">${esc(ip)}</span>`;
  }).join("")}
</div>

<h2>Full request log (newest first — max ${MAX_VISITOR_LOG})</h2>
<table>
  <tr>
    <th>Time (UTC)</th>
    <th>IP</th>
    <th>URL</th>
    <th>Status</th>
    <th>User-Agent</th>
  </tr>
  ${rows || '<tr><td colspan="5" style="color:#72767d;padding:16px">No visits recorded yet.</td></tr>'}
</table>
</body>
</html>`);
});

// JSON version of the same log (for scripting)
app.get(ROUTE.visitorJson, ownerOnly, (req, res) => {
  const unique = [...new Set(sensitiveVisitorLog.map(e => e.ip))];
  res.json({
    total: sensitiveVisitorLog.length,
    uniqueIPs: unique,
    deniedCount: sensitiveVisitorLog.filter(e => !e.allowed).length,
    entries: [...sensitiveVisitorLog].reverse(),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
