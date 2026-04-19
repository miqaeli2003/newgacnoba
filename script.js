// ── Config ────────────────────────────────────────────────────────────────────
const TENOR_KEY = "LIVDSRZULELA";
const EMOJIS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

// ── State ─────────────────────────────────────────────────────────────────────
const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true;

const messageStore = {};
let replyingTo = null;
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

// ── MESSAGE RENDER (YOUR ORIGINAL + ICONS ADDED) ─────────────────────────────
function addMessage(data, isYou) {
  const id = data.id || generateId();

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");
  wrapper.dataset.messageId = id;

  const content = document.createElement("div");
  content.className = "message-content";

  const isGif = !!data.gifUrl;

  if (isGif) {
    const img = document.createElement("img");
    img.src = data.gifUrl;
    img.className = "gif-message";
    content.appendChild(img);
  } else if (data.text) {
    const span = document.createElement("span");
    span.textContent = data.text;
    content.appendChild(span);
  }

  wrapper.appendChild(content);

  // ── 🔥 RIGHT SIDE ICONS (ADDED) ──
  const actions = document.createElement("div");
  actions.className = "message-actions";

  // Reply icon
  const replyIcon = document.createElement("button");
  replyIcon.className = "msg-icon";
  replyIcon.innerHTML = "↩";
  replyIcon.title = "Reply";
  replyIcon.onclick = (e) => {
    e.stopPropagation();
    setReplyingTo({
      id,
      text: data.text,
      gifUrl: data.gifUrl
    });
  };

  // Message / menu icon
  const msgIcon = document.createElement("button");
  msgIcon.className = "msg-icon";
  msgIcon.innerHTML = "💬";
  msgIcon.title = "Menu";
  msgIcon.onclick = (e) => {
    e.stopPropagation();
  };

  actions.appendChild(replyIcon);
  actions.appendChild(msgIcon);

  wrapper.appendChild(actions);

  // timestamp
  const ts = document.createElement("div");
  ts.className = "timestamp";
  ts.textContent = formatTimestamp(new Date());
  wrapper.appendChild(ts);

  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  messageStore[id] = {
    element: wrapper,
    data
  };

  return id;
}

// ── SEND MESSAGE ──────────────────────────────────────────────────────────────
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !partnerConnected || !userName) return;

  const msg = {
    id: generateId(),
    text,
    replyTo: replyingTo
  };

  addMessage(msg, true);
  socket.emit("message", msg);

  messageInput.value = "";
  clearReply();
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// ── SOCKET ────────────────────────────────────────────────────────────────────
socket.on("message", (msg) => {
  addMessage(msg, false);
});

// ── INIT ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  nameModal.style.display = "flex";
};
