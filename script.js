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

// ── DOM ───────────────────────────────────────────────────────────────────────
const chat = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const nextBtn = document.getElementById("nextBtn");
const blockBtn = document.getElementById("blockBtn");
const changeNameBtn = document.getElementById("changeNameBtn");

const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const nameError = document.getElementById("nameError");

const gifBtn = document.getElementById("gifBtn");
const gifPanel = document.getElementById("gifPanel");
const gifSearchInput = document.getElementById("gifSearch");
const gifGrid = document.getElementById("gifGrid");
const gifPanelClose = document.getElementById("gifPanelClose");

const replyBar = document.getElementById("replyBar");
const replyBarText = document.getElementById("replyBarText");
const cancelReply = document.getElementById("cancelReply");

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── Reply ─────────────────────────────────────────────────────────────────────
function setReplyingTo(data) {
  replyingTo = data;
  replyBarText.textContent = data.gifUrl ? "📷 GIF" : data.text;
  replyBar.style.display = "flex";
  messageInput.focus();
}

function clearReply() {
  replyingTo = null;
  replyBar.style.display = "none";
}

cancelReply.addEventListener("click", clearReply);

// ── MESSAGE RENDER ───────────────────────────────────────────────────────────
function addMessage(data, isYou) {
  const id = data.id || generateId();

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");

  const content = document.createElement("div");
  content.className = "message-content";

  if (data.gifUrl) {
    const img = document.createElement("img");
    img.src = data.gifUrl;
    img.className = "gif-message";
    content.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.textContent = data.text;
    content.appendChild(span);
  }

  wrapper.appendChild(content);

  // ── RIGHT SIDE ACTIONS (NEW) ──
  const actions = document.createElement("div");
  actions.className = "message-actions";

  const replyIcon = document.createElement("button");
  replyIcon.className = "msg-icon";
  replyIcon.innerHTML = "↩";
  replyIcon.title = "Reply";

  replyIcon.onclick = (e) => {
    e.stopPropagation();
    setReplyingTo({ id, text: data.text, gifUrl: data.gifUrl });
  };

  const moreIcon = document.createElement("button");
  moreIcon.className = "msg-icon";
  moreIcon.innerHTML = "💬";
  moreIcon.title = "React";

  moreIcon.onclick = (e) => {
    e.stopPropagation();
    const picker = wrapper.querySelector(".emoji-picker");
    if (picker) picker.classList.toggle("visible");
  };

  actions.appendChild(replyIcon);
  actions.appendChild(moreIcon);

  wrapper.appendChild(actions);

  // timestamp
  const ts = document.createElement("div");
  ts.className = "timestamp";
  ts.textContent = formatTimestamp(new Date());
  wrapper.appendChild(ts);

  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  messageStore[id] = { element: wrapper, data };
  return id;
}

// ── INPUT ─────────────────────────────────────────────────────────────────────
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

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

sendBtn.onclick = sendMessage;
messageInput.onkeypress = (e) => e.key === "Enter" && sendMessage();

// ── SOCKET ────────────────────────────────────────────────────────────────────
socket.on("message", (msg) => addMessage(msg, false));

// ── INIT ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  nameModal.style.display = "flex";
};
