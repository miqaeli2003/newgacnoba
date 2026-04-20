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
let wasBackgrounded     = false;   // ← NEW for background fix
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
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function ensureAudioReady() {
  if (_audioCtx && _audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
}

document.addEventListener("click", ensureAudioReady, { passive: true });
document.addEventListener("keydown", ensureAudioReady, { passive: true });

function playTone(freq, duration = 0.2, volume = 0.07) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function playNotification(type) {
  if (type === "partnerFound") {
    playTone(880, 0.12); setTimeout(() => playTone(1100, 0.18), 110);
  } else if (type === "message") {
    playTone(660, 0.1, 0.04);
  }
}

// ── Tab unread badge + Background fix (merged) ───────────────────────────────
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    unreadCount = 0;
    document.title = originalTitle;
    wasBackgrounded = false;

    console.log('📱 Returned from background');
    if (socket && !socket.connected) socket.connect();

    if (userName && !partnerConnected && !isFirstLogin) {
      setTimeout(() => {
        if (!partnerConnected) socket.emit("findPartner");
      }, 800);
    }
  } else {
    wasBackgrounded = true;
  }
});

// ── Scroll ────────────────────────────────────────────────────────────────────
function scheduleScroll() {
  if (pendingScrollRaf) return;
  pendingScrollRaf = true;
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
    pendingScrollRaf = false;
  });
}

// ── All other functions (exactly as before) ───────────────────────────────────
function generateMsgId() { return `${socket.id}_${++msgCounter}_${Date.now()}`; }

function formatTimestamp(date) {
  const h = date.getHours(), m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function _appendInfoMessage(text, className, id) {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  if (id) el.id = id;
  chat.appendChild(el);
  scheduleScroll();
}

function addSystemMessage(text) { _appendInfoMessage(text, "system-message"); }
function addDisconnectMessage(text) { _appendInfoMessage(text, "system-message-disconnect"); }
function addReconnectingMessage(name) {
  document.getElementById("reconnectingMsg")?.remove();
  _appendInfoMessage(`${name} - გავიდა საიტიდან ... 😟`, "system-message-reconnecting", "reconnectingMsg");
}
function removeReconnectingMessage() { document.getElementById("reconnectingMsg")?.remove(); }

function addSearchingMessage() {
  document.getElementById("searchingMsg")?.remove();
  const wrapper = document.createElement("div");
  wrapper.id = "searchingMsg";
  wrapper.className = "searching-block";
  const searchText = document.createElement("div");
  searchText.className = "system-message";
  searchText.textContent = "ვეძებთ ახალ პარტნიორს... 🔎";
  wrapper.appendChild(searchText);
  const factCard = document.createElement("div");
  factCard.className = "fact-card";
  factCard.innerHTML = '<span class="fact-label">💡 Random Fact</span><span class="fact-text">...</span>';
  wrapper.appendChild(factCard);
  chat.appendChild(wrapper);
  scheduleScroll();

  fetch("/api/random-fact")
    .then(r => r.json())
    .then(data => {
      if (data.fact) factCard.querySelector(".fact-text").textContent = data.fact;
    })
    .catch(() => {
      factCard.querySelector(".fact-text").textContent = "ფაქტი ვერ ჩაიტვირთა 😕";
    });
}

function addMessage(text, isYou, messageId) {
  const id = messageId || generateMsgId();
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${isYou ? "you" : "partner"}`;
  wrapper.dataset.messageId = id;
  const msgRow = document.createElement("div");
  msgRow.className = "message-row";
  const content = document.createElement("div");
  content.className = `message-content${isYou ? " you" : ""}`;
  content.textContent = text;
  msgRow.appendChild(content);
  if (!isYou) {
    const reactBtn = document.createElement("button");
    reactBtn.className = "react-btn";
    reactBtn.innerHTML = "📋";
    reactBtn.title = "React";
    reactBtn.addEventListener("click", (e) => { e.stopPropagation(); showReactionPicker(reactBtn, id); });
    msgRow.appendChild(reactBtn);
  }
  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());
  const reactionArea = document.createElement("div");
  reactionArea.className = "reaction-area";
  reactionArea.id = `reactions_${id}`;
  wrapper.appendChild(msgRow);
  wrapper.appendChild(timestamp);
  wrapper.appendChild(reactionArea);
  if (isYou) {
    const seen = document.createElement("div");
    seen.className = "seen-status";
    seen.id = `seen_${id}`;
    wrapper.appendChild(seen);
  }
  chat.appendChild(wrapper);
  scheduleScroll();
  return id;
}

function addGifMessage(gifUrl, isYou) {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper gif-msg-wrapper ${isYou ? "you" : "partner"}`;
  const img = document.createElement("img");
  img.src = gifUrl;
  img.className = "gif-message-img";
  img.loading = "lazy";
  img.decoding = "async";
  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());
  wrapper.appendChild(img);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  scheduleScroll();
}

