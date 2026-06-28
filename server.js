const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const path       = require("path");
const fs         = require("fs");
const crypto     = require("crypto");
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
// Block limits removed — both sending and receiving blocks are now unlimited
const MSG_RATE_MAX       = 20;
const MSG_RATE_WINDOW_MS = 5000;

// ── Admin / Owner ─────────────────────────────────────────────────────────────
// All sensitive routes are locked to OWNER_IP only — no password needed.
const OWNER_IPS = new Set(["109.172.136.114", "185.115.4.235"]);

// ── Persistent manual ban list ────────────────────────────────────────────────
// Manual bans (via admin panel) survive server restarts — stored in banned_ips.json
// Auto-bans (link-strike, report) are still in-memory only.
const BANNED_IPS_FILE = path.join(__dirname, "banned_ips.json");
const bannedIPs       = new Set();

function loadBannedIPs() {
  try {
    const arr = JSON.parse(fs.readFileSync(BANNED_IPS_FILE, "utf8"));
    if (Array.isArray(arr)) {
      arr.forEach(ip => bannedIPs.add(ip));
      console.log(`[BAN] Loaded ${arr.length} persistent manual ban(s) from disk`);
    }
  } catch { /* file doesn't exist yet — fine */ }
}

function saveBannedIPs() {
  try {
    fs.writeFileSync(BANNED_IPS_FILE, JSON.stringify([...bannedIPs], null, 2), "utf8");
  } catch (e) {
    console.error("[BAN] Failed to save banned_ips.json:", e.message);
  }
}

loadBannedIPs(); // restore bans immediately at startup

// ── VirusTotal integration ────────────────────────────────────────────────────
// server.js writes non-Georgian IPs to vt-queue.json for vt-checker.js to pick up.
// vt-checker.js writes confirmed malicious IPs to vt-bans.json.
// We watch that file and load new bans automatically — no restart needed.

const VT_QUEUE_FILE = path.join(__dirname, "vt-queue.json");
const VT_BANS_FILE  = path.join(__dirname, "vt-bans.json");
const VT_QUEUE_MAX  = 500;
const VT_THRESHOLD  = 3; // must match vt-checker.js

// IPs already queued this session (avoid duplicate queue entries)
const vtQueued = new Set();

// Load existing VT bans on startup
function loadVTBans() {
  try {
    const arr = JSON.parse(fs.readFileSync(VT_BANS_FILE, "utf8"));
    if (Array.isArray(arr)) {
      let added = 0;
      arr.forEach(ip => {
        if (!bannedIPs.has(ip)) {
          bannedIPs.add(ip);
          added++;
        }
      });
      if (added) {
        console.log(`[VT] Loaded ${added} new VT-ban(s) from disk`);
        saveBannedIPs(); // merge into banned_ips.json so bans survive restart
      }
    }
  } catch { /* file doesn't exist yet */ }
}

loadVTBans();

// Poll vt-bans.json every 5s — more reliable than fs.watch on Linux
// fs.watch can miss events or fire with null filename on some systems
let _vtBansLastMtime = 0;

function pollVTBans() {
  try {
    const stat = fs.statSync(VT_BANS_FILE);
    const mtime = stat.mtimeMs;
    if (mtime === _vtBansLastMtime) return; // file unchanged
    _vtBansLastMtime = mtime;

    const sizeBefore = bannedIPs.size;
    loadVTBans();
    const newBans = bannedIPs.size - sizeBefore;

    if (newBans > 0) {
      console.log(`[VT] Detected ${newBans} new VT-ban(s) — kicking live sockets`);
      // Kick any connected sockets that are now VT-banned
      for (const [, socket] of io.sockets.sockets) {
        if (bannedIPs.has(socket.clientIP)) {
          console.log(`[VT] Kicking VT-banned IP: ${socket.clientIP}`);
          socket.emit("autoKicked");
          setTimeout(() => socket.disconnect(true), 500);
        }
      }
    }
  } catch {
    // File doesn't exist yet — fine, keep polling
  }
}

setInterval(pollVTBans, 5000);

function enqueueForVT(ip) {
  if (vtQueued.has(ip)) return;       // already queued this session
  if (bannedIPs.has(ip)) return;      // already banned
  if (OWNER_IPS.has(ip)) return;      // never check owner IPs

  vtQueued.add(ip);

  try {
    let queue = [];
    try { queue = JSON.parse(fs.readFileSync(VT_QUEUE_FILE, "utf8")); } catch {}
    if (!Array.isArray(queue)) queue = [];
    if (!queue.includes(ip)) {
      queue.push(ip);
      // Cap queue size
      if (queue.length > VT_QUEUE_MAX) queue = queue.slice(-VT_QUEUE_MAX);
      fs.writeFileSync(VT_QUEUE_FILE, JSON.stringify(queue, null, 2), "utf8");
    }
  } catch (e) {
    console.error("[VT] Failed to write queue:", e.message);
  }
}

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
  unbanReported: "/g7zr4ce2mv9", // POST clear a report-ban (resets strike count)
  visitorLog:  "/t1uy6im0dg8",  // visitor log HTML
  visitorJson: "/e3kp9af5qh2",  // visitor log JSON
  vtLog:       "/v2qw5rn8jx1",  // VirusTotal scan log HTML
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
  const isAllowed = OWNER_IPS.has(ip);
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
  if (!OWNER_IPS.has(ip)) {
    res.status(403).send("Forbidden");
    return;
  }
  next();
}

// ── Statistics tracking ───────────────────────────────────────────────────────
const stats = {
  days: new Map(),        // "YYYY-MM-DD" → dayObj  (rolling 14 days)
  allTimeIPs: new Set(),
  peakOnline: 0,
  peakOnlineAt: null,
  serverStartedAt: Date.now(),
};

// dayObj shape:
//  {
//    ips:            Set<string>,   unique IPs
//    sessions:       number,        total connections
//    totalDurationMs:number,        sum of all session durations
//    chats:          number,        matched pairs
//    hours:          Array(24)      each slot: { ips: Set, sessions: number }
//    peakOnline:     number,        highest concurrent users this day
//    peakOnlineAt:   string|null,   ISO timestamp of that peak
//    newIPs:         Set<string>,   IPs never seen before this day
//  }

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreateDay(key) {
  if (!stats.days.has(key)) {
    const hours = Array.from({ length: 24 }, () => ({ ips: new Set(), sessions: 0 }));
    stats.days.set(key, {
      ips: new Set(), sessions: 0, totalDurationMs: 0,
      chats: 0, hours, peakOnline: 0, peakOnlineAt: null,
      newIPs: new Set(),
    });
    // Keep only last 14 days
    const keys = [...stats.days.keys()].sort();
    while (keys.length > 14) stats.days.delete(keys.shift());
  }
  return stats.days.get(key);
}

function recordConnect(ip) {
  const day = getOrCreateDay(todayKey());
  const hour = new Date().getUTCHours();

  day.ips.add(ip);
  day.sessions++;
  day.hours[hour].ips.add(ip);
  day.hours[hour].sessions++;

  // Track first-time IPs (never seen on any previous day)
  if (!stats.allTimeIPs.has(ip)) day.newIPs.add(ip);

  stats.allTimeIPs.add(ip);

  // Per-day peak
  const current = io ? io.sockets.sockets.size : 0;
  if (current > day.peakOnline) {
    day.peakOnline    = current;
    day.peakOnlineAt  = new Date().toISOString();
  }
  // All-time peak
  if (current > stats.peakOnline) {
    stats.peakOnline   = current;
    stats.peakOnlineAt = new Date().toISOString();
  }
}

