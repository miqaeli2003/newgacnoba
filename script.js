const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true; // true until first successful name registration

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMessage(text, isYou) {
  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");

  const content = document.createElement("div");
  content.className = "message-content" + (isYou ? " you" : "");
  content.textContent = text;

  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  wrapper.appendChild(content);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

function addSystemMessage(text) {
  const sysMsg = document.createElement("div");
  sysMsg.className = "system-message";
  sysMsg.textContent = text;
  chat.appendChild(sysMsg);
  chat.scrollTop = chat.scrollHeight;
}

function addDisconnectMessage(text) {
  const sysMsg = document.createElement("div");
  sysMsg.className = "system-message-disconnect";
  sysMsg.textContent = text;
  chat.appendChild(sysMsg);
  chat.scrollTop = chat.scrollHeight;
}

function clearChat() {
  chat.innerHTML = "";
}

function updateOnlineCount(count) {
  onlineCountElem.textContent = `Users Online: ${count}`;
}

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  blockBtn.disabled = !enabled;
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
}

// ── Name Modal ────────────────────────────────────────────────────────────────

function saveName() {
  const name = nameInput.value.trim();
  if (name === "") {
    showNameError("Please enter a username.");
    return;
  }
  if (name.length < 2) {
    showNameError("Username must be at least 2 characters.");
    return;
  }
  if (name.length > 20) {
    showNameError("Username must be 20 characters or less.");
    return;
  }
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
  // If changing name mid-session, just close modal — no new search needed
});

socket.on("nameTaken", () => {
  saveNameBtn.disabled = false;
  saveNameBtn.textContent = isFirstLogin ? "Start Chatting" : "Save Name";
  showNameError("ეს სახელი დაკავებულია. სხვა აირჩიეთ.");
  nameInput.focus();
  nameInput.select();
});

socket.on("onlineCount", (count) => {
  updateOnlineCount(count);
});

socket.on("partnerFound", (partner) => {
  clearChat();
  partnerName = partner.name || "Anonymous";
  addSystemMessage(`Now connected to ${partnerName}`);
  partnerConnected = true;
  setInputsEnabled(true);
});

socket.on("waitingForPartner", () => {
  clearChat();
  addSystemMessage("ვეძებთ ახალ პარტნიორს...");
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
  addSystemMessage(`You blocked ${data.name}. Searching for a new partner...`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
});

// ── Button Handlers ───────────────────────────────────────────────────────────

nextBtn.addEventListener("click", () => {
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1000);

  clearChat();
  addSystemMessage("ვეძებთ ახალ პარტნიორს...");
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);

  socket.emit("next");
});

blockBtn.addEventListener("click", () => {
  if (!partnerConnected || !partnerName) return;
  const confirmed = confirm(`Block "${partnerName}"? თქვენ ვეღარ შეხვდებით ამ იუზერს ბლოკის შემდეგ.`);
  if (confirmed) {
    socket.emit("blockUser");
  }
});

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
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
