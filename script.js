const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true;
let msgCounter = 0;

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
const giftBtn = document.getElementById("giftBtn");
const giftPicker = document.getElementById("giftPicker");
const giftGrid = document.getElementById("giftGrid");
const giftPickerClose = document.getElementById("giftPickerClose");

// ── Gifts Config ──────────────────────────────────────────────────────────────

const GIFTS = [
  { id: "roses",    emoji: "🌹", name: "Roses"    },
  { id: "fire",     emoji: "🔥", name: "Fire"     },
  { id: "crown",    emoji: "👑", name: "Crown"    },
  { id: "diamond",  emoji: "💎", name: "Diamond"  },
  { id: "heart",    emoji: "💝", name: "Love"     },
  { id: "cake",     emoji: "🎂", name: "Cake"     },
  { id: "trophy",   emoji: "🏆", name: "Trophy"   },
  { id: "music",    emoji: "🎵", name: "Music"    },
  { id: "star",     emoji: "⭐", name: "Star"     },
  { id: "unicorn",  emoji: "🦄", name: "Unicorn"  },
  { id: "rainbow",  emoji: "🌈", name: "Rainbow"  },
  { id: "balloon",  emoji: "🎈", name: "Balloon"  },
];

// Build gift grid dynamically
GIFTS.forEach(gift => {
  const item = document.createElement("div");
  item.className = "gift-item";
  item.innerHTML = `<span class="gift-emoji">${gift.emoji}</span><span class="gift-item-label">${gift.name}</span>`;
  item.addEventListener("click", () => sendGift(gift));
  giftGrid.appendChild(item);
});

// ── Reaction Config ───────────────────────────────────────────────────────────

const REACTIONS = ["❤️", "😂", "😢"];
let activeReactionPicker = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateMsgId() {
  // Use socket.id prefix so IDs are unique across both users
  return `${socket.id}_${++msgCounter}_${Date.now()}`;
}

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * addMessage — renders a chat bubble.
 * @param {string} text       Message content
 * @param {boolean} isYou     true = sent by me, false = partner
 * @param {string} [messageId] Unique ID (generated if omitted)
 */
function addMessage(text, isYou, messageId) {
  const id = messageId || generateMsgId();

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");
  wrapper.dataset.messageId = id;

  // ── Row: bubble [+ react button for partner msgs] ──
  const msgRow = document.createElement("div");
  msgRow.className = "message-row";

  const content = document.createElement("div");
  content.className = "message-content" + (isYou ? " you" : "");
  content.textContent = text;
  msgRow.appendChild(content);

  // React button — only on partner messages
  if (!isYou) {
    const reactBtn = document.createElement("button");
    reactBtn.className = "react-btn";
    reactBtn.innerHTML = "😊";
    reactBtn.title = "React";
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showReactionPicker(reactBtn, id);
    });
    msgRow.appendChild(reactBtn);
  }

  // ── Timestamp ──
  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  // ── Reaction area (below bubble) ──
  const reactionArea = document.createElement("div");
  reactionArea.className = "reaction-area";
  reactionArea.id = `reactions_${id}`;

  wrapper.appendChild(msgRow);
  wrapper.appendChild(timestamp);
  wrapper.appendChild(reactionArea);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  return id;
}

function addGiftMessage(gift, isYou) {
  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper gift-wrapper " + (isYou ? "you" : "partner");

  const bubble = document.createElement("div");
  bubble.className = "gift-bubble" + (isYou ? " you" : "");

  const emojiEl = document.createElement("div");
  emojiEl.className = "gift-emoji-anim";
  emojiEl.textContent = gift.emoji;

  const labelEl = document.createElement("div");
  labelEl.className = "gift-sent-label";
  labelEl.textContent = isYou
    ? `You sent ${gift.name}`
    : `${partnerName || "Partner"} sent ${gift.name}`;

  bubble.appendChild(emojiEl);
  bubble.appendChild(labelEl);
  wrapper.appendChild(bubble);
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
  giftBtn.disabled = !enabled;
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

// ── Reaction Picker ───────────────────────────────────────────────────────────

function showReactionPicker(anchorEl, messageId) {
  closeReactionPicker();

  const picker = document.createElement("div");
  picker.className = "reaction-picker";

  REACTIONS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "reaction-emoji-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reactToMessage(messageId, emoji);
      closeReactionPicker();
    });
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);
  activeReactionPicker = picker;

  // Position above / near the anchor button
  const rect = anchorEl.getBoundingClientRect();
  // Let browser paint so we can measure picker size
  requestAnimationFrame(() => {
    const pw = picker.offsetWidth;
    const ph = picker.offsetHeight;
    let left = rect.left;
    let top = rect.top - ph - 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top < 4) top = rect.bottom + 8;
    picker.style.left = left + "px";
    picker.style.top = top + "px";
    picker.style.opacity = "1";
    picker.style.transform = "scale(1)";
  });
}