function recordDisconnect(ip, connectedAtMs) {
  if (!connectedAtMs) return;
  const durMs = Date.now() - connectedAtMs;
  getOrCreateDay(todayKey()).totalDurationMs += durMs;
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

function recordReport(reporterSocketId, targetIP, reason, reporterName) {
  if (!targetIP || targetIP === 'unknown') return false;
  const now   = Date.now();
  let entry   = reportStrikes.get(targetIP) || { count: 0, bannedUntil: null, reporters: new Set(), firstReportAt: null, reasons: [] };
  if (entry.bannedUntil && now < entry.bannedUntil) return true; // already banned
  // After 24h without hitting threshold, reset count to 3 (not 0) — history still matters
  if (entry.firstReportAt && (now - entry.firstReportAt) >= REPORT_BAN_DURATION_MS) {
    const resetTo = Math.min(entry.count, 3);
    console.warn(`[REPORT-RESET] IP ${targetIP} — 24h passed, resetting ${entry.count} → ${resetTo} reports`);
    entry = { count: resetTo, bannedUntil: null, reporters: new Set(), firstReportAt: resetTo > 0 ? now : null, reasons: entry.reasons.slice(-resetTo) };
  }
  // One report per socket id to prevent spam
  if (entry.reporters.has(reporterSocketId)) return false;
  entry.reporters.add(reporterSocketId);
  entry.count++;
  if (entry.count === 1) entry.firstReportAt = now; // start the 24h window
  entry.reasons.push({
    reason:   (reason || "").trim().slice(0, 200) || "(no reason provided)",
    by:       reporterName || "unknown",
    timestamp: new Date().toISOString(),
  });
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

function clearReportBan(ip) {
  return reportStrikes.delete(ip);
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

// ── Captcha / Geo gate ───────────────────────────────────────────────────────
// Non-Georgian IPs must solve a simple math captcha before accessing the site.
// Georgian IPs (country code "GE") pass straight through.
// Once solved, a signed cookie is set — valid 30 days, no re-challenge needed.

const CAPTCHA_SECRET  = process.env.CAPTCHA_SECRET || crypto.randomBytes(32).toString("hex");
const CAPTCHA_COOKIE  = "gc_pass";
const CAPTCHA_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// Geo cache — avoid hammering ip-api.com (free tier: 45 req/min)
// ip → { country: "GE"|other, ts: Date.now() }
const geoCache = new Map();
const GEO_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Pending captcha challenges — ip → { a, b, answer, expires }
const captchaChallenges = new Map();
const CAPTCHA_TTL = 10 * 60 * 1000; // 10 minutes to solve

// Clean expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, c] of captchaChallenges)
    if (now > c.expires) captchaChallenges.delete(ip);
  for (const [ip, c] of geoCache)
    if (now - c.ts > GEO_CACHE_TTL) geoCache.delete(ip);
}, 5 * 60 * 1000);

function makeCaptchaToken(ip) {
  const payload = ip + ":" + Date.now();
  const sig = crypto.createHmac("sha256", CAPTCHA_SECRET).update(payload).digest("hex");
  return Buffer.from(payload + "." + sig).toString("base64url");
}

function verifyCaptchaToken(ip, token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const dotIdx  = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, dotIdx);
    const sig     = decoded.slice(dotIdx + 1);
    const expected = crypto.createHmac("sha256", CAPTCHA_SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const [storedIP, tsStr] = payload.split(":");
    if (storedIP !== ip) return false;
    if (Date.now() - Number(tsStr) > CAPTCHA_MAX_AGE) return false;
    return true;
  } catch { return false; }
}

function hasCaptchaCookie(req) {
  const raw = req.headers.cookie || "";
  const cookie = raw.split(";").map(s => s.trim()).find(s => s.startsWith(CAPTCHA_COOKIE + "="));
  if (!cookie) return false;
  const token = cookie.slice(CAPTCHA_COOKIE.length + 1);
  const ip = (req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "");
  return verifyCaptchaToken(ip, token);
}

function setCaptchaCookie(res, ip) {
  const token = makeCaptchaToken(ip);
  res.setHeader("Set-Cookie",
    `${CAPTCHA_COOKIE}=${token}; Max-Age=${CAPTCHA_MAX_AGE / 1000}; Path=/; HttpOnly; SameSite=Lax`
  );
}

