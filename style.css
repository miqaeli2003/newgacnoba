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

  // Remove current reaction count
  if (stored.myReaction) {
    stored.reactions[stored.myReaction] = (stored.reactions[stored.myReaction] || 1) - 1;
    if (stored.reactions[stored.myReaction] <= 0) delete stored.reactions[stored.myReaction];
  }

  if (!wasMyReaction) {
    // Apply new reaction
    stored.myReaction = emoji;
    stored.reactions[emoji] = (stored.reactions[emoji] || 0) + 1;
    socket.emit("reaction", { messageId, emoji });
  } else {
    // Un-react
    stored.myReaction = null;
    socket.emit("reaction", { messageId, emoji: null });
  }

  renderReactions(messageId);
}

function applyPartnerReaction(messageId, emoji) {
  const stored = messageStore[messageId];
  if (!stored) return;

  // Remove previous partner reaction
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

  // Emoji reaction buttons
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

  // Separator
  const sep = document.createElement("div");
  sep.style.cssText = "width:1px;background:#3a3d45;height:20px;margin:0 2px;flex-shrink:0;";
  picker.appendChild(sep);

  // Reply button
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

  // Build emoji picker
  const picker = buildEmojiPicker(id, data);
  wrapper.appendChild(picker);

  // Message bubble
  const isGif = !!data.gifUrl;
  const content = document.createElement("div");
  content.className = "message-content" + (isYou ? " you" : "") + (isGif ? " gif-bubble" : "");

  // Reply preview
  if (data.replyTo && (data.replyTo.text || data.replyTo.gifUrl)) {
    const preview = document.createElement("div");
    preview.className = "reply-preview";
    preview.textContent = data.replyTo.gifUrl ? "📷 GIF" : data.replyTo.text;
    content.appendChild(preview);
  }

  // GIF or text content
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

  // Timestamp
  const ts = document.createElement("div");
  ts.className = "timestamp";
  ts.textContent = formatTimestamp(new Date());
  wrapper.appendChild(ts);

  // Reactions row
  const reactionsDiv = document.createElement("div");
  reactionsDiv.className = "message-reactions";
  wrapper.appendChild(reactionsDiv);

  // Mobile: long-press to show picker
  let longPressTimer = null;

  content.addEventListener("touchstart", () => {
    longPressTimer = setTimeout(() => picker.classList.add("visible"), 500);
  }, { passive: true });

  content.addEventListener("touchend", () => {
    clearTimeout(longPressTimer);
  }, { passive: true });

  content.addEventListener("touchmove", () => {
    clearTimeout(longPressTimer);
  }, { passive: true });

  // Close picker on outside click
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) picker.classList.remove("visible");
  });

  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  // Store for reaction updates
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
  // Purge message store
  for (const key in messageStore) delete messageStore[key];
}

// ── Sending ───────────────────────────────────────────────────────────────────

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !partnerConnected || !userName) return;

  const id = generateId();
  const msgData = {
    id,
    text,
    replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, gifUrl: replyingTo.gifUrl } : null
  };

  addMessage(msgData, true);
  socket.emit("message", msgData);
  messageInput.value = "";
  clearReply();
}

function sendGif(gifUrl) {
  if (!partnerConnected) return;

  const id = generateId();
  const msgData = {
    id,
    gifUrl,
    replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, gifUrl: replyingTo.gifUrl } : null
  };

  addMessage(msgData, true);
  socket.emit("message", msgData);
  clearReply();
  closeGifPanel();
}

// ── GIF Panel ─────────────────────────────────────────────────────────────────

gifBtn.addEventListener("click", () => {
  const opening = !gifPanel.classList.contains("open");
  gifPanel.classList.toggle("open");
  gifBtn.classList.toggle("active", opening);

  if (opening) {
    gifSearchInput.value = "";
    gifSearchInput.focus();
    searchGifs(""); // load trending
  }
});

gifPanelClose.addEventListener("click", closeGifPanel);

gifSearchInput.addEventListener("input", () => {
  clearTimeout(gifSearchTimer);
  gifSearchTimer = setTimeout(() => searchGifs(gifSearchInput.value.trim()), 400);
});

gifSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    clearTimeout(gifSearchTimer);
    searchGifs(gifSearchInput.value.trim());
  }
});

async function searchGifs(query) {
  gifGrid.innerHTML = '<div class="gif-loading">Loading...</div>';

  try {
    const url = query
      ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=16&media_filter=minimal`
      : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=16&media_filter=minimal`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Tenor API error");
    const json = await res.json();

    gifGrid.innerHTML = "";

    const results = json.results || [];
    if (results.length === 0) {
      gifGrid.innerHTML = '<div class="gif-loading">No GIFs found 🤷</div>';
      return;
    }

    results.forEach(item => {
      const media = item.media && item.media[0];
      if (!media) return;

      const fullUrl    = media.gif?.url    || media.mediumgif?.url || "";
      const previewUrl = media.tinygif?.url || fullUrl;
      if (!fullUrl) return;

      const img = document.createElement("img");
      img.src = previewUrl;
      img.className = "gif-thumb";
      img.loading = "lazy";
      img.alt = item.title || "GIF";
      img.addEventListener("click", () => sendGif(fullUrl));
      gifGrid.appendChild(img);
    });

  } catch (err) {
    console.error("GIF search failed:", err);
    gifGrid.innerHTML = '<div class="gif-loading">Could not load GIFs. Check your connection.</div>';
  }
}

// ── Name Modal ────────────────────────────────────────────────────────────────

function saveName() {
  const name = nameInput.value.trim();
  if (!name) { showNameError("Please enter a username."); return; }
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
  closeGifPanel();
  clearReply();
});

socket.on("message", (msg) => {
  if (!msg || typeof msg !== "object") return;
  addMessage(msg, false);
});

socket.on("reaction", (data) => {
  if (!data || typeof data !== "object") return;
  applyPartnerReaction(data.messageId, data.emoji);
});

socket.on("partnerDisconnected", (data) => {
  addDisconnectMessage(`${data.name || "Anonymous"} has left the chat`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
  closeGifPanel();
});

socket.on("userBlocked", (data) => {
  clearChat();
  addSystemMessage(`You blocked ${data.name}. Searching for a new partner...`);
  partnerConnected = false;
  partnerName = "";
  setInputsEnabled(false);
  closeGifPanel();
  clearReply();
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
  closeGifPanel();
  clearReply();
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