function closeReactionPicker() {
  if (activeReactionPicker) {
    activeReactionPicker.remove();
    activeReactionPicker = null;
  }
}

document.addEventListener("click", () => closeReactionPicker());

function reactToMessage(messageId, emoji) {
  socket.emit("react", { messageId, emoji });
  displayReaction(messageId, emoji, true); // Show on my UI immediately
}

/**
 * displayReaction — renders or updates a reaction pill on a message.
 * @param {string} messageId
 * @param {string} emoji
 * @param {boolean} isMine  true = I reacted, false = partner reacted
 */
function displayReaction(messageId, emoji, isMine) {
  const reactionArea = document.getElementById(`reactions_${messageId}`);
  if (!reactionArea) return;

  const cls = isMine ? "reaction-mine" : "reaction-partner";
  let pill = reactionArea.querySelector(`.${cls}`);

  if (pill) {
    // Update existing reaction with pop animation
    pill.classList.remove("reaction-pop");
    void pill.offsetWidth; // reflow to restart animation
    pill.textContent = emoji;
    pill.classList.add("reaction-pop");
  } else {
    pill = document.createElement("span");
    pill.className = `reaction-pill ${cls} reaction-pop`;
    pill.textContent = emoji;
    reactionArea.appendChild(pill);
  }
}

// ── Gift System ───────────────────────────────────────────────────────────────

giftBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isVisible = giftPicker.style.display !== "none";
  giftPicker.style.display = isVisible ? "none" : "flex";
});

giftPickerClose.addEventListener("click", (e) => {
  e.stopPropagation();
  giftPicker.style.display = "none";
});

document.addEventListener("click", (e) => {
  if (!giftPicker.contains(e.target) && e.target !== giftBtn) {
    giftPicker.style.display = "none";
  }
});

function sendGift(gift) {
  if (!partnerConnected) return;
  socket.emit("gift", { id: gift.id, emoji: gift.emoji, name: gift.name });
  addGiftMessage(gift, true);
  giftPicker.style.display = "none";
}

socket.on("gift", (data) => {
  addGiftMessage(data, false);
});

// ── Message Sending ───────────────────────────────────────────────────────────

function sendMessage() {
  const message = messageInput.value.trim();
  if (message === "" || !partnerConnected || userName === "") return;
  const msgId = generateMsgId();
  addMessage(message, true, msgId);
  socket.emit("message", { text: message, messageId: msgId });
  messageInput.value = "";
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

socket.on("message", (msg) => {
  addMessage(msg.text, false, msg.messageId);
});

// Partner reacted to one of MY messages
socket.on("reacted", ({ messageId, emoji }) => {
  displayReaction(messageId, emoji, false);
});

socket.on("partnerDisconnected", (data) => {
  addDisconnectMessage(`${data.name || "Anonymous"} has left the chat`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
  giftPicker.style.display = "none";
});

socket.on("userBlocked", (data) => {
  clearChat();
  addSystemMessage(`You blocked ${data.name}. Searching for a new partner...`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
  giftPicker.style.display = "none";
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
  giftPicker.style.display = "none";

  socket.emit("next");
});

blockBtn.addEventListener("click", () => {
  if (!partnerConnected || !partnerName) return;
  const confirmed = confirm(`Block "${partnerName}"? თქვენ ვეღარ შეხვდებით ამ იუზერს ბლოკის შემდეგ.`);
  if (confirmed) socket.emit("blockUser");
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
