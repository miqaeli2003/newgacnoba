const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";

const chat = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const nextBtn = document.getElementById("nextBtn");
const changeNameBtn = document.getElementById("changeNameBtn");
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const onlineCountElem = document.getElementById("onlineCount");

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

function sendMessage() {
  const message = messageInput.value.trim();
  if (message === "" || !partnerConnected || userName === "") return;
  addMessage(message, true);
  socket.emit("message", message);
  messageInput.value = "";
}

function saveName() {
  const name = nameInput.value.trim();
  if (name === "") return;
  userName = name;
  nameModal.style.display = "none";

  socket.emit("setName", userName);
  socket.emit("findPartner");
  clearChat();
}

socket.on("onlineCount", (count) => {
  updateOnlineCount(count);
});

socket.on("partnerFound", (partner) => {
  clearChat();
  partnerName = partner.name || "Anonymous";
  addSystemMessage(`Now connected to ${partnerName}`);
  partnerConnected = true;
  messageInput.disabled = false;
  sendBtn.disabled = false;
});

socket.on("waitingForPartner", () => {
  clearChat();
  addSystemMessage("Waiting for a partner to connect...");
  partnerConnected = false;
  partnerName = "";
  messageInput.disabled = true;
  sendBtn.disabled = true;
});

socket.on("message", (msg) => {
  addMessage(msg.text, false);
});

// Key change: keep chat as is, add red message, disable inputs
socket.on("partnerDisconnected", (data) => {
  addDisconnectMessage(`${data.name || "Anonymous"} has left you`);
  partnerConnected = false;
  partnerName = "";
  messageInput.disabled = true;
  sendBtn.disabled = true;
});

nextBtn.addEventListener("click", () => {
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1000);

  clearChat();
  addSystemMessage("Waiting for a new partner...");
  partnerConnected = false;
  partnerName = "";
  messageInput.disabled = true;
  sendBtn.disabled = true;

  socket.emit("next");
});

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

changeNameBtn.addEventListener("click", () => {
  nameModal.style.display = "flex";
});

saveNameBtn.addEventListener("click", saveName);

window.onload = () => {
  userName = "";
  nameModal.style.display = "flex";
  messageInput.disabled = true;
  sendBtn.disabled = true;
};