async function getCountry(ip) {
  // Always pass local / private IPs (dev environment)
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.")) return "GE";

  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) return cached.country;

  try {
    const res  = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=countryCode`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const country = data.countryCode || "??";
    geoCache.set(ip, { country, ts: Date.now() });
    return country;
  } catch {
    // On lookup failure → let them through (don't block on geo error)
    return "GE";
  }
}

// ── Image-selection captcha ───────────────────────────────────────────────────
// Shows a 3×3 grid of emojis. User must click all tiles matching the target category.
// Categories and their emoji pools:
const CAPTCHA_CATEGORIES = {
  "🚌 ავტობუსი": ["🚌","🚎","🚐"],
  "🚗 მანქანა":  ["🚗","🚕","🏎️","🚙"],
  "✈️ თვითმფრინავი": ["✈️","🛩️","🛫","🛬"],
  "🐶 ძაღლი":   ["🐶","🐕","🦮","🐩"],
  "🐱 კატა":    ["🐱","🐈","😸","🙀"],
  "🌳 ხე":      ["🌳","🌲","🌴","🎄"],
  "🍎 ხილი":    ["🍎","🍊","🍋","🍇","🍓","🍑","🍒"],
  "⚽ ბურთი":   ["⚽","🏀","🏈","⚾","🎾","🏐","🏉"],
  "🏠 სახლი":   ["🏠","🏡","🏘️","🏚️"],
  "🌸 ყვავილი": ["🌸","🌺","🌻","🌼","💐","🌹","🌷"],
};

// Distractor emojis that never belong to any category
const DISTRACTORS = ["🎸","🎺","🎻","🥁","🎹","🪗","📱","💻","⌨️","🖥️","🎮","🕹️","🔑","🔒","💡","🔦","🪣","🧲","🎩","👑","💍","👟","🧢","🎀","🧸","🪆","🎯","🧩","🎲","🃏"];

function newChallenge(ip) {
  // Pick a random category
  const catKeys = Object.keys(CAPTCHA_CATEGORIES);
  const targetLabel = catKeys[Math.floor(Math.random() * catKeys.length)];
  const targetPool  = CAPTCHA_CATEGORIES[targetLabel];

  // Build a 3×3 grid (9 tiles)
  // Pick 2–4 correct tiles, fill rest with distractors
  const correctCount = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
  const correct = [];
  const poolCopy = [...targetPool];
  for (let i = 0; i < correctCount && poolCopy.length; i++) {
    const idx = Math.floor(Math.random() * poolCopy.length);
    correct.push(poolCopy.splice(idx, 1)[0]);
  }

  // Fill remaining 9 - correctCount slots with unique distractors
  const distCopy = [...DISTRACTORS].sort(() => Math.random() - 0.5);
  const tiles = [...correct];
  while (tiles.length < 9) tiles.push(distCopy.pop());

  // Shuffle tiles
  tiles.sort(() => Math.random() - 0.5);

  // correctIndices = positions (0-8) of correct tiles
  const correctIndices = tiles.reduce((acc, t, i) => {
    if (correct.includes(t)) acc.push(i);
    return acc;
  }, []);

  const challenge = {
    targetLabel,
    tiles,
    correctIndices,
    expires: Date.now() + CAPTCHA_TTL,
  };
  captchaChallenges.set(ip, challenge);
  return challenge;
}

function captchaPageHTML(ip, error) {
  const ch = captchaChallenges.get(ip) || newChallenge(ip);
  const errHtml = error ? `<p class="err">${error}</p>` : "";
  // Encode correct indices as hidden field so verify can check
  const correctJson = JSON.stringify(ch.correctIndices);

  const tiles = ch.tiles.map((emoji, i) =>
    `<div class="tile" data-idx="${i}" onclick="toggle(this)">${emoji}</div>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GAICANI – გადამოწმება</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%;background:#1e1f22;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Arial,sans-serif}
.box{background:#2b2d31;border-radius:16px;padding:32px 28px;max-width:400px;width:92%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.5)}
.logo{font-size:1.8em;font-weight:900;color:#fff;letter-spacing:1px;margin-bottom:6px}
.sub{color:#72767d;font-size:.85em;margin-bottom:16px;line-height:1.5}
.target{background:#1e1f22;border-radius:10px;padding:12px 18px;font-size:1.5em;font-weight:700;color:#fff;margin-bottom:18px;display:inline-block}
.hint{color:#72767d;font-size:.8em;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px}
.tile{background:#1e1f22;border:2px solid #3a3c40;border-radius:10px;font-size:2.2em;padding:12px 0;cursor:pointer;transition:border .15s,background .15s;user-select:none;line-height:1}
.tile:hover{border-color:#5865f2;background:#232428}
.tile.selected{border-color:#5865f2;background:rgba(88,101,242,.18)}
button{width:100%;background:#5865f2;color:#fff;border:none;border-radius:8px;padding:13px;font-size:1em;font-weight:600;cursor:pointer;transition:background .2s}
button:hover{background:#4752c4}
.err{color:#f23f42;font-size:.85em;margin-top:12px;background:rgba(242,63,66,.1);border-radius:6px;padding:8px 12px}
.note{color:#4f5560;font-size:.72em;margin-top:18px;line-height:1.5}
</style>
</head>
<body>
<div class="box">
  <div class="logo">GAICANI</div>
  <p class="sub">დაამტკიცეთ, რომ ადამიანი ხართ</p>
  <div class="target">${ch.targetLabel}</div>
  <p class="hint">აარჩიეთ ყველა სურათი, რომელიც შეესაბამება</p>
  <div class="grid">${tiles}</div>
  <form method="POST" action="/captcha-verify" id="cf">
    <input type="hidden" name="selected" id="selectedInput" value=""/>
    ${errHtml}
    <button type="submit">დადასტურება →</button>
  </form>
  <p class="note">ეს შემოწმება მხოლოდ ერთხელ ხდება.<br>ქართული IP-ები ავტომატურად გადიან.</p>
</div>
<script>
function toggle(el) {
  el.classList.toggle("selected");
  const sel = [...document.querySelectorAll(".tile.selected")].map(t => t.dataset.idx);
  document.getElementById("selectedInput").value = sel.join(",");
}
</script>
</body>
</html>`;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(compression());
app.use(sensitiveUrlLogger); // log admin/stats visits BEFORE auth gates

// ── HTTP-level IP ban — runs before static files and all routes ───────────────
// Banned IPs can't load the page, assets, or call any API endpoint.
// This works without a firewall — the block happens inside Node/Express itself.
app.use((req, res, next) => {
  const ip = (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    ""
  );
  if (bannedIPs.has(ip)) {
    // Return a generic 403 — don't reveal why or that a ban system exists
    res.status(403).end();
    return;
  }
  next();
});

// ── Captcha gate — only on the main page, BEFORE static so it intercepts / ───
app.use(async (req, res, next) => {
  // Only gate the main page
  if (req.method !== "GET" || req.path !== "/") return next();

  const ip = (req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "");

  // Owner always passes
  if (OWNER_IPS.has(ip)) return next();

  // Already passed captcha
  if (hasCaptchaCookie(req)) return next();

  // Check geo
  const country = await getCountry(ip);
  if (country === "GE") {
    // Georgian IP — set cookie and pass through silently
    setCaptchaCookie(res, ip);
    return next();
  }

  // Non-Georgian — show captcha page instead of index.html
  newChallenge(ip);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(captchaPageHTML(ip, null));
});

// POST /captcha-verify — check submitted answer (also before static)
app.use(express.urlencoded({ extended: false }));

app.post("/captcha-verify", (req, res) => {
  const ip = (req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "");
  const challenge = captchaChallenges.get(ip);

  if (!challenge || Date.now() > challenge.expires) {
    newChallenge(ip);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(captchaPageHTML(ip, "ვადა გავიდა. სცადეთ თავიდან."));
  }

  // Parse selected tile indices from comma-separated string
  const raw = String(req.body?.selected || "");
  const selected = raw.split(",").map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n >= 0 && n <= 8);
  const correct  = challenge.correctIndices;

  // Must select exactly the correct set (all correct, none wrong)
  const allCorrectSelected = correct.every(i => selected.includes(i));
  const noWrongSelected    = selected.every(i => correct.includes(i));
  const passed = allCorrectSelected && noWrongSelected && selected.length > 0;

  if (!passed) {
    newChallenge(ip);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(captchaPageHTML(ip, "სცადეთ თავიდან — აარჩიეთ ყველა სწორი სურათი."));
  }

  captchaChallenges.delete(ip);
  setCaptchaCookie(res, ip);
  res.redirect(302, "/");
});

app.use(express.static(path.join(__dirname)));

// (captcha gate was previously here — moved above static)

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
  saveBannedIPs(); // persist to disk — survives restarts
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
  if (existed) saveBannedIPs(); // persist removal to disk
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
    result.push({ ip, count: entry.count, remainingHrs, reasons: entry.reasons || [] });
  }
  res.json({ count: result.length, reported: result });
});

// POST <unbanReported route>?ip=1.2.3.4  — clear a report-ban early (resets strike count to 0)
app.post(ROUTE.unbanReported, ownerOnly, (req, res) => {
  const ip = (req.query.ip || "").trim();
  if (!ip) return res.status(400).json({ error: "ip param required" });
  const existed = clearReportBan(ip);
  console.log(`[ADMIN] Cleared report-ban for IP ${ip} (existed=${existed})`);
  res.json({ ok: true, ip, wasBanned: existed });
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
.reason-list{margin:0;padding:0;list-style:none;max-width:320px}
.reason-list li{font-size:.85em;color:#dcddde;padding:3px 0;border-bottom:1px solid #1a1b1e}
.reason-list li:last-child{border-bottom:none}
.reason-list .meta{color:#72767d;font-size:.85em}
.refresh-btn{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:.85em;margin-bottom:16px}
.refresh-btn:hover{background:#4752c4}
.section{margin-bottom:32px}
#status{color:#3ba55d;font-size:.85em;margin-left:10px;display:inline}
table{width:100%;border-collapse:collapse}
td,th{padding:8px 10px;text-align:left;font-size:.85em}
th{color:#72767d;font-weight:600;border-bottom:1px solid #1a1b1e}
tr:hover td{background:rgba(255,255,255,.03)}
.manual-ban-box{background:#2b2d31;border-radius:10px;padding:18px;margin-bottom:12px}
.manual-ban-box textarea{width:100%;background:#1e1f22;border:1px solid #3a3c40;border-radius:6px;color:#dcddde;font-family:monospace;font-size:.9em;padding:10px 12px;resize:vertical;min-height:72px;outline:none;margin-bottom:10px}
.manual-ban-box textarea:focus{border-color:#5865f2}
.manual-ban-box input[type=text]{width:100%;background:#1e1f22;border:1px solid #3a3c40;border-radius:6px;color:#dcddde;font-size:.85em;padding:8px 12px;outline:none;margin-bottom:10px}
.manual-ban-box input[type=text]:focus{border-color:#5865f2}
.manual-ban-box label{display:block;color:#72767d;font-size:.78em;margin-bottom:4px}
.do-ban-btn{background:#f23f42;color:#fff;border:none;border-radius:6px;padding:8px 20px;cursor:pointer;font-size:.88em;font-weight:600}
.do-ban-btn:hover{background:#c0393b}
.hint{color:#72767d;font-size:.76em;margin-top:6px}
</style>
</head>
<body>
<h1>🛡️ Admin Panel</h1>
<button class="refresh-btn" onclick="loadAll()">↻ Refresh</button><span id="status"></span>

<div class="section">
  <h2>🔒 Manual Permanent Ban</h2>
  <div class="manual-ban-box">
    <label>IP address(es) to ban forever</label>
    <textarea id="manualIPs" placeholder="1.2.3.4&#10;5.6.7.8&#10;or comma-separated: 1.2.3.4, 5.6.7.8"></textarea>
    <label>Reason (optional, for your notes)</label>
    <input type="text" id="manualReason" placeholder="e.g. spammer, harassment..." />
    <button class="do-ban-btn" onclick="manualBan()">🚫 Ban Forever</button>
    <p class="hint">Enter one IP per line, or separate with commas. Bans are saved to disk and survive restarts.</p>
  </div>
</div>

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

async function unbanReportedIP(ip) {
  if (!confirm("Unban " + ip + "? This clears their report strikes back to 0.")) return;
  await api("POST", R.unbanReported + "?ip=" + encodeURIComponent(ip));
  setStatus("✅ Cleared report-ban for " + ip);
  loadAll();
}

function reasonsHtml(reasons) {
  if (!reasons || !reasons.length) return '<span style="color:#72767d">—</span>';
  return '<ul class="reason-list">' + reasons.map(r => \`<li>\${esc(r.reason)}<br><span class="meta">by \${esc(r.by)} · \${new Date(r.timestamp).toLocaleString()}</span></li>\`).join("") + '</ul>';
}

async function manualBan() {
  const raw    = document.getElementById("manualIPs").value;
  const reason = document.getElementById("manualReason").value.trim();

  // Split on newlines or commas, strip whitespace, drop empties
  const ips = raw.split(/[\\n,]+/).map(s => s.trim()).filter(s => s.length > 0);
  if (!ips.length) { setStatus("⚠️ No IPs entered"); return; }

  // Basic IP validation (v4 and v6 allowed)
  const invalid = ips.filter(ip => !/^[0-9a-fA-F:.]+$/.test(ip));
  if (invalid.length) {
    setStatus("⚠️ Invalid IP(s): " + invalid.join(", "));
    return;
  }

  if (!confirm("Permanently ban " + ips.length + " IP(s)?\\n\\n" + ips.join("\\n"))) return;

  let totalKicked = 0;
  const failed = [];
  for (const ip of ips) {
    try {
      const d = await api("POST", R.ban + "?ip=" + encodeURIComponent(ip));
      totalKicked += (d.kicked || 0);
    } catch { failed.push(ip); }
  }

  document.getElementById("manualIPs").value = "";
  document.getElementById("manualReason").value = "";

  const msg = failed.length
    ? "⚠️ Banned " + (ips.length - failed.length) + "/" + ips.length + " — failed: " + failed.join(", ")
    : "✅ Banned " + ips.length + " IP(s)" + (totalKicked ? " — " + totalKicked + " kicked" : "") + (reason ? " [" + reason + "]" : "");
  setStatus(msg);
  loadAll();
}

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  setTimeout(() => el.textContent = "", 5000);
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
      el.innerHTML = '<table><tr><th>IP</th><th>Reports</th><th>Reasons</th><th>Ban expires in</th><th></th></tr>' +
        d.reported.map(r => \`<tr>
          <td style="font-family:monospace;color:#fff">\${esc(r.ip)}</td>
          <td><span style="color:#f23f42;font-weight:700">\${r.count}</span></td>
          <td>\${reasonsHtml(r.reasons)}</td>
          <td style="color:#72767d">\${r.remainingHrs}h</td>
          <td><button class="unban-btn" onclick="unbanReportedIP('\${esc(r.ip)}')">✅ Unban</button></td>
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

// [AUTH] Reserved registered usernames — populated by the auth section below
const authReservedNames  = new Set();

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

  // Queue non-Georgian IPs for VirusTotal reputation check
  getCountry(rawIP).then(country => {
    if (country !== "GE") enqueueForVT(rawIP);
  });

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

    // [AUTH] If name belongs to a registered user, only allow its owner to use it.
    // Anonymous users attempting a registered name get nameTaken.
    if (authReservedNames.has(lowerTrimmed)) {
      const isOwner = socket._regUser && socket._regUser.usernameLower === lowerTrimmed;
      if (!isOwner) {
        socket.emit("nameTaken");
        return;
      }
      // Owner is reclaiming — evict any anonymous socket currently holding it
      if (activeUsernames.has(lowerTrimmed) && !pendingDisconnects.has(lowerTrimmed)) {
        for (const [, s] of io.sockets.sockets) {
          if (s.id !== socket.id && s.userName &&
              s.userName.toLowerCase() === lowerTrimmed && !s._regUser) {
            activeUsernames.delete(lowerTrimmed);
            s.userName = "";
            if (s.partner) { s.partner.partner = null; s.partner.emit("partnerDisconnected", { name: lowerTrimmed }); }
            waitingQueue = waitingQueue.filter(q => q.id !== s.id);
            s.emit("nameTaken");
            break;
          }
        }
      }
    }

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

  // ── PHOTO PERMISSION REQUEST ───────────────────────────────────────────
  socket.on("photo:request", (data) => {
    if (!socket.partner) return;
    if (socket.partner._isGhost) return;
    // Forward the permission request to partner
    socket.partner.emit("photo:request", { fromId: socket.id });
  });

  // ── PHOTO PERMISSION APPROVED ──────────────────────────────────────────
  socket.on("photo:approved", (data) => {
    if (!socket.partner || !data?.toId) return;
    if (socket.partner._isGhost) return;
    // Forward approval back to sender
    socket.partner.emit("photo:approved");
  });

  // ── PHOTO PERMISSION DECLINED ──────────────────────────────────────────
  socket.on("photo:declined", (data) => {
    if (!socket.partner || !data?.toId) return;
    if (socket.partner._isGhost) return;
    // Forward decline back to sender
    socket.partner.emit("photo:declined");
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

    // A reason is required — reject silently if missing/empty (client UI enforces this too)
    const cleanReason = (reason || "").trim().slice(0, 200);
    if (!cleanReason) return;

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
      reason:       cleanReason,
      timestamp:    new Date().toISOString(),
    };
    reportLog.push(entry);
    console.log("REPORT:", JSON.stringify(entry));

    const justBanned = recordReport(socket.id, targetIP, cleanReason, socket.userName);
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
      oldPartner.lastPartnerName  = "";
      oldPartner.emit("partnerDisconnected", { name: socket.userName });

      socket.recentPartnerIds.add(oldPartnerId);
      oldPartner.recentPartnerIds.add(socket.id);
      setTimeout(() => {
        socket.recentPartnerIds.delete(oldPartnerId);
        if (oldPartner.connected) oldPartner.recentPartnerIds.delete(socket.id);
        // Do NOT auto-queue either side — both must press Search themselves
      }, 5000);

      cleanupGameForSocket(socket.id);
      cleanupGameForSocket(oldPartnerId);
    }

    // User pressed Search — start looking for a partner via the queue system
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

    // Add to blocks list (no limit anymore — users can block unlimited other users)

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
        t => now5 - t < 300000 // keep last 5 minutes for logging (but no limit enforcement)
      );
      // No longer auto-kick on block limit — blocks are unlimited now
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
  const now       = Date.now();
  const uptimeSec = Math.floor((now - stats.serverStartedAt) / 1000);
  const days      = [];

  for (const dk of [...stats.days.keys()].sort()) {
    const d          = stats.days.get(dk);
    const avgDurSec  = d.sessions > 0
      ? Math.round(d.totalDurationMs / d.sessions / 1000) : 0;

    // Hourly breakdown — serialize Sets to counts
    const hours = d.hours.map((h, i) => ({
      hour:     i,           // 0-23 UTC
      label:    i.toString().padStart(2, "0") + ":00",
      uniqueIPs: h.ips.size,
      sessions:  h.sessions,
    }));

    // Peak hour (by unique IPs)
    const peakHour = hours.reduce((best, h) =>
      h.uniqueIPs > best.uniqueIPs ? h : best, hours[0]);

    days.push({
      date:          dk,
      uniqueIPs:     d.ips.size,
      newIPs:        d.newIPs.size,        // first-time visitors
      returningIPs:  d.ips.size - d.newIPs.size,
      sessions:      d.sessions,
      avgSessionSec: avgDurSec,
      chats:         d.chats,
      peakOnline:    d.peakOnline,
      peakOnlineAt:  d.peakOnlineAt,
      peakHour,
      hours,
    });
  }

  res.json({
    currentOnline:    io.sockets.sockets.size,
    peakOnline:       stats.peakOnline,
    peakOnlineAt:     stats.peakOnlineAt,
    allTimeUniqueIPs: stats.allTimeIPs.size,
    uptimeSec,
    days,
  });
});


// GET <stats route> — stats dashboard (IP-only, no key)
app.get(ROUTE.stats, ownerOnly, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const API = ROUTE.statsApi;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GAICANI Stats</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e1f22;color:#dcddde;font-family:"Segoe UI",Arial,sans-serif;padding:24px;max-width:980px;margin:0 auto}
h1{color:#fff;font-size:1.4em;margin-bottom:4px}
.sub{color:#72767d;font-size:.82em;margin-bottom:24px}
h2{color:#5865f2;font-size:.85em;margin:28px 0 12px;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:8px}
.sc{background:#2b2d31;border-radius:10px;padding:14px 16px}
.sv{font-size:1.7em;font-weight:700;color:#fff;line-height:1.1}
.sv.g{color:#3ba55d}.sv.y{color:#faa61a}.sv.b{color:#5865f2}.sv.r{color:#f23f42}
.sl{font-size:.73em;color:#72767d;margin-top:3px}
table{width:100%;border-collapse:collapse;background:#2b2d31;border-radius:10px;overflow:hidden;margin-bottom:8px}
th{background:#232428;color:#72767d;font-size:.76em;font-weight:600;padding:9px 12px;text-align:left;border-bottom:1px solid #1a1b1e}
td{padding:9px 12px;font-size:.84em;border-bottom:1px solid #1e1f22;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}
.bar-wrap{background:#1e1f22;border-radius:3px;height:6px;width:100%;margin-top:4px}
.bar{height:6px;border-radius:3px;background:#5865f2;min-width:2px;transition:width .4s}
.bar.g{background:#3ba55d}.bar.y{background:#faa61a}.bar.r{background:#f23f42}
.rb{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:.85em}
.rb:hover{background:#4752c4}
#lu{color:#72767d;font-size:.78em;margin-left:10px}
.day-block{background:#2b2d31;border-radius:12px;padding:18px;margin-bottom:16px}
.day-title{color:#fff;font-weight:700;font-size:1em;margin-bottom:14px;display:flex;align-items:center;gap:10px}
.day-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:16px}
.day-sc{background:#1e1f22;border-radius:8px;padding:10px 13px}
.day-sv{font-size:1.3em;font-weight:700;color:#fff}
.day-sl{font-size:.7em;color:#72767d;margin-top:2px}
.hour-chart{display:flex;align-items:flex-end;gap:2px;height:52px;margin-top:4px}
.hour-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px}
.hour-bar{width:100%;border-radius:2px 2px 0 0;background:#5865f2;min-height:2px;transition:height .3s}
.hour-bar.peak{background:#faa61a}
.hour-label{font-size:8px;color:#72767d;white-space:nowrap}
.peak-badge{background:rgba(250,166,26,.15);color:#faa61a;border:1px solid rgba(250,166,26,.3);border-radius:5px;font-size:.72em;padding:2px 7px;margin-left:auto}
</style>
</head>
<body>
<h1>📊 GAICANI Statistics</h1>
<p class="sub">Last 14 days · Hours in UTC · Auto-refreshes every 20s</p>
<button class="rb" onclick="load()">↻ Refresh</button><span id="lu"></span>

<h2>Right Now</h2>
<div class="grid" id="now">Loading...</div>

<h2>All Time (since last restart)</h2>
<div class="grid" id="alltime">Loading...</div>

<h2>Per-Day Breakdown</h2>
<div id="daily">Loading...</div>

<script>
const API = '${API}';

function fmt(s) {
  if (s < 60)   return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + (s%60) + 's';
  return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
}
function pct(v, m) { return m ? Math.round(v / m * 100) : 0; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function bar(v, max, cls='') {
  return '<div class="bar-wrap"><div class="bar ' + cls + '" style="width:' + pct(v,max) + '%"></div></div>';
}

async function load() {
  try {
    const d = await fetch(API).then(r => r.json());

    // ── Right now ──
    document.getElementById('now').innerHTML =
      sc(d.currentOnline, 'Online now', 'g') +
      sc(d.peakOnline,    'All-time peak', 'y') +
      (d.peakOnlineAt ? sc(new Date(d.peakOnlineAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' ' + new Date(d.peakOnlineAt).toLocaleDateString(), 'Peak time', '') : '');

    // ── All time ──
    document.getElementById('alltime').innerHTML =
      sc(d.allTimeUniqueIPs, 'Unique IPs ever', 'b') +
      sc(fmt(d.uptimeSec),   'Server uptime', '');

    if (!d.days || !d.days.length) {
      document.getElementById('daily').innerHTML = '<p style="color:#72767d;padding:12px 0">No data yet</p>';
      document.getElementById('lu').textContent = 'Updated ' + new Date().toLocaleTimeString();
      return;
    }

    // ── Per-day blocks (newest first) ──
    const days = [...d.days].reverse();
    const maxH  = Math.max(...days.flatMap(day => day.hours.map(h => h.uniqueIPs)), 1);

    let html = '';
    days.forEach(day => {
      const peakHr  = day.peakHour;
      const isToday = day.date === new Date().toISOString().slice(0,10);

      // Hourly bars
      const maxHourIPs = Math.max(...day.hours.map(h => h.uniqueIPs), 1);
      const hourBars = day.hours.map(h => {
        const isPeak = h.hour === peakHr.hour && h.uniqueIPs > 0;
        const heightPct = Math.max(pct(h.uniqueIPs, maxHourIPs), h.uniqueIPs > 0 ? 4 : 0);
        return '<div class="hour-bar-wrap" title="' + esc(h.label) + ': ' + h.uniqueIPs + ' IPs, ' + h.sessions + ' sessions">' +
          '<div class="hour-bar' + (isPeak ? ' peak' : '') + '" style="height:' + heightPct + '%"></div>' +
          (h.hour % 6 === 0 ? '<div class="hour-label">' + esc(h.label.slice(0,2)) + '</div>' : '<div class="hour-label">&nbsp;</div>') +
          '</div>';
      }).join('');

      html += '<div class="day-block">' +
        '<div class="day-title">' +
          '<span>' + esc(day.date) + (isToday ? ' <span style="color:#3ba55d;font-size:.75em">(today)</span>' : '') + '</span>' +
          (peakHr.uniqueIPs > 0 ? '<span class="peak-badge">⏰ Peak ' + esc(peakHr.label) + ' UTC (' + peakHr.uniqueIPs + ' IPs)</span>' : '') +
        '</div>' +

        '<div class="day-grid">' +
          dsc(day.uniqueIPs,     'Unique IPs') +
          dsc(day.newIPs,        'New visitors', '#3ba55d') +
          dsc(day.returningIPs,  'Returning', '#5865f2') +
          dsc(day.sessions,      'Connections') +
          dsc(day.chats,         'Chats started') +
          dsc(fmt(day.avgSessionSec), 'Avg session') +
          dsc(day.peakOnline,    'Peak online', '#faa61a') +
        '</div>' +

        '<div style="font-size:.72em;color:#72767d;margin-bottom:6px">Unique IPs per hour (UTC)</div>' +
        '<div class="hour-chart">' + hourBars + '</div>' +
        '</div>';
    });

    document.getElementById('daily').innerHTML = html;
    document.getElementById('lu').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch(e) { console.error(e); }
}

function sc(v, label, cls) {
  return '<div class="sc"><div class="sv ' + (cls||'') + '">' + esc(v) + '</div><div class="sl">' + esc(label) + '</div></div>';
}
function dsc(v, label, color) {
  return '<div class="day-sc"><div class="day-sv"' + (color ? ' style="color:' + color + '"' : '') + '>' + esc(v) + '</div><div class="day-sl">' + esc(label) + '</div></div>';
}

load();
setInterval(load, 20000);
</script>
</body>
</html>`);
});

// ── Sensitive-URL visitor log — owner eyes only ───────────────────────────────
app.get(ROUTE.visitorLog, ownerOnly, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

  const denied    = sensitiveVisitorLog.filter(e => !e.allowed);
  const uniqueIPs = [...new Set(sensitiveVisitorLog.map(e => e.ip))];

  const rows = [...sensitiveVisitorLog].reverse().map(e => {
    return `<tr class="${e.allowed ? "ok" : "bad"}">
      <td>${esc(e.timestamp)}</td>
      <td class="ip">${esc(e.ip)}</td>
      <td>${esc(e.url)}</td>
      <td>${e.allowed ? "✅ owner" : "🚫 denied"}</td>
      <td class="ua">${esc(e.userAgent)}</td>
    </tr>`;
  }).join("");

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
.btn{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:.85em}
.btn:hover{background:#4752c4}
.btn.danger{background:#f23f42}
.btn.danger:hover{background:#c0393b}
.toolbar{display:flex;gap:10px;margin-bottom:20px;align-items:center}
#clearStatus{font-size:.82em;color:#3ba55d}
</style>
</head>
<body>
<h1>🔍 Sensitive URL Visitor Log</h1>
<p class="sub">All IPs that hit admin / stats URLs — only visible to you (${[...OWNER_IPS].map(esc).join(", ")})</p>

<div class="toolbar">
  <button class="btn" onclick="location.reload()">↻ Refresh</button>
  <button class="btn danger" onclick="clearLogs()">🗑️ Clear All Logs</button>
  <span id="clearStatus"></span>
</div>

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
  }).join("") || '<span style="color:#72767d;font-size:.85em">None yet</span>'}
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

<script>
async function clearLogs() {
  if (!confirm("Delete all visitor logs? This cannot be undone.")) return;
  const r = await fetch('${ROUTE.visitorLog}', { method: 'DELETE' });
  const d = await r.json();
  if (d.ok) {
    document.getElementById('clearStatus').textContent = '✅ Logs cleared — ' + d.deleted + ' entries deleted';
    setTimeout(() => location.reload(), 1200);
  }
}
</script>
</body>
</html>`);
});

// DELETE <visitorLog route> — wipe the in-memory log
app.delete(ROUTE.visitorLog, ownerOnly, (req, res) => {
  const deleted = sensitiveVisitorLog.length;
  sensitiveVisitorLog.splice(0, sensitiveVisitorLog.length);
  console.log(`[VISITOR-LOG] Cleared by owner — ${deleted} entries deleted`);
  res.json({ ok: true, deleted });
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

// ── VirusTotal scan log dashboard ─────────────────────────────────────────────
app.get(ROUTE.vtLog, ownerOnly, (req, res) => {
  const log     = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "vt-log.json"), "utf8")); } catch { return []; } })();
  const queue   = (() => { try { return JSON.parse(fs.readFileSync(VT_QUEUE_FILE, "utf8")); } catch { return []; } })();
  const vtBans  = (() => { try { return JSON.parse(fs.readFileSync(VT_BANS_FILE,  "utf8")); } catch { return []; } })();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

  const banned  = log.filter(e => e.banned);
  const clean   = log.filter(e => !e.banned && !e.notFound);
  const unknown = log.filter(e => e.notFound);

  const rows = [...log].reverse().map(e => {
    const cls = e.banned ? "bad" : e.notFound ? "unk" : "ok";
    const scoreColor = e.score > VT_THRESHOLD ? "#f23f42" : e.score > 0 ? "#faa61a" : "#3ba55d";
    return `<tr class="${cls}">
      <td style="color:#72767d;font-size:.78em">${esc(e.ts)}</td>
      <td class="ip">${esc(e.ip)}</td>
      <td style="font-weight:700;color:${scoreColor}">${e.notFound ? "—" : e.score}</td>
      <td style="color:#f23f42">${e.malicious || 0}</td>
      <td style="color:#faa61a">${e.suspicious || 0}</td>
      <td>${e.banned ? "🚫 BANNED" : e.notFound ? "❓ Unknown" : "✅ Clean"}</td>
    </tr>`;
  }).join("");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>VT Scanner — GAICANI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e1f22;color:#dcddde;font-family:"Segoe UI",Arial,sans-serif;padding:24px;max-width:960px;margin:0 auto}
h1{color:#fff;font-size:1.4em;margin-bottom:4px}
.sub{color:#72767d;font-size:.82em;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:24px}
.sc{background:#2b2d31;border-radius:10px;padding:14px 16px}
.sv{font-size:1.7em;font-weight:700;color:#fff}
.sv.r{color:#f23f42}.sv.g{color:#3ba55d}.sv.y{color:#faa61a}
.sl{font-size:.73em;color:#72767d;margin-top:3px}
h2{color:#5865f2;font-size:.85em;margin:20px 0 10px;text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;background:#2b2d31;border-radius:10px;overflow:hidden;font-size:.82em}
th{background:#232428;color:#72767d;font-weight:600;padding:9px 12px;text-align:left;border-bottom:1px solid #1a1b1e}
td{padding:8px 12px;border-bottom:1px solid #1e1f22;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.bad td{background:rgba(242,63,66,.07)}
tr.unk td{background:rgba(250,166,26,.04)}
.ip{font-family:monospace;color:#fff;font-weight:600}
.btn{background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:.85em;margin-bottom:16px}
.btn:hover{background:#4752c4}
.queue-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.qtag{background:#2b2d31;border:1px solid #3a3c40;border-radius:5px;padding:3px 9px;font-family:monospace;font-size:.8em;color:#b5bac1}
</style>
</head>
<body>
<h1>🦠 VirusTotal Scanner</h1>
<p class="sub">Auto-scans non-Georgian IPs · Bans if score &gt; ${VT_THRESHOLD}</p>
<button class="btn" onclick="location.reload()">↻ Refresh</button>

<div class="grid">
  <div class="sc"><div class="sv">${log.length}</div><div class="sl">Total scanned</div></div>
  <div class="sc"><div class="sv r">${banned.length}</div><div class="sl">Auto-banned</div></div>
  <div class="sc"><div class="sv g">${clean.length}</div><div class="sl">Clean</div></div>
  <div class="sc"><div class="sv y">${unknown.length}</div><div class="sl">Unknown / not in VT</div></div>
  <div class="sc"><div class="sv">${queue.length}</div><div class="sl">Pending in queue</div></div>
  <div class="sc"><div class="sv">${vtBans.length}</div><div class="sl">VT-ban list size</div></div>
</div>

${queue.length ? `<h2>Pending queue (${queue.length})</h2>
<div class="queue-list">${queue.map(ip => `<span class="qtag">${esc(ip)}</span>`).join("")}</div>` : ""}

<h2>Scan log (newest first)</h2>
<table>
  <tr><th>Time</th><th>IP</th><th>Score</th><th>Malicious</th><th>Suspicious</th><th>Result</th></tr>
  ${rows || '<tr><td colspan="6" style="color:#72767d;padding:14px">No scans yet — waiting for non-Georgian IPs to connect.</td></tr>'}
</table>
</body>
</html>`);
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH · FRIENDS · PRIVATE CHAT  (GAICANI Registered Users)
// ════════════════════════════════════════════════════════════════════════════

const USERS_FILE        = path.join(__dirname, "registered_users.json");
const PRIV_MSGS_FILE    = path.join(__dirname, "private_messages.json");
const PRIVATE_MSG_TTL   = 12 * 60 * 60 * 1000; // 12 h — auto-delete
const AUTH_TOKEN_TTL    = 7  * 24 * 60 * 60 * 1000; // 7 days

// ── In-memory stores ─────────────────────────────────────────────────────────
const registeredUsers   = new Map(); // lowerUsername → userObj
const authTokens        = new Map(); // token → { usernameLower, expiry }
const privateRooms      = new Map(); // roomId → { messages, createdAt, expiresAt }
const onlineRegSockets  = new Map(); // lowerUsername → Set<socketId>

// ── Crypto helpers ────────────────────────────────────────────────────────────
function authHashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pwd, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}
function authVerifyPassword(pwd, stored) {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    return crypto.pbkdf2Sync(pwd, salt, 100000, 64, "sha512").toString("hex") === hash;
  } catch { return false; }
}
function authToken() { return crypto.randomBytes(32).toString("hex"); }
function privRoomId(a, b) { return [a.toLowerCase(), b.toLowerCase()].sort().join("::"); }

// ── Persist helpers ───────────────────────────────────────────────────────────
function loadAuthUsers() {
  try {
    const obj = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    for (const u of Object.values(obj)) {
      registeredUsers.set(u.username.toLowerCase(), u);
      authReservedNames.add(u.username.toLowerCase());
    }
    console.log(`[AUTH] Loaded ${registeredUsers.size} registered user(s)`);
  } catch { /* first run */ }
}
function saveAuthUsers() {
  const obj = {};
  for (const [k, u] of registeredUsers) {
    obj[k] = { username: u.username, passwordHash: u.passwordHash,
               createdAt: u.createdAt, friends: u.friends || [],
               pendingRequests: u.pendingRequests || [] };
  }
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2), "utf8"); }
  catch (e) { console.error("[AUTH] save failed:", e.message); }
}
function loadPrivateMsgs() {
  try {
    const obj = JSON.parse(fs.readFileSync(PRIV_MSGS_FILE, "utf8"));
    const now = Date.now();
    for (const [id, room] of Object.entries(obj)) {
      if (room.expiresAt && now < room.expiresAt) privateRooms.set(id, room);
    }
    console.log(`[PRIV] Loaded ${privateRooms.size} active private room(s)`);
  } catch { /* first run */ }
}
function savePrivateMsgs() {
  const obj = {};
  for (const [id, r] of privateRooms) obj[id] = r;
  try { fs.writeFileSync(PRIV_MSGS_FILE, JSON.stringify(obj, null, 2), "utf8"); }
  catch (e) { console.error("[PRIV] save failed:", e.message); }
}

loadAuthUsers();
loadPrivateMsgs();

// ── Scheduled cleanup ─────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  let n = 0;
  for (const [id, r] of privateRooms) if (now >= r.expiresAt) { privateRooms.delete(id); n++; }
  if (n) { savePrivateMsgs(); console.log(`[PRIV] Cleaned ${n} expired room(s)`); }
}, 60 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [t, e] of authTokens) if (now >= e.expiry) authTokens.delete(t);
}, 60 * 60 * 1000);

// ── REST endpoints ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

// POST /api/auth/register
app.post("/api/auth/register", authLimiter, express.json({ limit: "5kb" }), (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || typeof username !== "string" || typeof password !== "string")
    return res.status(400).json({ error: "სახელი და პაროლი სავალდებულოა" });

  const clean = username.trim();
  if (clean.length < 2 || clean.length > 20)
    return res.status(400).json({ error: "სახელი: 2–20 სიმბოლო" });
  if (!/^[\w\u10D0-\u10FF\s\-.]+$/.test(clean))
    return res.status(400).json({ error: "სახელი შეიცავს დაუშვებელ სიმბოლოებს" });
  if (password.length < 6 || password.length > 100)
    return res.status(400).json({ error: "პაროლი: 6–100 სიმბოლო" });

  const lc = clean.toLowerCase();
  if (registeredUsers.has(lc))
    return res.status(409).json({ error: "ეს სახელი უკვე დაკავებულია" });

  const user = {
    username: clean,
    passwordHash: authHashPassword(password),
    createdAt: new Date().toISOString(),
    friends: [],
    pendingRequests: []
  };

  registeredUsers.set(lc, user);
  authReservedNames.add(lc);
  saveAuthUsers();

  const token = authToken();
  authTokens.set(token, { usernameLower: lc, expiry: Date.now() + AUTH_TOKEN_TTL });

  res.status(201).json({ success: true, token, username: user.username });
});

