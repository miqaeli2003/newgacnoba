// ── Config ────────────────────────────────────────────────────────────────────
// Tenor public test key — works for development.
// For production, get a free key at: https://developers.google.com/tenor/guides/quickstart
const TENOR_KEY = "LIVDSRZULELA";
const EMOJIS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

// ── State ─────────────────────────────────────────────────────────────────────
const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true;

// Stores message metadata for reactions and replies
// key: messageId, value: { element, reactionsDiv, reactions, myReaction, partnerReaction, data, isYou }
const messageStore = {};

// Current reply target
let replyingTo = null;

// GIF search debounce
let gifSearchTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const chat             = document.getElementById("chat");
const messageInput     = document.getElementById("messageInput");
const sendBtn          = document.getElementById("sendBtn");
const nextBtn          = document.getElementById("nextBtn");
const blockBtn         = document.getElementById("blockBtn");
const changeNameBtn    = document.getElementById("changeNameBtn");
const nameModal        = document.getElementById("nameModal");
const nameInput        = document.getElementById("nameInput");
const saveNameBtn      = document.getElementById("saveNameBtn");
const nameError        = document.getElementById("nameError");
const onlineCountElem  = document.getElementById("onlineCount");
const gifBtn           = document.getElementById("gifBtn");
const gifPanel         = document.getElementById("gifPanel");
const gifSearchInput   = document.getElementById("gifSearch");
const gifGrid          = document.getElementById("gifGrid");
const gifPanelClose    = document.getElementById("gifPanelClose");
const replyBar         = document.getElementById("replyBar");
const replyBarText     = document.getElementById("replyBarText");
const cancelReply      = document.getElementById("cancelReply");

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function updateOnlineCount(count) {
  onlineCountElem.textContent = `Users Online: ${count}`;
}

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled      = !enabled;
  blockBtn.disabled     = !enabled;
  gifBtn.disabled       = !enabled;
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

function closeGifPanel() {
  gifPanel.classList.remove("open");
  gifBtn.classList.remove("active");
}

// ── Reply ─────────────────────────────────────────────────────────────────────

function setReplyingTo(data) {
  replyingTo = data;
  replyBarText.textContent = data.gifUrl ? "📷 GIF" : (data.text || "");
  replyBar.style.display = "flex";
  messageInput.focus();
}

function clearReply() {
  replyingTo = null;
  replyBar.style.display = "none";
}

cancelReply.addEventListener("click", clearReply);

// ── Reactions ─────────────────────────────────────────────────────────────────

function toggleReaction(messageId, emoji) {
  const stored = messageStore[messageId];
  if (!stored) return;

  const wasMyReaction = stored.myReaction === emoji;

  if (stored.myReaction) {
    stored.reactions[stored.myReaction] = (stored.reactions[stored.myReaction] || 1) - 1;
    if (stored.reactions[stored.myReaction] <= 0) delete stored.reactions[stored.myReaction];
  }

  if (!wasMyReaction) {
    stored.myReaction = emoji;
    stored.reactions[emoji] = (stored.reactions[emoji] || 0) + 1;
    socket.emit("reaction", { messageId, emoji });
  } else {
    stored.myReaction = null;
    socket.emit("reaction", { messageId, emoji: null });
  }

  renderReactions(messageId);
}

function applyPartnerReaction(messageId, emoji) {
  const stored = messageStore[messageId];
  if (!stored) return;

  if (stored.partnerReaction) {
    stored.reactions[stored.partnerReaction] = (stored.reactions[stored.partnerReaction] || 1) - 1;
    if (stored.reactions[stored.partnerReaction] <= 0) delete stored.reactions[stored.partnerReaction];
  }

  stored.partnerReaction = emoji || null;

  if (emoji) {
    stored.reactions[emoji] = (stored.reactions[emoji] || 0) + 1;
  }

  renderReactions(messageId);
}

