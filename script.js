const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true;
let lastSender = null; // track consecutive bubbles

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
const onlineCountElem = document.getElementById("onlineCount");

// ── Auto-grow textarea ────────────────────────────────────────────────────────

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMessage(text, isYou) {
  const sender = isYou ? "you" : "partner";
  const isConsecutive = lastSender === sender;

  // Mark the previous last bubble in this group as "last-in-group" no longer
  if (isConsecutive) {
    const prev = chat.querySelector(".message-wrapper.last-in-group." + sender);
    if (prev) prev.classList.remove("last-in-group");
  }

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + sender;
  if (isConsecutive) wrapper.classList.add("consecutive");
  if (!isConsecutive) wrapper.classList.add("group-start");
  wrapper.classList.add("last-in-group");

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;

  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  // Tap bubble to toggle timestamp
  content.addEventListener("click", () => {
    wrapper.classList.toggle("show-time");
  });

  wrapper.appendChild(content);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  lastSender = sender;
}

function addSystemMessage(text) {
  lastSender = null;
  const sysMsg = document.createElement("div");
  sysMsg.className = "system-message";
  sysMsg.textContent = text;
  chat.appendChild(sysMsg);
  chat.scrollTop = chat.scrollHeight;
}

function addDisconnectMessage(text) {
  lastSender = null;
  const sysMsg = document.createElement("div");
  sysMsg.className = "system-message-disconnect";
  sysMsg.textContent = text;
  chat.appendChild(sysMsg);
  chat.scrollTop = chat.scrollHeight;
}

function clearChat() {
  chat.innerHTML = "";
  lastSender = null;
}

function updateOnlineCount(count) {
  onlineCountElem.textContent = `Users Online: ${count}`;
}

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  blockBtn.disabled = !enabled;
  if (!enabled) {
    messageInput.style.height = "auto";
  }
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

function sendMessage() {
  const message = messageInput.value.trim();
  if (message === "" || !partnerConnected || userName === "") return;
  addMessage(message, true);
  socket.emit("message", message);
  messageInput.value = "";
  messageInput.style.height = "auto";
}

// ── Name Modal ────────────────────────────────────────────────────────────────

function saveName() {
  const name = nameInput.value.trim();
  if (name === "") { showNameError("Please enter a username."); return; }
  if (name.length < 2) { showNameError("Username must be at least 2 characters."); return; }
  if (name.length > 20) { showNameError("Username must be 20 characters or less."); return; }
  clearNameError();
  saveNameBtn.disabled = true;
  saveNameBtn.textContent = "Checking...";
  socket.emit("setName", name);
}

// ── Socket Events ─────────────────────────────────────────────────────────────

socket.on("nameAccepted", (acceptedName) => {
  userName = acceptedName;
  nameModal.style.display = "none";
  saveNameBtn.disabled = false;
  saveNameBtn.textContent = "Start Chatting";
  clearNameError();

  if (isFirstLogin) {
    isFirstLogin = false;
    clearChat();
    socket.emit("findPartner");
  }
});

socket.on("nameTaken", () => {
  saveNameBtn.disabled = false;
  saveNameBtn.textContent = isFirstLogin ? "Start Chatting" : "Save Name";
  showNameError("This username is already taken. Try another.");
  nameInput.focus();
  nameInput.select();
});

socket.on("onlineCount", (count) => {
  updateOnlineCount(count);
});

socket.on("partnerFound", (partner) => {
  clearChat();
  partnerName = partner.name || "Anonymous";
  addSystemMessage(`Connected with ${partnerName}`);
  partnerConnected = true;
  setInputsEnabled(true);
  messageInput.focus();
});

socket.on("waitingForPartner", () => {
  clearChat();
  addSystemMessage("Looking for someone to chat with...");
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
});

socket.on("message", (msg) => {
  addMessage(msg.text, false);
});

socket.on("partnerDisconnected", (data) => {
  addDisconnectMessage(`${data.name || "Anonymous"} has left the chat`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
});

socket.on("userBlocked", (data) => {
  clearChat();
  addSystemMessage(`You blocked ${data.name}. Looking for a new partner...`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
});

// ── Button Handlers ───────────────────────────────────────────────────────────

nextBtn.addEventListener("click", () => {
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1000);

  clearChat();
  addSystemMessage("Looking for a new partner...");
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);

  socket.emit("next");
});

blockBtn.addEventListener("click", () => {
  if (!partnerConnected || !partnerName) return;

  const rightSide = blockBtn.parentElement;
  blockBtn.style.display = "none";

  const confirmWrapper = document.createElement("div");
  confirmWrapper.id = "blockConfirm";
  confirmWrapper.style.cssText = "display:flex;align-items:center;gap:6px;";

  const label = document.createElement("span");
  label.textContent = "Block?";
  label.style.cssText = "color:white;font-weight:600;font-size:0.9em;white-space:nowrap;";

  const yesBtn = document.createElement("button");
  yesBtn.textContent = "YES";
  yesBtn.style.cssText = "background:#b8460b;border:none;color:white;padding:5px 12px;border-radius:9999px;cursor:pointer;font-weight:700;font-size:0.85em;height:30px;";

  const noBtn = document.createElement("button");
  noBtn.textContent = "NO";
  noBtn.style.cssText = "background:#555;border:none;color:white;padding:5px 12px;border-radius:9999px;cursor:pointer;font-weight:700;font-size:0.85em;height:30px;";

  confirmWrapper.appendChild(label);
  confirmWrapper.appendChild(yesBtn);
  confirmWrapper.appendChild(noBtn);
  rightSide.insertBefore(confirmWrapper, blockBtn);

  function restoreBlockBtn() {
    confirmWrapper.remove();
    blockBtn.style.display = "";
  }

  yesBtn.addEventListener("click", () => {
    restoreBlockBtn();
    socket.emit("blockUser");
  });

  noBtn.addEventListener("click", restoreBlockBtn);
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
  // On desktop Enter sends; on mobile (virtual keyboard) Enter = new line
  if (e.key === "Enter" && !e.shiftKey) {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!isMobile) {
      e.preventDefault();
      sendMessage();
    }
  }
});

changeNameBtn.addEventListener("click", () => {
  nameInput.value = userName;
  saveNameBtn.textContent = "Save Name";
  clearNameError();
  nameModal.style.display = "flex";
  setTimeout(() => nameInput.focus(), 50);
});

saveNameBtn.addEventListener("click", saveName);
nameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") saveName();
});

// ── Init ──────────────────────────────────────────────────────────────────────

window.onload = () => {
  userName = "";
  isFirstLogin = true;
  nameModal.style.display = "flex";
  setInputsEnabled(false);
  blockBtn.disabled = true;
  saveNameBtn.textContent = "Start Chatting";
  setTimeout(() => nameInput.focus(), 100);
};