// POST /api/auth/login
app.post("/api/auth/login", authLimiter, express.json({ limit: "5kb" }), (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "სახელი და პაროლი სავალდებულოა" });

  const lc = String(username).toLowerCase().trim();
  const user = registeredUsers.get(lc);
  if (!user || !authVerifyPassword(password, user.passwordHash))
    return res.status(401).json({ error: "არასწორი სახელი ან პაროლი" });

  const token = authToken();
  authTokens.set(token, { usernameLower: lc, expiry: Date.now() + AUTH_TOKEN_TTL });

  res.json({
    success: true,
    token,
    username: user.username,
    friends: user.friends || [],
    pendingRequests: user.pendingRequests || []
  });
});

// POST /api/auth/logout
app.post("/api/auth/logout", express.json({ limit: "1kb" }), (req, res) => {
  const { token } = req.body || {};
  if (token) authTokens.delete(token);
  res.json({ success: true });
});

// POST /api/auth/verify
app.post("/api/auth/verify", express.json({ limit: "1kb" }), (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(401).json({ error: "No token" });

  const entry = authTokens.get(token);
  if (!entry || Date.now() >= entry.expiry) {
    authTokens.delete(token);
    return res.status(401).json({ error: "Token expired" });
  }

  const user = registeredUsers.get(entry.usernameLower);
  if (!user) return res.status(401).json({ error: "User not found" });

  res.json({
    success: true,
    username: user.username,
    friends: user.friends || [],
    pendingRequests: user.pendingRequests || []
  });
});