function renderReactions(messageId) {
  const stored = messageStore[messageId];
  if (!stored) return;

  stored.reactionsDiv.innerHTML = "";

  Object.entries(stored.reactions).forEach(([emoji, count]) => {
    if (!count || count <= 0) return;
    const pill = document.createElement("button");
    pill.className = "reaction-pill" + (stored.myReaction === emoji ? " mine" : "");
    pill.textContent = count > 1 ? `${emoji} ${count}` : emoji;
    pill.title = count > 1 ? `${count} reactions` : "React";
    pill.addEventListener("click", () => toggleReaction(messageId, emoji));
    stored.reactionsDiv.appendChild(pill);
  });
}

// ── Message rendering ─────────────────────────────────────────────────────────

function buildEmojiPicker(messageId, data) {
  const picker = document.createElement("div");
  picker.className = "emoji-picker";

  EMOJIS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.textContent = emoji;
    btn.className = "emoji-btn";
    btn.title = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleReaction(messageId, emoji);
      picker.classList.remove("visible");
    });
    picker.appendChild(btn);
  });

  const sep = document.createElement("div");
  sep.style.cssText = "width:1px;background:#3a3d45;height:20px;margin:0 2px;flex-shrink:0;";
  picker.appendChild(sep);

  const replyBtn = document.createElement("button");
  replyBtn.textContent = "↩";
  replyBtn.className = "emoji-btn reply-trigger";
  replyBtn.title = "Reply";
  replyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setReplyingTo({ id: messageId, text: data.text, gifUrl: data.gifUrl });
    picker.classList.remove("visible");
  });
  picker.appendChild(replyBtn);

  return picker;
}

function addMessage(data, isYou) {
  const id = data.id || generateId();

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");
  wrapper.dataset.messageId = id;

  const picker = buildEmojiPicker(id, data);
  wrapper.appendChild(picker);

  const isGif = !!data.gifUrl;
  const content = document.createElement("div");
  content.className = "message-content" + (isYou ? " you" : "") + (isGif ? " gif-bubble" : "");

  if (data.replyTo && (data.replyTo.text || data.replyTo.gifUrl)) {
    const preview = document.createElement("div");
    preview.className = "reply-preview";
    preview.textContent = data.replyTo.gifUrl ? "📷 GIF" : data.replyTo.text;
    content.appendChild(preview);
  }

  if (isGif) {
    const img = document.createElement("img");
    img.src = data.gifUrl;
    img.className = "gif-message";
    img.alt = "GIF";
    img.loading = "lazy";
    content.appendChild(img);
  } else if (data.text) {
    const span = document.createElement("span");
    span.textContent = data.text;
    content.appendChild(span);
  }

  wrapper.appendChild(content);

  const ts = document.createElement("div");
  ts.className = "timestamp";
  ts.textContent = formatTimestamp(new Date());
  wrapper.appendChild(ts);

  const reactionsDiv = document.createElement("div");
  reactionsDiv.className = "message-reactions";
  wrapper.appendChild(reactionsDiv);

  let longPressTimer = null;

  content.addEventListener("touchstart", () => {
    longPressTimer = setTimeout(() => picker.classList.add("visible"), 500);
  }, { passive: true });

  content.addEventListener("touchend", () => clearTimeout(longPressTimer), { passive: true });
  content.addEventListener("touchmove", () => clearTimeout(longPressTimer), { passive: true });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) picker.classList.remove("visible");
  });

  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  messageStore[id] = {
    element: wrapper,
    reactionsDiv,
    reactions: {},
    myReaction: null,
    partnerReaction: null,
    data,
    isYou
  };

  return id;
}

function addSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "system-message";
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function addDisconnectMessage(text) {
  const el = document.createElement("div");
  el.className = "system-message-disconnect";
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function clearChat() {
  chat.innerHTML = "";
  for (const key in messageStore) delete messageStore[key];
}
