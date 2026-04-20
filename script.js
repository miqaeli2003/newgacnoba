const socket = io({
  transports: ["websocket", "polling"], // polling fallback helps mobile resume
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
});

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

// ── Mobile background / foreground reconnection ───────────────────────────────
// When the user switches apps on mobile, the browser suspends the tab and the
// WebSocket heartbeat stops. On return, we force a reconnect if the socket
// dropped while we were in the background.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    // Clear unread badge
    unreadCount    = 0;
    document.title = originalTitle;

    // Reconnect if the socket went away while backgrounded
    if (!wasAutoKicked && !socket.connected) {
      socket.connect();
    }
  }
});

// Also fires when the browser tab/window regains focus (covers desktop too)
window.addEventListener("focus", () => {
  if (!wasAutoKicked && !socket.connected) {
    socket.connect();
  }
}, { passive: true });

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
function addSearchingMessage()             { _appendInfoMessage("ვეძებთ ახალ პარტნიორს...", "system-message", "searchingMsg"); }

function addMessage(text, isYou, messageId) {
  const id = messageId || generateMsgId();

  const wrapper         = document.createElement("div");
  wrapper.className     = `message-wrapper ${isYou ? "you" : "partner"}`;
  wrapper.dataset.messageId = id;

  const msgRow      = document.createElement("div");
  msgRow.className  = "message-row";

  const content     = document.createElement("div");
  content.className = `message-content${isYou ? " you" : ""}`;
  content.textContent = text;
  msgRow.appendChild(content);

  if (!isYou) {
    const reactBtn     = document.createElement("button");
    reactBtn.className = "react-btn";
    reactBtn.innerHTML = "📋";
    reactBtn.title     = "React";
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showReactionPicker(reactBtn, id);
    });
    msgRow.appendChild(reactBtn);
  }

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  const reactionArea    = document.createElement("div");
  reactionArea.className = "reaction-area";
  reactionArea.id       = `reactions_${id}`;

  wrapper.appendChild(msgRow);
  wrapper.appendChild(timestamp);
  wrapper.appendChild(reactionArea);

  // Seen indicator — only for messages you sent
  if (isYou) {
    const seen       = document.createElement("div");
    seen.className   = "seen-status";
    seen.id          = `seen_${id}`;
    seen.textContent = "";
    wrapper.appendChild(seen);
  }

  chat.appendChild(wrapper);
  scheduleScroll();
  return id;
}

function addGifMessage(gifUrl, isYou) {
  const wrapper     = document.createElement("div");
  wrapper.className = `message-wrapper gif-msg-wrapper ${isYou ? "you" : "partner"}`;

  const img       = document.createElement("img");
  img.src         = gifUrl;
  img.className   = "gif-message-img";
  img.loading     = "lazy";
  img.decoding    = "async";

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  wrapper.appendChild(img);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  scheduleScroll();
}

function showTypingIndicator() {
  if (document.getElementById("typingIndicator")) return;
  const el      = document.createElement("div");
  el.id         = "typingIndicator";
  el.className  = "typing-indicator";
  el.innerHTML  = "<span></span><span></span><span></span>";
  chat.appendChild(el);
  scheduleScroll();
}

function hideTypingIndicator() {
  document.getElementById("typingIndicator")?.remove();
}

function clearChat() { chat.innerHTML = ""; }

function updateOnlineCount(count) {
  onlineCountEl.textContent = `Users: ${count+23}`;
}

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled      = !enabled;
  blockBtn.disabled     = !enabled;
  gifBtn.disabled       = !enabled;
}

function showNameError(msg) {
  nameError.textContent   = msg;
  nameError.style.display = "block";
  nameInput.classList.add("error");
}

function clearNameError() {
  nameError.textContent   = "";
  nameError.style.display = "none";
  nameInput.classList.remove("error");
}

// ── Search retry ──────────────────────────────────────────────────────────────
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

// ── GIF Picker ────────────────────────────────────────────────────────────────
const TENOR_PROXY = "/api/gifs"; // key stays on the server

