const socket = io();

// ── State ─────────────────────────────────────────────────────────────────────
let userName            = "";
let partnerConnected    = false;
let partnerName         = "";
let isFirstLogin        = true;
let isReconnecting      = false;
let wasAutoKicked        = false;
let msgCounter          = 0;
let typingTimeout       = null;
let isTyping            = false;
let searchRetryInterval = null;
let pendingScrollRaf    = false;
let gifFetchController  = null;
let gifSearchTimer      = null;
let gifPickerOpen       = false;
let unreadCount         = 0;
let replyTo             = null;   
const originalTitle      = document.title;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const chat           = document.getElementById("chat");
const messageInput   = document.getElementById("messageInput");
const sendBtn        = document.getElementById("sendBtn");
const nextBtn        = document.getElementById("nextBtn");
const blockBtn       = document.getElementById("blockBtn");
const changeNameBtn  = document.getElementById("changeNameBtn");
const nameModal      = document.getElementById("nameModal");
const nameInput      = document.getElementById("nameInput");
const saveNameBtn    = document.getElementById("saveNameBtn");
const nameError      = document.getElementById("nameError");
const onlineCountEl  = document.getElementById("onlineCount");
const gifBtn         = document.getElementById("gifBtn");
const gifPicker      = document.getElementById("gifPicker");
const gifSearch      = document.getElementById("gifSearch");
const gifResults     = document.getElementById("gifResults");
const gifPickerClose = document.getElementById("gifPickerClose");
const charCount      = document.getElementById("charCount");
const questionBtn    = document.getElementById("questionBtn");
const replyPreview   = document.getElementById("replyPreview");
const replyPreviewName = document.getElementById("replyPreviewName");
const replyPreviewText = document.getElementById("replyPreviewText");
const replyPreviewClose = document.getElementById("replyPreviewClose");

// ── Audio ─────────────────────────────────────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function ensureAudioReady() { if (_audioCtx?.state === "suspended") _audioCtx.resume(); }
document.addEventListener("click", ensureAudioReady, { passive: true });

function playTone(freq, duration = 0.2, volume = 0.07) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playNotification(type) {
  if (type === "partnerFound") {
    playTone(880, 0.12); setTimeout(() => playTone(1100, 0.18), 110);
  } else if (type === "message") {
    playTone(660, 0.1, 0.04);
  }
}

// ── Scroll & UI Helpers ───────────────────────────────────────────────────────
function scheduleScroll() {
  if (pendingScrollRaf) return;
  pendingScrollRaf = true;
  requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; pendingScrollRaf = false; });
}

function formatTimestamp(date) {
  const h = date.getHours(), m = date.getMinutes();
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function _appendInfoMessage(text, className, id) {
  const el = document.createElement("div");
  el.className = className; el.textContent = text;
  if (id) el.id = id;
  chat.appendChild(el); scheduleScroll();
}

function addSystemMessage(text) { _appendInfoMessage(text, "system-message"); }
function addDisconnectMessage(text) { _appendInfoMessage(text, "system-message-disconnect"); }
function removeReconnectingMessage() { document.getElementById("reconnectingMsg")?.remove(); }

function addSearchingMessage() {
  document.getElementById("searchingMsg")?.remove();
  const wrapper = document.createElement("div");
  wrapper.id = "searchingMsg"; wrapper.className = "searching-block";
  wrapper.innerHTML = `<div class="system-message">ვეძებთ ახალ პარტნიორს... 🔎</div>
                       <div class="fact-card"><span class="fact-label">💡 Random Fact</span><span class="fact-text">იტვირთება...</span></div>`;
  chat.appendChild(wrapper); scheduleScroll();
  fetch("/api/random-fact").then(r => r.json()).then(d => {
    if (d.fact) wrapper.querySelector(".fact-text").textContent = d.fact;
  });
}

// ── Messaging ─────────────────────────────────────────────────────────────────
function addMessage(text, isYou, messageId, replyToData) {
  const id = messageId || `${socket.id}_${Date.now()}`;
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${isYou ? "you" : "partner"}`;
  
  if (replyToData?.text) {
    const quote = document.createElement("div");
    quote.className = `reply-quote ${isYou ? "you" : "partner"}`;
    quote.innerHTML = `<span class="reply-quote-name">${replyToData.senderName}</span>
                       <span class="reply-quote-text">${replyToData.text.slice(0, 80)}</span>`;
    wrapper.appendChild(quote);
  }

  const msgRow = document.createElement("div");
  msgRow.className = "message-row";
  const content = document.createElement("div");
  content.className = `message-content ${isYou ? "you" : ""}`;
  content.textContent = text;
  
  const ts = document.createElement("div");
  ts.className = "timestamp inline-ts";
  ts.textContent = formatTimestamp(new Date());

  msgRow.appendChild(content);
  msgRow.appendChild(ts);
  wrapper.appendChild(msgRow);
  chat.appendChild(wrapper);
  scheduleScroll();
  return id;
}

// ── Mobile Keyboard / Visual Viewport Fix ─────────────────────────────────────
const chatInputBar = document.querySelector(".chat-input");
function updateViewportOffsets() {
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  const kbH = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  chatInputBar.style.bottom = kbH + "px";
  if (gifPickerOpen) gifPicker.style.bottom = (kbH + chatInputBar.offsetHeight + 8) + "px";
  scheduleScroll();
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportOffsets);
  window.visualViewport.addEventListener("scroll", updateViewportOffsets);
}

// ── Core Actions ─────────────────────────────────────────────────────────────
function sendMessage() {
  const msg = messageInput.value.trim();
  if (!msg || !partnerConnected) return;
  const id = addMessage(msg, true, null, replyTo);
  socket.emit("message", { text: msg, messageId: id, replyTo });
  messageInput.value = "";
  clearReply();
  messageInput.focus();
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

saveNameBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (name.length >= 2) socket.emit("setName", name);
  else nameError.textContent = "სახელი მოკლეა!";
});

nextBtn.addEventListener("click", () => {
  socket.emit("findPartner");
  clearChat();
  addSearchingMessage();
});

// ── Socket Events ────────────────────────────────────────────────────────────
socket.on("nameAccepted", (name) => {
  userName = name;
  nameModal.style.display = "none";
  document.getElementById("userNameDisplay").textContent = `👤 ${name}`;
  document.getElementById("userNameDisplay").style.display = "block";
  addSearchingMessage();
  socket.emit("findPartner");
});

socket.on("partnerFound", (p) => {
  clearChat();
  partnerName = p.name;
  partnerConnected = true;
  addSystemMessage(`პარტნიორი ნაპოვნია: ${p.name}`);
  setInputsEnabled(true);
  playNotification("partnerFound");
});

socket.on("message", (msg) => {
  addMessage(msg.text, false, msg.messageId, msg.replyTo);
  playNotification("message");
});

socket.on("partnerDisconnected", () => {
  addDisconnectMessage("პარტნიორმა დაგტოვათ 😟");
  partnerConnected = false;
  setInputsEnabled(false);
});

function setInputsEnabled(e) {
  messageInput.disabled = !e;
  sendBtn.disabled = !e;
  gifBtn.disabled = !e;
  questionBtn.disabled = !e;
}

function clearReply() {
  replyTo = null;
  replyPreview.style.display = "none";
}

function clearChat() { chat.innerHTML = ""; }