// POST /api/friends/request
app.post("/api/friends/request", express.json({ limit: "2kb" }), (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const { toUsername } = req.body || {};
  if (!token || !toUsername) return res.status(400).json({ error: "Invalid request" });

  const entry = authTokens.get(token);
  if (!entry || Date.now() >= entry.expiry) return res.status(401).json({ error: "Unauthorized" });

  const fromUser = registeredUsers.get(entry.usernameLower);
  const toLc = String(toUsername).toLowerCase().trim();
  const toUser = registeredUsers.get(toLc);

  if (!fromUser || !toUser || toLc === entry.usernameLower)
    return res.status(400).json({ error: "Invalid target" });

  if (!toUser.pendingRequests) toUser.pendingRequests = [];
  if (!toUser.pendingRequests.includes(entry.usernameLower)) {
    toUser.pendingRequests.push(entry.usernameLower);
    saveAuthUsers();
  }

  res.json({ success: true });
});

// POST /api/friends/accept
app.post("/api/friends/accept", express.json({ limit: "2kb" }), (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const { fromUsername } = req.body || {};
  if (!token || !fromUsername) return res.status(400).json({ error: "Invalid request" });

  const entry = authTokens.get(token);
  if (!entry || Date.now() >= entry.expiry) return res.status(401).json({ error: "Unauthorized" });

  const toUser = registeredUsers.get(entry.usernameLower);
  const fromLc = String(fromUsername).toLowerCase().trim();
  const fromUser = registeredUsers.get(fromLc);

  if (!toUser || !fromUser) return res.status(400).json({ error: "Invalid users" });

  if (!toUser.friends) toUser.friends = [];
  if (!fromUser.friends) fromUser.friends = [];
  if (!toUser.pendingRequests) toUser.pendingRequests = [];

  if (!toUser.friends.includes(fromLc)) toUser.friends.push(fromLc);
  if (!fromUser.friends.includes(entry.usernameLower)) fromUser.friends.push(entry.usernameLower);
  toUser.pendingRequests = toUser.pendingRequests.filter(u => u !== fromLc);

  saveAuthUsers();
  res.json({ success: true, friends: toUser.friends });
});