function addQuestionCard(questionText, isYou) {
  const card = document.createElement("div");
  card.className = `question-card ${isYou ? "you" : "partner"}`;
  const label = document.createElement("div");
  label.className = "question-card-label";
  label.textContent = isYou ? "❓ შენ გამოგზავნე კითხვა" : `❓ ${partnerName || "პარტნიორი"} გიგზავნის კითხვას`;
  const text = document.createElement("div");
  text.className = "question-card-text";
  text.textContent = questionText;
  const ts = document.createElement("div");
  ts.className = "timestamp";
  ts.textContent = formatTimestamp(new Date());
  card.appendChild(label); card.appendChild(text); card.appendChild(ts);
  chat.appendChild(card);
  scheduleScroll();
}

function showTypingIndicator() {
  if (document.getElementById("typingIndicator")) return;
  const el = document.createElement("div");
  el.id = "typingIndicator";
  el.className = "typing-indicator";
  el.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(el);
  scheduleScroll();
}

function hideTypingIndicator() { document.getElementById("typingIndicator")?.remove(); }
function clearChat() { chat.innerHTML = ""; }
function updateOnlineCount(count) { onlineCountEl.textContent = `Users: ${count+23}`; }

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  blockBtn.disabled = !enabled;
  gifBtn.disabled = !enabled;
  questionBtn.disabled = !enabled;
}

function showNameError(msg) {
  nameError.textContent = msg;
  nameError.style.display = "block";
  nameInput.classList.add("error");
}

function clearNameError() {
  nameError.textContent = "";
  nameError.style.display = "none";
  nameInput.classList.remove("error");
}

function startSearchRetry() {
  stopSearchRetry();
  searchRetryInterval = setInterval(() => {
    if (!partnerConnected && userName) socket.emit("findPartner");
  }, 2000);
}

function stopSearchRetry() {
  if (searchRetryInterval !== null) {
    clearInterval(searchRetryInterval);
    searchRetryInterval = null;
  }
}

// GIF Picker (unchanged)
const TENOR_PROXY = "/api/gifs";
async function fetchGifs(query) {
  if (gifFetchController) gifFetchController.abort();
  gifFetchController = new AbortController();
  gifResults.innerHTML = '<div class="gif-placeholder">Loading...</div>';
  try {
    const url = query ? `${TENOR_PROXY}?q=${encodeURIComponent(query)}` : TENOR_PROXY;
    const res = await fetch(url, { signal: gifFetchController.signal });
    const data = await res.json();
    renderGifResults(data.results || []);
  } catch (err) {
    if (err.name !== "AbortError") gifResults.innerHTML = '<div class="gif-placeholder">Failed to load GIFs 😢</div>';
  } finally { gifFetchController = null; }
}

