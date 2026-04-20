const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true;
let msgCounter = 0;
let typingTimeout = null;
let isTyping = false;

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
const gifBtn = document.getElementById("gifBtn");
const gifPicker = document.getElementById("gifPicker");
const gifSearch = document.getElementById("gifSearch");
const gifResults = document.getElementById("gifResults");
const gifPickerClose = document.getElementById("gifPickerClose");
const gifLoading = document.getElementById("gifLoading");

// ── GIF System (Tenor API) ────────────────────────────────────────────────────

const TENOR_KEY = "LIVDSRZULELA"; // Tenor demo key
let gifSearchTimeout = null;
let gifPickerOpen = false;

async function fetchGifs(query) {
  gifResults.innerHTML = '<div class="gif-placeholder">Loading...</div>';
  try {
    const url = query
      ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`
      : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`;

    const res = await fetch(url);
    const data = await res.json();
    renderGifResults(data.results || []);
  } catch (err) {
    gifResults.innerHTML = '<div class="gif-placeholder">Failed to load GIFs 😢</div>';
  }
}

function renderGifResults(results) {
  gifResults.innerHTML = "";

  if (!results.length) {
    gifResults.innerHTML = '<div class="gif-placeholder">No GIFs found</div>';
    return;
  }

  // Masonry-style two-column layout
  const col1 = document.createElement("div");
  const col2 = document.createElement("div");
  col1.className = "gif-col";
  col2.className = "gif-col";

  results.forEach((result, i) => {
    const media = result.media[0];
    const previewUrl = media.tinygif?.url || media.gif?.url;
    const fullUrl = media.gif?.url;
    if (!previewUrl || !fullUrl) return;

    const img = document.createElement("img");
    img.src = previewUrl;
    img.className = "gif-item";
    img.loading = "lazy";
    img.dataset.full = fullUrl;
    img.addEventListener("click", () => sendGif(fullUrl, previewUrl));

    (i % 2 === 0 ? col1 : col2).appendChild(img);
  });

  gifResults.appendChild(col1);
  gifResults.appendChild(col2);
}

function openGifPicker() {
  gifPicker.style.display = "flex";
  gifPickerOpen = true;
  gifSearch.value = "";
  gifSearch.focus();
  fetchGifs(""); // load trending
}

function closeGifPickerPanel() {
  gifPicker.style.display = "none";
  gifPickerOpen = false;
}

gifBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  gifPickerOpen ? closeGifPickerPanel() : openGifPicker();
});

gifPickerClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closeGifPickerPanel();
});

gifSearch.addEventListener("input", () => {
  clearTimeout(gifSearchTimeout);
  gifSearchTimeout = setTimeout(() => fetchGifs(gifSearch.value.trim()), 400);
});

gifSearch.addEventListener("keydown", (e) => e.stopPropagation()); // prevent chat shortcuts

// Close when clicking outside
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

function addGifMessage(gifUrl, isYou) {
  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper gif-msg-wrapper " + (isYou ? "you" : "partner");

  const img = document.createElement("img");
  img.src = gifUrl;
  img.className = "gif-message-img";
  img.loading = "lazy";

  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  wrapper.appendChild(img);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

socket.on("gif", (data) => {
  addGifMessage(data.url, false);
});

// ── Reaction Config ───────────────────────────────────────────────────────────

const REACTIONS = ["❤️", "😂", "😢"];
let activeReactionPicker = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateMsgId() {
  return `${socket.id}_${++msgCounter}_${Date.now()}`;
}

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMessage(text, isYou, messageId) {
  const id = messageId || generateMsgId();

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");
  wrapper.dataset.messageId = id;

  const msgRow = document.createElement("div");
  msgRow.className = "message-row";

  const content = document.createElement("div");
  content.className = "message-content" + (isYou ? " you" : "");
  content.textContent = text;
  msgRow.appendChild(content);

  // React button only on partner messages
  if (!isYou) {
    const reactBtn = document.createElement("button");
    reactBtn.className = "react-btn";
    reactBtn.innerHTML = "📋";
    reactBtn.title = "React";
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showReactionPicker(reactBtn, id);
    });
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
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  return id;
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

function showTypingIndicator() {
  if (document.getElementById("typingIndicator")) return;
  const el = document.createElement("div");
  el.id = "typingIndicator";
  el.className = "typing-indicator";
  el.innerHTML = `<span></span><span></span><span></span>`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function hideTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
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

  requestAnimationFrame(() => {
    const rect = anchorEl.getBoundingClientRect();
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
  displayReaction(messageId, emoji, true);
}

function displayReaction(messageId, emoji, isMine) {
  const reactionArea = document.getElementById(`reactions_${messageId}`);
  if (!reactionArea) return;

  const cls = isMine ? "reaction-mine" : "reaction-partner";
  let pill = reactionArea.querySelector(`.${cls}`);

  if (pill) {
    pill.classList.remove("reaction-pop");
    void pill.offsetWidth;
    pill.textContent = emoji;
    pill.classList.add("reaction-pop");
  } else {
    pill = document.createElement("span");
    pill.className = `reaction-pill ${cls} reaction-pop`;
    pill.textContent = emoji;
    reactionArea.appendChild(pill);
  }
}

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
  addSystemMessage(`გილოცავთ პარტნიორი ნაპოვნია : ${partnerName}`);
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

socket.on("partnerTyping", (typing) => {
  typing ? showTypingIndicator() : hideTypingIndicator();
});

socket.on("message", (msg) => {
  hideTypingIndicator();
  addMessage(msg.text, false, msg.messageId);
});

socket.on("reacted", ({ messageId, emoji }) => {
  displayReaction(messageId, emoji, false);
});

socket.on("partnerDisconnected", (data) => {
  hideTypingIndicator();
  addDisconnectMessage(`${data.name || "Anonymous"} -მ სამწუხაროდ დაგტოვათt`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
});

socket.on("userBlocked", (data) => {
  clearChat();
  addSystemMessage(`You blocked ${data.name}. Searching for a new partner...`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
});

// ── Button Handlers ───────────────────────────────────────────────────────────

nextBtn.addEventListener("click", () => {
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1000);
  hideTypingIndicator();
  clearChat();
  addSystemMessage("ვეძებთ ახალ პარტნიორს...");
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
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

messageInput.addEventListener("input", () => {
  if (!partnerConnected) return;
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing", true);
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit("typing", false);
  }, 1500);
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
