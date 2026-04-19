const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true; 
let replyingTo = null; 

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

// New Elements
const gifBtn = document.getElementById("gifBtn");
const gifModal = document.getElementById("gifModal");
const closeGifBtn = document.getElementById("closeGifBtn");
const gifGrid = document.getElementById("gifGrid");
const replyIndicator = document.getElementById("replyIndicator");
const replyText = document.getElementById("replyText");
const cancelReply = document.getElementById("cancelReply");

// Default GIFs
const DUMMY_GIFS = [
  "https://media.giphy.com/media/VbnUQpnihPSIgIXuZv/giphy.gif",
  "https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif",
  "https://media.giphy.com/media/3o7aD2saalEvpjmNNK/giphy.gif",
  "https://media.giphy.com/media/l41YkxvU8c7J7Bba0/giphy.gif",
  "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
  "https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif"
];

// ── Helpers ──────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMessage(msgObj, isYou) {
  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");
  wrapper.dataset.id = msgObj.id;

  const content = document.createElement("div");
  content.className = "message-content" + (isYou ? " you" : "");

  // Render Reply Quote
  if (msgObj.replyToText) {
    const quote = document.createElement("div");
    quote.className = "reply-quote";
    quote.textContent = msgObj.replyToText;
    content.appendChild(quote);
  }

  // Render Image or Text
  if (msgObj.isGif) {
    const img = document.createElement("img");
    img.src = msgObj.text;
    img.className = "gif-image";
    content.appendChild(img);
  } else {
    const textNode = document.createTextNode(msgObj.text);
    content.appendChild(textNode);
  }

  // Reaction Badge (Hidden until reacted)
  const reactionBadge = document.createElement("div");
  reactionBadge.className = "reaction-badge";
  reactionBadge.id = `reaction-${msgObj.id}`;
  content.appendChild(reactionBadge);

  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  // Actions (React & Reply)
  if (!isYou) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    
    const replyBtn = document.createElement("button");
    replyBtn.className = "action-btn";
    replyBtn.innerHTML = "↩️";
    replyBtn.title = "Reply";
    replyBtn.onclick = () => initiateReply(msgObj);

    const reactBtn = document.createElement("button");
    reactBtn.className = "action-btn";
    reactBtn.innerHTML = "❤️";
    reactBtn.title = "React";
    reactBtn.onclick = () => sendReaction(msgObj.id, "❤️");

    actions.appendChild(replyBtn);
    actions.appendChild(reactBtn);
    
    wrapper.appendChild(content);
    wrapper.appendChild(actions); // Keep actions grouped with content
    content.appendChild(timestamp); // Put timestamp inside content for better flow
  } else {
    content.appendChild(timestamp);
    wrapper.appendChild(content);
  }

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
  cancelReplyAction();
}

function updateOnlineCount(count) {
  onlineCountElem.textContent = `Users Online: ${count}`;
}

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  blockBtn.disabled = !enabled;
  gifBtn.disabled = !enabled;
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

// ── Features Handling ────────────────────────────────────────

function sendMessage() {
  const text = messageInput.value.trim();
  if (text === "" || !partnerConnected || userName === "") return;

  const msgObj = {
    id: generateId(),
    text: text,
    isGif: false,
    replyToText: replyingTo ? (replyingTo.isGif ? "GIF Image" : replyingTo.text) : null
  };

  addMessage(msgObj, true);
  socket.emit("message", msgObj);
  
  messageInput.value = "";
  cancelReplyAction();
}

function sendGif(url) {
  if (!partnerConnected || userName === "") return;
  
  const msgObj = {
    id: generateId(),
    text: url,
    isGif: true,
    replyToText: replyingTo ? (replyingTo.isGif ? "GIF Image" : replyingTo.text) : null
  };

  addMessage(msgObj, true);
  socket.emit("message", msgObj);
  cancelReplyAction();
}

function initiateReply(msgObj) {
  replyingTo = msgObj;
  replyIndicator.style.display = "flex";
  const preview = msgObj.isGif ? "GIF Image" : msgObj.text;
  replyText.textContent = `Replying to: ${preview}`;
  messageInput.focus();
}

function cancelReplyAction() {
  replyingTo = null;
  replyIndicator.style.display = "none";
}

function sendReaction(msgId, emoji) {
  socket.emit("reactMessage", { messageId: msgId, emoji: emoji });
  showReaction(msgId, emoji);
}

function showReaction(msgId, emoji) {
  const badge = document.getElementById(`reaction-${msgId}`);
  if (badge) {
    badge.textContent = emoji;
    badge.style.display = "block";
  }
}

// ── Name Registration ────────────────────────────────────────

function saveName() {
  const name = nameInput.value.trim();
  if (name === "") return showNameError("Please enter a username.");
  if (name.length < 2) return showNameError("Username must be at least 2 characters.");
  if (name.length > 20) return showNameError("Username must be 20 characters or less.");
  
  clearNameError();
  saveNameBtn.disabled = true;
  saveNameBtn.textContent = "Checking...";
  socket.emit("setName", name);
}

// ── Socket Events ────────────────────────────────────────────

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
  showNameError("ეს სახელი დაკავებულია. სხვა აირჩიეთ.");
  nameInput.focus();
  nameInput.select();
});

socket.on("onlineCount", (count) => updateOnlineCount(count));

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

socket.on("message", (msgObj) => {
  addMessage(msgObj, false);
});

socket.on("reactMessage", (data) => {
  showReaction(data.messageId, data.emoji);
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

// ── Listeners ────────────────────────────────────────────────

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

cancelReply.addEventListener("click", cancelReplyAction);

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

gifBtn.addEventListener("click", () => {
  gifModal.style.display = "flex";
});

closeGifBtn.addEventListener("click", () => {
  gifModal.style.display = "none";
});

// Populate GIFs
DUMMY_GIFS.forEach(url => {
  const img = document.createElement("img");
  img.src = url;
  img.addEventListener("click", () => {
    sendGif(url);
    gifModal.style.display = "none";
  });
  gifGrid.appendChild(img);
});

window.onload = () => {
  userName = "";
  isFirstLogin = true;
  nameModal.style.display = "flex";
  setInputsEnabled(false);
  blockBtn.disabled = true;
  saveNameBtn.textContent = "Start Chatting";
  setTimeout(() => nameInput.focus(), 100);
};