async function fetchGifs(query) {
  if (gifFetchController) gifFetchController.abort();
  gifFetchController = new AbortController();
  gifResults.innerHTML = '<div class="gif-placeholder">Loading...</div>';

  try {
    const url  = query ? `${TENOR_PROXY}?q=${encodeURIComponent(query)}` : TENOR_PROXY;
    const res  = await fetch(url, { signal: gifFetchController.signal });
    const data = await res.json();
    renderGifResults(data.results || []);
  } catch (err) {
    if (err.name !== "AbortError") {
      gifResults.innerHTML = '<div class="gif-placeholder">Failed to load GIFs 😢</div>';
    }
  } finally {
    gifFetchController = null;
  }
}

function renderGifResults(results) {
  const frag = document.createDocumentFragment();
  if (!results.length) {
    const ph = document.createElement("div");
    ph.className = "gif-placeholder";
    ph.textContent = "No GIFs found";
    gifResults.innerHTML = "";
    gifResults.appendChild(ph);
    return;
  }
  const col1 = document.createElement("div");
  const col2 = document.createElement("div");
  col1.className = "gif-col";
  col2.className = "gif-col";
  results.forEach((result, i) => {
    const media      = result.media[0];
    const previewUrl = media.tinygif?.url || media.gif?.url;
    const fullUrl    = media.gif?.url;
    if (!previewUrl || !fullUrl) return;
    const img        = document.createElement("img");
    img.src          = previewUrl;
    img.className    = "gif-item";
    img.loading      = "lazy";
    img.decoding     = "async";
    img.addEventListener("click", () => sendGif(fullUrl, previewUrl));
    (i % 2 === 0 ? col1 : col2).appendChild(img);
  });
  frag.appendChild(col1);
  frag.appendChild(col2);
  gifResults.innerHTML = "";
  gifResults.appendChild(frag);
}

function updateGifPickerPosition() {
  if (!gifPickerOpen || !window.visualViewport) return;
  const vv = window.visualViewport;
  const keyboardH = window.innerHeight - vv.height - vv.offsetTop;
  gifPicker.style.bottom = (72 + Math.max(0, keyboardH)) + "px";
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateGifPickerPosition, { passive: true });
  window.visualViewport.addEventListener("scroll", updateGifPickerPosition, { passive: true });
}

function openGifPicker() {
  gifPicker.style.display = "flex";
  gifPickerOpen = true;
  gifSearch.value = "";
  gifSearch.focus();
  updateGifPickerPosition();
  fetchGifs("");
}

function closeGifPickerPanel() {
  gifPicker.style.display = "none";
  gifPicker.style.bottom  = ""; // reset Visual Viewport override
  gifPickerOpen = false;
}

gifBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  gifPickerOpen ? closeGifPickerPanel() : openGifPicker();
});

gifPickerClose.addEventListener("click", (e) => { e.stopPropagation(); closeGifPickerPanel(); });

gifSearch.addEventListener("input", () => {
  clearTimeout(gifSearchTimer);
  gifSearchTimer = setTimeout(() => fetchGifs(gifSearch.value.trim()), 400);
});

gifSearch.addEventListener("keydown", (e) => e.stopPropagation());

document.addEventListener("click", (e) => {
  if (gifPickerOpen && !gifPicker.contains(e.target) && e.target !== gifBtn) {
    closeGifPickerPanel();
  }
});

function sendGif(fullUrl, previewUrl) {
  if (!partnerConnected) return;
  socket.emit("gif", { url: fullUrl, preview: previewUrl });
  addGifMessage(fullUrl, true);
  closeGifPickerPanel();
}

socket.on("gif", (data) => addGifMessage(data.url, false));

// ── Reactions ─────────────────────────────────────────────────────────────────
const REACTIONS          = ["❤️","😂","😢"];
let activeReactionPicker = null;

function showReactionPicker(anchorEl, messageId) {
  closeReactionPicker();
  const picker      = document.createElement("div");
  picker.className  = "reaction-picker";
  const frag = document.createDocumentFragment();
  REACTIONS.forEach(emoji => {
    const btn       = document.createElement("button");
    btn.className   = "reaction-emoji-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reactToMessage(messageId, emoji);
      closeReactionPicker();
    });
    frag.appendChild(btn);
  });
  picker.appendChild(frag);
  document.body.appendChild(picker);
  activeReactionPicker = picker;
  requestAnimationFrame(() => {
    const rect = anchorEl.getBoundingClientRect();
    const pw = picker.offsetWidth, ph = picker.offsetHeight;
    let left = rect.left, top = rect.top - ph - 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top < 4) top = rect.bottom + 8;
    picker.style.cssText += `left:${left}px;top:${top}px;opacity:1;transform:scale(1)`;
  });
}