// POST /api/friends/decline
app.post("/api/friends/decline", express.json({ limit: "2kb" }), (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const { fromUsername } = req.body || {};
  if (!token || !fromUsername) return res.status(400).json({ error: "Invalid request" });

  const entry = authTokens.get(token);
  if (!entry || Date.now() >= entry.expiry) return res.status(401).json({ error: "Unauthorized" });

  const user = registeredUsers.get(entry.usernameLower);
  if (!user) return res.status(400).json({ error: "User not found" });

  if (!user.pendingRequests) user.pendingRequests = [];
  const fromLc = String(fromUsername).toLowerCase().trim();
  user.pendingRequests = user.pendingRequests.filter(u => u !== fromLc);
  saveAuthUsers();

  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// SOCKET.IO CONNECTION HANDLER
// ════════════════════════════════════════════════════════════════════════════

// Game helper functions
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMathQuestion() {
  const ops = ['+', '-', '*'];
  const op = ops[rand(0, 2)];
  let a, b, answer;

  if (op === '+') {
    a = rand(1, 50); b = rand(1, 50); answer = a + b;
  } else if (op === '-') {
    a = rand(10, 99); b = rand(1, a); answer = a - b;
  } else {
    a = rand(2, 12); b = rand(2, 12); answer = a * b;
  }

  const display = op === '*' ? `${a} × ${b}` : `${a} ${op} ${b}`;
  return { display, answer };
}

function checkTTTWinner(board) {
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
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
    (c1 === 'rock' && c2 === 'scissors') ||
    (c1 === 'scissors' && c2 === 'paper') ||
    (c1 === 'paper' && c2 === 'rock')
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

  const partnerId = game.players.find(id => id !== socketId);
  const partnerSocket = partnerId && io.sockets.sockets.get(partnerId);
  if (partnerSocket) partnerSocket.emit('game:partnerLeft');

  cleanupGame(game);
}

// ── Main connection handler ──────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.clientIP = (
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    socket.handshake.address ||
    "unknown"
  );

  // Check if IP is banned
  if (bannedIPs.has(socket.clientIP)) {
    console.log(`[BAN] Rejected banned IP: ${socket.clientIP}`);
    socket.emit("autoKicked");
    socket.disconnect(true);
    return;
  }

  // Check for VirusTotal
  if (socket.clientIP !== "unknown" && socket.clientIP !== "127.0.0.1") {
    const isGeorgian = /^(193\.|195\.|196\.110|196\.111)/.test(socket.clientIP);
    if (!isGeorgian) enqueueForVT(socket.clientIP);
  }

  console.log(`[SOCKET] Connected: ${socket.id} from ${socket.clientIP}`);

  // ── Login (registered user) ──────────────────────────────────────────────
  socket.on("auth:login", ({ token }) => {
    if (!token) return;
    const entry = authTokens.get(token);
    if (!entry || Date.now() >= entry.expiry) {
      socket.emit("auth:error", { error: "Token expired" });
      return;
    }

    const user = registeredUsers.get(entry.usernameLower);
    if (!user) return;

    socket._regUser = { usernameLower: entry.usernameLower, username: user.username };
    socket.userName = user.username;

    if (!onlineRegSockets.has(entry.usernameLower)) {
      onlineRegSockets.set(entry.usernameLower, new Set());
    }
    onlineRegSockets.get(entry.usernameLower).add(socket.id);

    socket.join(`user:${entry.usernameLower}`);
    socket.emit("auth:authenticated", { username: user.username, friends: user.friends || [], pendingRequests: user.pendingRequests || [] });
    console.log(`[AUTH] ${user.username} logged in`);
  });

  // ── auth:token — alias kept for backwards compat ─────────────────────────
  socket.on("auth:token", (token) => {
    // Normalise: old client sent raw string, new client sends { token }
    const t = (typeof token === "string") ? token : token?.token;
    if (t) socket.emit("auth:login:internal", { token: t }); // reuse handler logic
    // Just delegate to the auth:login handler
    socket.emit.call(socket, "auth:login", { token: t });
  });

  // ── auth:checkPartner — tell client if current partner is registered ──────
  socket.on("auth:checkPartner", () => {
    if (!socket.partner || !socket._regUser) return;
    const partnerReg = socket.partner._regUser;
    if (!partnerReg) return; // partner is a guest, nothing to report
    const myUser = registeredUsers.get(socket._regUser.usernameLower);
    const isFriend = (myUser?.friends || []).includes(partnerReg.usernameLower);
    const roomId = privRoomId(socket._regUser.usernameLower, partnerReg.usernameLower);
    socket.emit("auth:partnerRegInfo", {
      partnerRegName: partnerReg.username,
      isFriend,
      roomId,
    });
  });


  socket.on("friend:request", ({ toUsername }) => {
    if (!socket._regUser) return;
    const targetLc = String(toUsername).toLowerCase().trim();
    const targetUser = registeredUsers.get(targetLc);
    if (!targetUser) return;

    if (!targetUser.pendingRequests) targetUser.pendingRequests = [];
    if (!targetUser.pendingRequests.includes(socket._regUser.usernameLower)) {
      targetUser.pendingRequests.push(socket._regUser.usernameLower);
      saveAuthUsers();
    }

    io.to(`user:${targetLc}`).emit("friend:incomingRequest", {
      fromUsername: socket._regUser.username
    });
  });

  // ── Accept friend request ────────────────────────────────────────────────
  socket.on("friend:accept", ({ fromUsername }) => {
    if (!socket._regUser) return;
    const fromLc = String(fromUsername).toLowerCase().trim();
    const myUser = registeredUsers.get(socket._regUser.usernameLower);
    const fromUser = registeredUsers.get(fromLc);

    if (!myUser || !fromUser) return;
    if (!myUser.friends) myUser.friends = [];
    if (!fromUser.friends) fromUser.friends = [];
    if (!myUser.pendingRequests) myUser.pendingRequests = [];

    if (!myUser.friends.includes(fromLc)) myUser.friends.push(fromLc);
    if (!fromUser.friends.includes(socket._regUser.usernameLower)) {
      fromUser.friends.push(socket._regUser.usernameLower);
    }
    myUser.pendingRequests = myUser.pendingRequests.filter(u => u !== fromLc);

    saveAuthUsers();
    socket.emit("friend:accepted", { friends: myUser.friends });
    io.to(`user:${fromLc}`).emit("friend:acceptedByOther", {
      byUsername: socket._regUser.username
    });
  });

  // ── Decline friend request ───────────────────────────────────────────────
  socket.on("friend:decline", ({ fromUsername }) => {
    if (!socket._regUser) return;
    const fromLc = String(fromUsername).toLowerCase().trim();
    const myUser = registeredUsers.get(socket._regUser.usernameLower);
    if (!myUser) return;

    if (!myUser.pendingRequests) myUser.pendingRequests = [];
    myUser.pendingRequests = myUser.pendingRequests.filter(u => u !== fromLc);
    saveAuthUsers();

    socket.emit("friend:declined");
    io.to(`user:${fromLc}`).emit("friend:declinedByOther", {
      byUsername: socket._regUser.username
    });
  });

  // ── Remove friend ────────────────────────────────────────────────────────
  socket.on("friend:remove", ({ friendUsername }) => {
    if (!socket._regUser || !friendUsername) return;
    const myLc = socket._regUser.usernameLower;
    const targetLc = String(friendUsername).toLowerCase().trim();
    if (!targetLc || targetLc === myLc) return;

    const myUser = registeredUsers.get(myLc);
    const targetUser = registeredUsers.get(targetLc);

    if (!myUser) return;
    myUser.friends = (myUser.friends || []).filter(f => f !== targetLc);

    if (targetUser) {
      targetUser.friends = (targetUser.friends || []).filter(f => f !== myLc);
    }

    saveAuthUsers();
    socket.emit("friend:removed", { friends: myUser.friends });

    if (targetUser) {
      io.to(`user:${targetLc}`).emit("friend:removedByOther", {
        byUsername: socket._regUser.username
      });
    }
  });

  // ── Session block ────────────────────────────────────────────────────────
  socket.on("reg:sessionBlock", ({ targetUsername }) => {
    if (!socket._regUser || !targetUsername) return;
    const targetLc = String(targetUsername).toLowerCase().trim();
    if (!targetLc || targetLc === socket._regUser.usernameLower) return;

    if (!socket.blockedNames) socket.blockedNames = [];
    if (!socket.blockedNames.includes(targetLc)) {
      socket.blockedNames.push(targetLc);
    }

    if (socket.partner && socket.partner.userName &&
        socket.partner.userName.toLowerCase() === targetLc) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName || "" });
      socket.partner.partner = null;
      socket.partner = null;
    }

    socket.emit("reg:sessionBlockAck", { targetUsername: targetLc });
  });

  // ── Session unblock ──────────────────────────────────────────────────────
  socket.on("reg:sessionUnblock", ({ targetUsername }) => {
    if (!socket._regUser || !targetUsername) return;
    const targetLc = String(targetUsername).toLowerCase().trim();
    if (!socket.blockedNames) return;
    socket.blockedNames = socket.blockedNames.filter(n => n !== targetLc);
  });

  // ── Private message request ──────────────────────────────────────────────
  socket.on("privateMsg:send", ({ toUsername, message }) => {
    if (!socket._regUser || !toUsername || !message) return;
    const toLc = String(toUsername).toLowerCase().trim();
    const roomId = privRoomId(socket._regUser.usernameLower, toLc);
    let room = privateRooms.get(roomId);

    if (!room) {
      room = { messages: [], createdAt: Date.now(), expiresAt: Date.now() + PRIVATE_MSG_TTL };
      privateRooms.set(roomId, room);
    }

    const msg = {
      from: socket._regUser.usernameLower,
      text: String(message).slice(0, MSG_MAX),
      ts: new Date().toISOString()
    };

    room.messages.push(msg);
    if (room.messages.length > 100) room.messages.shift();
    room.expiresAt = Date.now() + PRIVATE_MSG_TTL;

    savePrivateMsgs();

    io.to(`user:${toLc}`).emit("privateMsg:received", {
      fromUsername: socket._regUser.username,
      message: msg.text,
      timestamp: msg.ts
    });

    socket.emit("privateMsg:sent", { success: true });
  });

  // ── Message handling ─────────────────────────────────────────────────────
  socket.on("message", (data) => {
    if (!socket.partner || !socket.partner.connected) {
      socket.emit("error", { msg: "Partner disconnected" });
      return;
    }

    let msg = String(data.msg || "").trim().slice(0, MSG_MAX);
    if (!msg) return;

    // Rate limiting
    if (!socket.msgTimes) socket.msgTimes = [];
    const now = Date.now();
    socket.msgTimes = socket.msgTimes.filter(t => now - t < MSG_RATE_WINDOW_MS);

    if (socket.msgTimes.length >= MSG_RATE_MAX) {
      socket.emit("rateLimited");
      return;
    }
    socket.msgTimes.push(now);

    socket.partner.emit("message", { msg, name: socket.userName });
  });

  // ── Typing indicator ─────────────────────────────────────────────────────
  socket.on("typing", () => {
    if (socket.partner) socket.partner.emit("partnerTyping");
  });

  // ── Name change ──────────────────────────────────────────────────────────
  socket.on("namechange", ({ name }) => {
    if (!name || typeof name !== "string") return;
    const clean = String(name).trim().slice(0, NAME_MAX);
    if (clean.length < NAME_MIN) return;

    socket.userName = clean;
    if (socket.partner) socket.partner.emit("partnerName", { name: clean });
  });

  // ── Game request ─────────────────────────────────────────────────────────
  socket.on("game:request", ({ gameType }) => {
    const partner = socket.partner;
    if (!partner) return;
    partner.emit("game:invite", { gameType, fromId: socket.id });
  });

  // ── Game response ────────────────────────────────────────────────────────
  socket.on("game:response", ({ accepted, gameType, toId }) => {
    const requesterSocket = io.sockets.sockets.get(toId);
    if (!requesterSocket) return;

    if (!accepted) {
      requesterSocket.emit("game:declined");
      return;
    }

    const gameId = `${toId}:${socket.id}`;
    const players = [toId, socket.id];

    let state;
    if (gameType === "ttt") {
      state = { board: Array(9).fill(null), currentTurnSocketId: toId };
    } else if (gameType === "rps") {
      state = { choices: {} };
    } else if (gameType === "math") {
      state = { question: generateMathQuestion(), answered: false };
    }

    const game = { id: gameId, type: gameType, players, state };
    gameById.set(gameId, game);
    gameBySocket.set(toId, gameId);
    gameBySocket.set(socket.id, gameId);

    const roles = { [toId]: "X", [socket.id]: "O" };

    [toId, socket.id].forEach(pid => {
      const s = io.sockets.sockets.get(pid);
      if (s) s.emit("game:start", {
        gameId,
        gameType,
        role: roles[pid] ?? null,
        opponentId: pid === toId ? socket.id : toId,
        state
      });
    });
  });

  // ── Game move ────────────────────────────────────────────────────────────
  socket.on("game:move", (data) => {
    const gameId = gameBySocket.get(socket.id);
    if (!gameId) return;
    const game = gameById.get(gameId);
    if (!game) return;

    const [p1Id, p2Id] = game.players;
    const partnerId = socket.id === p1Id ? p2Id : p1Id;
    const partnerSocket = io.sockets.sockets.get(partnerId);

    if (game.type === "ttt") {
      const { index } = data;
      const { board, currentTurnSocketId } = game.state;

      if (currentTurnSocketId !== socket.id) return;
      if (board[index] !== null) return;

      const symbol = socket.id === p1Id ? "X" : "O";
      board[index] = symbol;
      const winResult = checkTTTWinner(board);
      const draw = !winResult && board.every(Boolean);

      if (!winResult && !draw)
        game.state.currentTurnSocketId = partnerId;

      const update = {
        board,
        currentTurnSocketId: game.state.currentTurnSocketId,
        winnerSocketId: winResult ? socket.id : undefined,
        winLine: winResult ? winResult.line : undefined,
        draw: draw || undefined
      };

      socket.emit("game:update", update);
      if (partnerSocket) partnerSocket.emit("game:update", update);

      if (winResult || draw) cleanupGame(game);
    } else if (game.type === "rps") {
      if (game.state.choices[socket.id]) return;
      game.state.choices[socket.id] = data.choice;

      if (partnerSocket)
        partnerSocket.emit("game:update", { opponentChose: true });

      if (Object.keys(game.state.choices).length === 2) {
        const c1 = game.state.choices[p1Id];
        const c2 = game.state.choices[p2Id];
        const result = getRPSWinner(c1, c2);
        const winnerSocketId = result === "draw" ? null : result === "p1" ? p1Id : p2Id;

        const update = {
          choices: game.state.choices,
          winnerSocketId,
          draw: result === "draw"
        };
        socket.emit("game:update", update);
        if (partnerSocket) partnerSocket.emit("game:update", update);
        cleanupGame(game);
      }
    } else if (game.type === "math") {
      if (game.state.answered) return;
      const { answer: submitted } = data;

      if (submitted === game.state.question.answer) {
        game.state.answered = true;
        const update = {
          winnerSocketId: socket.id,
          answer: game.state.question.answer,
          question: game.state.question
        };
        socket.emit("game:update", update);
        if (partnerSocket) partnerSocket.emit("game:update", update);
        cleanupGame(game);
      } else {
        socket.emit("game:update", { wrong: true });
      }
    }
  });

  // ── Rematch ──────────────────────────────────────────────────────────────
  socket.on("game:rematch", ({ gameType, toId }) => {
    const target = io.sockets.sockets.get(toId);
    if (!target) return;
    target.emit("game:invite", { gameType, fromId: socket.id, isRematch: true });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);

    if (socket._regUser) {
      const sockets = onlineRegSockets.get(socket._regUser.usernameLower);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) onlineRegSockets.delete(socket._regUser.usernameLower);
      }
    }

    if (socket.partner) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName || "" });
      socket.partner.partner = null;
      socket.partner = null;
    }

    cleanupGameForSocket(socket.id);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 GAICANI Server running on port ${PORT}\n`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Admin panel: http://localhost:${PORT}${ROUTE.panel}`);
  console.log(`   Stats: http://localhost:${PORT}${ROUTE.stats}\n`);
});