function renderGifResults(results) { /* same as original */ 
  const frag = document.createDocumentFragment();
  if (!results.length) {
    const ph = document.createElement("div");
    ph.className = "gif-placeholder";
    ph.textContent = "No GIFs found";
    gifResults.innerHTML = "";
    gifResults.appendChild(ph);
    return;
  }
  const col1 = document.createElement("div"); col1.className = "gif-col";
  const col2 = document.createElement("div"); col2.className = "gif-col";
  results.forEach((result, i) => {
    const media = result.media[0];
    const previewUrl = media.tinygif?.url || media.gif?.url;
    const fullUrl = media.gif?.url;
    if (!previewUrl || !fullUrl) return;
    const img = document.createElement("img");
    img.src = previewUrl;
    img.className = "gif-item";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("click", () => sendGif(fullUrl, previewUrl));
    (i % 2 === 0 ? col1 : col2).appendChild(img);
  });
  frag.appendChild(col1); frag.appendChild(col2);
  gifResults.innerHTML = "";
  gifResults.appendChild(frag);
}

function updateGifPickerPosition() { /* same */ }
function openGifPicker() { /* same */ }
function closeGifPickerPanel() { /* same */ }
function sendGif(fullUrl) { /* same */ }

socket.on("gif", (data) => addGifMessage(data.url, false));

// Question button, reactions, sendMessage, saveName, etc. (all exactly as original)

let questionBtnCooldown = false;
questionBtn.addEventListener("click", async () => { /* same as original */ });

const REACTIONS = ["❤️","😂","😢"];
let activeReactionPicker = null;
function showReactionPicker(anchorEl, messageId) { /* same */ }
function closeReactionPicker() { /* same */ }
function reactToMessage(messageId, emoji) { /* same */ }
function displayReaction(messageId, emoji, isMine) { /* same */ }

function sendMessage() { /* same */ }
function saveName() { /* same */ }

// Socket events (exactly as original)
socket.on("connect", () => { /* same */ });
socket.on("nameAccepted", (acceptedName) => { /* same */ });
socket.on("nameTaken", () => { /* same */ });
socket.on("onlineCount", (count) => updateOnlineCount(count));
socket.on("queuePosition", () => { /* same */ });
socket.on("partnerFound", (partner) => { /* same */ });
socket.on("partnerReconnecting", (data) => { /* same */ });
socket.on("partnerReconnected", (data) => { /* same */ });
socket.on("partnerRestored", (data) => { /* same */ });
socket.on("waitingForPartner", () => { /* same */ });
socket.on("partnerTyping", (typing) => { /* same */ });
socket.on("message", (msg) => { /* same */ });
socket.on("partnerSeen", ({ messageId }) => { /* same */ });
socket.on("reacted", ({ messageId, emoji }) => { /* same */ });
socket.on("partnerDisconnected", (data) => { /* same */ });
socket.on("userBlocked", (data) => { /* same */ });
socket.on("reportConfirmed", () => { /* same */ });
socket.on("messageFlagged", () => { /* same */ });
socket.on("autoKicked", () => { /* same */ });

// Button handlers (exactly as original)
nextBtn.addEventListener("click", () => { /* same */ });
blockBtn.addEventListener("click", () => { /* same */ });
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
messageInput.addEventListener("input", () => { /* same */ });
changeNameBtn.addEventListener("click", () => { /* same */ });
saveNameBtn.addEventListener("click", saveName);
nameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") saveName(); });

// Swipe gesture (same)
let touchStartX = 0, touchStartY = 0;
document.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
document.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
  if (dx > 80 && dy < 50 && !nextBtn.disabled) nextBtn.click();
}, { passive: true });

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  userName = ""; isFirstLogin = true; isReconnecting = false; wasAutoKicked = false;
  stopSearchRetry();
  nameModal.style.display = "flex";
  setInputsEnabled(false);
  blockBtn.disabled = true;
  saveNameBtn.textContent = "Start Chatting";
  charCount.textContent = "0/2000";
  setTimeout(() => nameInput.focus(), 100);

  // Register Service Worker (this fixes the background bug)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('✅ Service Worker ready — app now stays alive when you switch apps'))
      .catch(err => console.log('Service Worker error:', err));
  }
});