function closeReactionPicker() {
  activeReactionPicker?.remove();
  activeReactionPicker = null;
}

document.addEventListener("click", () => closeReactionPicker());

function reactToMessage(messageId, emoji) {
  socket.emit("react", { messageId, emoji });
  displayReaction(messageId, emoji, true);
}

function displayReaction(messageId, emoji, isMine) {
  const area = document.getElementById(`reactions_${messageId}`);
  if (!area) return;
  const cls = isMine ? "reaction-mine" : "reaction-partner";
  let pill   = area.querySelector(`.${cls}`);
  if (pill) {
    pill.classList.remove("reaction-pop");
    void pill.offsetWidth;
    pill.textContent = emoji;
    pill.classList.add("reaction-pop");
  } else {
    pill = document.createElement("span");
    pill.className   = `reaction-pill ${cls} reaction-pop`;
    pill.textContent = emoji;
    area.appendChild(pill);
  }
}

// ── Message sending ───────────────────────────────────────────────────────────
function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || !partnerConnected || !userName) return;
  const msgId = generateMsgId();
  addMessage(message, true, msgId);
  socket.emit("message", { text: message, messageId: msgId });
  messageInput.value = "";
  charCount.textContent = "0/2000";
  charCount.classList.remove("warning");
}

// ── Name modal ────────────────────────────────────────────────────────────────
function saveName() {
  const name = nameInput.value.trim();
  if (!name)            { showNameError("შეიყვანეთ სახელი ..."); return; }
  if (name.length < 2)  { showNameError("სახელი უნდა შედგებოდეს მინიმუ ორი სიმბოლოსგან!"); return; }
  if (name.length > 20) { showNameError("20 სიმბოლოზე მეტი ვერ იქნება სახელი ! "); return; }
  clearNameError();
  saveNameBtn.disabled    = true;
  saveNameBtn.textContent = "Checking...";
  socket.emit("setName", name);
}

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on("connect", () => {
  if (wasAutoKicked) return;
  if (userName && !isFirstLogin) {
    isReconnecting = true;
    socket.emit("setName", userName);
  }
});

socket.on("nameAccepted", (acceptedName) => {
  userName                = acceptedName;
  nameModal.style.display = "none";
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = "Start Chatting";
  clearNameError();

  // Show the username in the top bar
  const displayEl = document.getElementById("userNameDisplay");
  if (displayEl) {
    displayEl.textContent = `👤 ${acceptedName}`;
    displayEl.style.display = "block";
  }

  if (isFirstLogin) {
    isFirstLogin = false;
    clearChat();
    addSearchingMessage();
    socket.emit("findPartner");
    startSearchRetry();
  } else if (isReconnecting) {
    isReconnecting   = false;
    partnerConnected = false;
    partnerName      = "";
    setInputsEnabled(false);
    hideTypingIndicator();
    closeGifPickerPanel();
    clearChat();
    // Don't auto-search — user was gone too long, let them press Search manually
    addDisconnectMessage("კავშირი გაწყდა. ახალი პარტნიორის საპოვნელად დააჭირეთ \"ძებნა\" 🔎");
  }
  // else: mid-session name change — no extra action
});

socket.on("nameTaken", () => {
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = isFirstLogin ? "Start Chatting" : "Save Name";
  isReconnecting          = false;
  showNameError("ეს სახელი დაკავებულია. სხვა აირჩიეთ. 😟 ");
  nameInput.focus();
  nameInput.select();
});

socket.on("onlineCount", (count) => updateOnlineCount(count));

socket.on("queuePosition", ({ position, total }) => {
  const msg = document.getElementById("searchingMsg");
  if (msg) msg.textContent = `ვეძებთ ახალ პარტნიორს... 🔎 `;
});

socket.on("partnerFound", (partner) => {
  stopSearchRetry();
  clearChat();
  partnerName      = partner.name || "Anonymous";
  partnerConnected = true;
  addSystemMessage(`გილოცავთ პარტნიორი ნაპოვნია 🥳 : ${partnerName}`);
  setInputsEnabled(true);
  playNotification("partnerFound");
  incrementUnread();
});

// Reconnect grace-period events
socket.on("partnerReconnecting", (data) => {
  setInputsEnabled(false);
  hideTypingIndicator();
  closeGifPickerPanel();
  addReconnectingMessage(data.name || "Partner");
});

