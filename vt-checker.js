/**
 * vt-checker.js — VirusTotal IP reputation checker for GAICANI
 * ─────────────────────────────────────────────────────────────
 * Runs as a SEPARATE process alongside server.js.
 *
 * HOW IT WORKS:
 *   1. Reads new non-Georgian IPs from a shared queue file (vt-queue.json)
 *      that server.js writes to whenever a foreign IP connects.
 *   2. Checks each IP against the VirusTotal API.
 *   3. If malicious score > VT_THRESHOLD, writes the IP to vt-bans.json.
 *   4. server.js watches vt-bans.json and loads new bans automatically.
 *
 * SETUP:
 *   1. Get a free VirusTotal API key at https://www.virustotal.com/
 *   2. Set it: export VT_API_KEY=your_key_here
 *   3. Run alongside server:  node vt-checker.js
 *      (or use PM2: pm2 start vt-checker.js)
 *
 * FREE TIER LIMITS:
 *   - 4 requests/minute, 500/day
 *   - The checker respects this with a 16s delay between requests.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const VT_API_KEY     = process.env.VT_API_KEY || "";
const VT_THRESHOLD   = 3;       // ban if malicious + suspicious > this
const CHECK_INTERVAL = 16000;   // ms between VT requests (free tier: 4/min)
const QUEUE_FILE     = path.join(__dirname, "vt-queue.json");
const BANS_FILE      = path.join(__dirname, "vt-bans.json");
const LOG_FILE       = path.join(__dirname, "vt-log.json");
const CHECKED_FILE   = path.join(__dirname, "vt-checked.json");
const MAX_LOG        = 500;     // keep last N log entries

if (!VT_API_KEY) {
  console.error("[VT] ERROR: VT_API_KEY environment variable is not set.");
  console.error("[VT] Get a free key at https://www.virustotal.com/ and run:");
  console.error("[VT]   export VT_API_KEY=your_key_here");
  process.exit(1);
}

// ── State ─────────────────────────────────────────────────────────────────────
// IPs already checked this session — avoids re-checking the same IP
const checkedThisSession = new Set();
let vtLog     = [];   // { ip, score, malicious, suspicious, banned, ts }
let vtBanned  = new Set();

// ── File helpers ──────────────────────────────────────────────────────────────
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8"); }
  catch (e) { console.error(`[VT] Failed to write ${file}:`, e.message); }
}

function loadState() {
  // Load previously checked IPs so we don't re-check after restart
  const checked = readJSON(CHECKED_FILE, []);
  checked.forEach(ip => checkedThisSession.add(ip));

  // Load existing bans
  const bans = readJSON(BANS_FILE, []);
  bans.forEach(ip => vtBanned.add(ip));

  // Load log
  vtLog = readJSON(LOG_FILE, []);

  console.log(`[VT] Loaded: ${checkedThisSession.size} previously checked, ${vtBanned.size} VT-banned`);
}

function saveChecked() {
  writeJSON(CHECKED_FILE, [...checkedThisSession]);
}

function saveBans() {
  writeJSON(BANS_FILE, [...vtBanned]);
}

function saveLog() {
  if (vtLog.length > MAX_LOG) vtLog = vtLog.slice(-MAX_LOG);
  writeJSON(LOG_FILE, vtLog);
}

// ── Queue helpers ─────────────────────────────────────────────────────────────
function readQueue() {
  return readJSON(QUEUE_FILE, []);
}

function writeQueue(queue) {
  writeJSON(QUEUE_FILE, queue);
}

function dequeueNextIP() {
  const queue = readQueue();
  if (!queue.length) return null;

  // Find first IP not already checked
  const idx = queue.findIndex(ip => !checkedThisSession.has(ip));
  if (idx === -1) {
    // All queued IPs already checked — clear queue
    writeQueue([]);
    return null;
  }

  const ip = queue[idx];
  queue.splice(idx, 1);
  writeQueue(queue);
  return ip;
}

// ── VirusTotal API ────────────────────────────────────────────────────────────
async function checkIP(ip) {
  const url = `https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`;
  const res = await fetch(url, {
    headers: { "x-apikey": VT_API_KEY },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 404) return { score: 0, malicious: 0, suspicious: 0, notFound: true };
  if (res.status === 429) throw new Error("Rate limited");
  if (!res.ok) throw new Error(`VT API error: ${res.status}`);

  const data = await res.json();
  const stats = data?.data?.attributes?.last_analysis_stats || {};
  const malicious  = stats.malicious  || 0;
  const suspicious = stats.suspicious || 0;
  const score      = malicious + suspicious;

  return { score, malicious, suspicious, notFound: false };
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function tick() {
  const ip = dequeueNextIP();
  if (!ip) return; // nothing to check

  console.log(`[VT] Checking IP: ${ip}`);

  try {
    const { score, malicious, suspicious, notFound } = await checkIP(ip);

    checkedThisSession.add(ip);
    saveChecked();

    const banned = !notFound && score > VT_THRESHOLD;

    const entry = {
      ip,
      score,
      malicious,
      suspicious,
      banned,
      notFound,
      ts: new Date().toISOString(),
    };
    vtLog.push(entry);
    saveLog();

    if (banned) {
      vtBanned.add(ip);
      saveBans();
      console.log(`[VT] 🚫 AUTO-BANNED ${ip} — score ${score} (${malicious} malicious, ${suspicious} suspicious)`);
    } else {
      console.log(`[VT] ✅ ${ip} — score ${score}${notFound ? " (not found in VT)" : ""} — OK`);
    }
  } catch (e) {
    console.error(`[VT] Error checking ${ip}:`, e.message);
    // Re-queue the IP to retry later
    const queue = readQueue();
    if (!queue.includes(ip)) queue.unshift(ip); // put it back at front
    writeQueue(queue);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
loadState();
console.log(`[VT] Started — threshold: >${VT_THRESHOLD}, interval: ${CHECK_INTERVAL}ms`);
console.log(`[VT] Queue file:  ${QUEUE_FILE}`);
console.log(`[VT] Bans file:   ${BANS_FILE}`);
console.log(`[VT] Log file:    ${LOG_FILE}`);

// Run immediately then on interval
tick();
setInterval(tick, CHECK_INTERVAL);
