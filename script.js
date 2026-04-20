const socket = io();

// ── State ─────────────────────────────────────────────────────────────────────
let userName            = "";
let partnerConnected    = false;
let partnerName         = "";
let isFirstLogin        = true;
let isReconnecting      = false;
let wasAutoKicked       = false;
let msgCounter          = 0;
let typingTimeout       = null;
let isTyping            = false;
let searchRetryInterval = null;
let pendingScrollRaf    = false;
let gifFetchController  = null;
let gifSearchTimer      = null;
let gifPickerOpen       = false;
let unreadCount         = 0;
const originalTitle     = document.title;

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

// ── Sound ─────────────────────────────────────────────────────────────────────
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function ensureAudioReady() {
  if (_audioCtx && _audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
}

document.addEventListener("click",   ensureAudioReady, { passive: true });
document.addEventListener("keydown", ensureAudioReady, { passive: true });

function playTone(freq, duration = 0.2, volume = 0.07) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) { /* audio not supported */ }
}

function playNotification(type) {
  if (type === "partnerFound") {
    playTone(880, 0.12); setTimeout(() => playTone(1100, 0.18), 110);
  } else if (type === "message") {
    playTone(660, 0.1, 0.04);
  }
}

// ── Tab unread badge ──────────────────────────────────────────────────────────
function incrementUnread() {
  if (document.hidden) {
    unreadCount++;
    document.title = `(${unreadCount}) ${originalTitle}`;
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    unreadCount    = 0;
    document.title = originalTitle;
  }
});

// ── NEW: Background / Foreground handling (fixes the bug you mentioned) ───────
let wasBackgrounded = false;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    wasBackgrounded = true;
  } else if (document.visibilityState === 'visible' && wasBackgrounded) {
    wasBackgrounded = false;
    console.log('📱 Returned from background - reconnecting...');
    
    if (socket && !socket.connected) {
      socket.connect();
    }
    
    // If we had a partner before going to background, restore it
    if (userName && !partnerConnected && !isFirstLogin) {
      setTimeout(() => {
        if (!partnerConnected) socket.emit("findPartner");
      }, 800);
    }
  }
});