socket.on("partnerReconnected", (data) => {
  removeReconnectingMessage();
  partnerName      = data.name || partnerName;
  partnerConnected = true;
  setInputsEnabled(true);
  addSystemMessage(`${data.name} reconnected! 🎉`);
  playNotification("partnerFound");
});

// Own socket restored to previous partner after reconnecting
socket.on("partnerRestored", (data) => {
  stopSearchRetry();
  clearChat();
  partnerName      = data.name || "Anonymous";
  partnerConnected = true;
  addSystemMessage(`You were reconnected with ${partnerName}!`);
  setInputsEnabled(true);
  playNotification("partnerFound");
});

socket.on("waitingForPartner", () => {
  clearChat();
  addSearchingMessage();
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  startSearchRetry();
});

socket.on("partnerTyping", (typing) => {
  typing ? showTypingIndicator() : hideTypingIndicator();
});

socket.on("message", (msg) => {
  hideTypingIndicator();
  addMessage(msg.text, false, msg.messageId);
  playNotification("message");
  incrementUnread();
  // Tell sender we received/read the message
  if (msg.messageId) socket.emit("seen", { messageId: msg.messageId });
});

socket.on("partnerSeen", ({ messageId }) => {
  const el = document.getElementById(`seen_${messageId}`);
  if (el) { el.textContent = ""; el.classList.add("seen"); }
});

socket.on("reacted", ({ messageId, emoji }) => {
  displayReaction(messageId, emoji, false);
});

socket.on("partnerDisconnected", (data) => {
  removeReconnectingMessage();
  stopSearchRetry();
  hideTypingIndicator();
  addDisconnectMessage(`${data.name || "Anonymous"} -მ სამწუხაროდ დაგტოვათ 😟 `);
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
});

socket.on("userBlocked", (data) => {
  stopSearchRetry();
  clearChat();
  addSystemMessage(`You blocked ${data.name}. Searching for a new partner...`);
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
  addSearchingMessage();
  startSearchRetry();
});

socket.on("reportConfirmed", () => {
  addSystemMessage("Report submitted. Thank you.");
});

socket.on("messageFlagged", () => {
  const notice       = document.createElement("div");
  notice.className   = "system-message";
  notice.textContent = "Your message was flagged and not sent.";
  chat.appendChild(notice);
  scheduleScroll();
  setTimeout(() => notice.remove(), 3000);
});

socket.on("autoKicked", () => {
  wasAutoKicked    = true;
  partnerConnected = false;
  partnerName      = "";
  stopSearchRetry();
  clearChat();
  setInputsEnabled(false);
  addDisconnectMessage("You have been removed due to repeated violations.");
  socket.disconnect();
});

// ── Button handlers ───────────────────────────────────────────────────────────

nextBtn.addEventListener("click", () => {
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1000);
  hideTypingIndicator();
  clearChat();
  addSearchingMessage();
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
  socket.emit("next");
  startSearchRetry();
});

blockBtn.addEventListener("click", () => {
  if (!partnerConnected || !partnerName) return;
  const confirmed = confirm(
    `Block "${partnerName}"? თქვენ ვეღარ შეხვდებით ამ იუზერს ბლოკის შემდეგ. 😡 `
  );
  if (confirmed) socket.emit("blockUser");
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

messageInput.addEventListener("input", () => {
  // Character counter
  const len = messageInput.value.length;
  charCount.textContent = `${len}/2000`;
  charCount.classList.toggle("warning", len > 1800);

  // Typing indicator
  if (!partnerConnected) return;
  if (!isTyping) { isTyping = true; socket.emit("typing", true); }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit("typing", false);
  }, 1500);
});

changeNameBtn.addEventListener("click", () => {
  nameInput.value         = userName;
  saveNameBtn.textContent = "Save Name";
  clearNameError();
  nameModal.style.display = "flex";
  setTimeout(() => nameInput.focus(), 50);
});

saveNameBtn.addEventListener("click", saveName);
nameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") saveName(); });

// ── Swipe-right gesture → Next (mobile) ──────────────────────────────────────
let touchStartX = 0, touchStartY = 0;

document.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
  // Swipe right > 80 px, mostly horizontal, Next not disabled
  if (dx > 80 && dy < 50 && !nextBtn.disabled) {
    nextBtn.click();
  }
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
});