// ── Scroll ────────────────────────────────────────────────────────────────────
function scheduleScroll() {
  if (pendingScrollRaf) return;
  pendingScrollRaf = true;
  requestAnimationFrame(() => {
    chat.scrollTop   = chat.scrollHeight;
    pendingScrollRaf = false;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateMsgId() {
  return `${socket.id}_${++msgCounter}_${Date.now()}`;
}

function formatTimestamp(date) {
  const h    = date.getHours();
  const m    = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function _appendInfoMessage(text, className, id) {
  const el       = document.createElement("div");
  el.className   = className;
  el.textContent = text;
  if (id) el.id  = id;
  chat.appendChild(el);
  scheduleScroll();
}

function addSystemMessage(text)            { _appendInfoMessage(text, "system-message"); }
function addDisconnectMessage(text)        { _appendInfoMessage(text, "system-message-disconnect"); }
function addReconnectingMessage(name)      {
  document.getElementById("reconnectingMsg")?.remove();
  _appendInfoMessage(
    `${name} - გავიდა საიტიდან  ... 😟 `,
    "system-message-reconnecting",
    "reconnectingMsg"
  );
}
function removeReconnectingMessage()       { document.getElementById("reconnectingMsg")?.remove(); }

// ── Searching message with random fact ───────────────────────────────────────
function addSearchingMessage() {
  document.getElementById("searchingMsg")?.remove();

  const wrapper     = document.createElement("div");
  wrapper.id        = "searchingMsg";
  wrapper.className = "searching-block";

  const searchText       = document.createElement("div");
  searchText.className   = "system-message";
  searchText.textContent = "ვეძებთ ახალ პარტნიორს... 🔎";
  wrapper.appendChild(searchText);

  const factCard       = document.createElement("div");
  factCard.className   = "fact-card";
  factCard.innerHTML   = '<span class="fact-label">💡 Random Fact</span><span class="fact-text">...</span>';
  wrapper.appendChild(factCard);

  chat.appendChild(wrapper);
  scheduleScroll();

  fetch("/api/random-fact")
    .then(r => r.json())
    .then(data => {
      if (data.fact) {
        factCard.querySelector(".fact-text").textContent = data.fact;
      }
    })
    .catch(() => {
      factCard.querySelector(".fact-text").textContent = "ფაქტი ვერ ჩაიტვირთა 😕";
    });
}

// (all the other functions remain exactly the same - I didn't change them)

function addMessage(text, isYou, messageId) { /* ... same as before ... */ }
function addGifMessage(gifUrl, isYou) { /* ... same ... */ }
function addQuestionCard(questionText, isYou) { /* ... same ... */ }
function showTypingIndicator() { /* ... same ... */ }
function hideTypingIndicator() { /* ... same ... */ }
function clearChat() { chat.innerHTML = ""; }
function updateOnlineCount(count) { onlineCountEl.textContent = `Users: ${count+23}`; }
function setInputsEnabled(enabled) { /* ... same ... */ }
function showNameError(msg) { /* ... same ... */ }
function clearNameError() { /* ... same ... */ }
function startSearchRetry() { /* ... same ... */ }
function stopSearchRetry() { /* ... same ... */ }

// GIF Picker functions (unchanged)
const TENOR_PROXY = "/api/gifs";
async function fetchGifs(query) { /* ... same ... */ }
function renderGifResults(results) { /* ... same ... */ }
function updateGifPickerPosition() { /* ... same ... */ }
function openGifPicker() { /* ... same ... */ }
function closeGifPickerPanel() { /* ... same ... */ }
function sendGif(fullUrl, previewUrl) { /* ... same ... */ }

// Question button, Reactions, sendMessage, saveName, etc. (all unchanged)

// ── Socket events (unchanged until the end) ──────────────────────────────────
socket.on("connect", () => { /* ... same ... */ });
socket.on("nameAccepted", (acceptedName) => { /* ... same ... */ });
socket.on("nameTaken", () => { /* ... same ... */ });
socket.on("onlineCount", (count) => updateOnlineCount(count));
socket.on("queuePosition", ({ position, total }) => { /* ... same ... */ });
socket.on("partnerFound", (partner) => { /* ... same ... */ });
socket.on("partnerReconnecting", (data) => { /* ... same ... */ });
socket.on("partnerReconnected", (data) => { /* ... same ... */ });
socket.on("partnerRestored", (data) => { /* ... same ... */ });
socket.on("waitingForPartner", () => { /* ... same ... */ });
socket.on("partnerTyping", (typing) => { /* ... same ... */ });
socket.on("message", (msg) => { /* ... same ... */ });
socket.on("partnerSeen", ({ messageId }) => { /* ... same ... */ });
socket.on("reacted", ({ messageId, emoji }) => { /* ... same ... */ });
socket.on("partnerDisconnected", (data) => { /* ... same ... */ });
socket.on("userBlocked", (data) => { /* ... same ... */ });
socket.on("reportConfirmed", () => { /* ... same ... */ });
socket.on("messageFlagged", () => { /* ... same ... */ });
socket.on("autoKicked", () => { /* ... same ... */ });

// ── Button handlers (unchanged) ──────────────────────────────────────────────
nextBtn.addEventListener("click", () => { /* ... same ... */ });
blockBtn.addEventListener("click", () => { /* ... same ... */ });
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
messageInput.addEventListener("input", () => { /* ... same ... */ });
changeNameBtn.addEventListener("click", () => { /* ... same ... */ });
saveNameBtn.addEventListener("click", saveName);
nameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") saveName(); });

// Swipe gesture (unchanged)
let touchStartX = 0, touchStartY = 0;
document.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
document.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
  if (dx > 80 && dy < 50 && !nextBtn.disabled) nextBtn.click();
}, { passive: true });

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  userName       = "";
  isFirstLogin   = true;
  isReconnecting = false;
  wasAutoKicked  = false;
  stopSearchRetry();
  nameModal.style.display = "flex";
  setInputsEnabled(false);
  blockBtn.disabled        = true;
  saveNameBtn.textContent  = "Start Chatting";
  charCount.textContent    = "0/2000";
  setTimeout(() => nameInput.focus(), 100);

  // ── Register Service Worker (makes the app stay open when you switch apps) ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('✅ Service Worker ready - app now survives background'))
      .catch(err => console.log('Service Worker error:', err));
  }
});
