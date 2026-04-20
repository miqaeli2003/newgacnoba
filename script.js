const socket = io();

let userName              = "";
let partnerConnected      = false;
let partnerName           = "";
let isFirstLogin          = true;
let isReconnecting        = false;
let msgCounter            = 0;
let typingTimeout         = null;
let isTyping              = false;
let searchRetryInterval   = null;
let pendingScrollRaf      = false; // batch scroll-to-bottom via rAF
let activeFetchController = null;  // AbortController for in-flight GIF requests

// ── DOM refs (cached once) ────────────────────────────────────────────────────
const chat           = document.getElementById("chat");
const messageInput   = document.getElementById("messageInput");
const sendBtn        = document.getElementById("sendBtn");
const nextBtn        = document.getElementById("nextBtn");
const blockBtn       = document.getElementById("blockBtn");
const changeNameBtn  = document.getElementById("changeNameBtn");
const nameModal      = document.getElementById("nameModal");
const nameInput      = document.getElementById("nameInput");
const saveNameBtn    = document.getElementById("saveNameBtn");
const nameError      = document.getElementById("nameError");
const onlineCountEl  = document.getElementById("onlineCount");
const gifBtn         = document.getElementById("gifBtn");
const gifPicker      = document.getElementById("gifPicker");
const gifSearch      = document.getElementById("gifSearch");
const gifResults     = document.getElementById("gifResults");
const gifPickerClose = document.getElementById("gifPickerClose");

// ── GIF System (Tenor API) ────────────────────────────────────────────────────

const TENOR_KEY    = "LIVDSRZULELA"; // Tenor demo key
let gifSearchTimer = null;
let gifPickerOpen  = false;

async function fetchGifs(query) {
  // Cancel any in-flight request so stale results don't overwrite fresh ones
  if (activeFetchController) activeFetchController.abort();
  activeFetchController = new AbortController();

  gifResults.innerHTML = '<div class="gif-placeholder">Loading...</div>';

  try {
    const endpoint = query
      ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`
      : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&media_filter=minimal&contentfilter=medium`;

    const res  = await fetch(endpoint, { signal: activeFetchController.signal });
    const data = await res.json();
    renderGifResults(data.results || []);
  } catch (err) {
    if (err.name !== "AbortError") {
      gifResults.innerHTML = '<div class="gif-placeholder">Failed to load GIFs 😢</div>';
    }
  } finally {
    activeFetchController = null;
  }
}

function renderGifResults(results) {
  // Build off-DOM fragment to avoid repeated reflows
  const fragment = document.createDocumentFragment();

  if (!results.length) {
    const ph = document.createElement("div");
    ph.className = "gif-placeholder";
    ph.textContent = "No GIFs found";
    gifResults.innerHTML = "";
    gifResults.appendChild(ph);
    return;
  }

  const col1 = document.createElement("div");
  const col2 = document.createElement("div");
  col1.className = "gif-col";
  col2.className = "gif-col";

  results.forEach((result, i) => {
    const media      = result.media[0];
    const previewUrl = media.tinygif?.url || media.gif?.url;
    const fullUrl    = media.gif?.url;
    if (!previewUrl || !fullUrl) return;

    const img        = document.createElement("img");
    img.src          = previewUrl;
    img.className    = "gif-item";
    img.loading      = "lazy";
    img.decoding     = "async";
    img.dataset.full = fullUrl;
    img.addEventListener("click", () => sendGif(fullUrl, previewUrl));

    (i % 2 === 0 ? col1 : col2).appendChild(img);
  });

  fragment.appendChild(col1);
  fragment.appendChild(col2);

  gifResults.innerHTML = "";
  gifResults.appendChild(fragment);
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
  clearTimeout(gifSearchTimer);
  // 400 ms debounce — avoids a network request on every keystroke
  gifSearchTimer = setTimeout(() => fetchGifs(gifSearch.value.trim()), 400);
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
  wrapper.className = `message-wrapper gif-msg-wrapper ${isYou ? "you" : "partner"}`;

  const img      = document.createElement("img");
  img.src        = gifUrl;
  img.className  = "gif-message-img";
  img.loading    = "lazy";
  img.decoding   = "async";

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  wrapper.appendChild(img);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  scheduleScroll();
}

socket.on("gif", (data) => addGifMessage(data.url, false));

// ── Reaction Config ───────────────────────────────────────────────────────────

const REACTIONS           = ["❤️", "😂", "😢"];
let activeReactionPicker  = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateMsgId() {
  return `${socket.id}_${++msgCounter}_${Date.now()}`;
}

function formatTimestamp(date) {
  const h     = date.getHours();
  const m     = date.getMinutes();
  const ampm  = h >= 12 ? "PM" : "AM";
  const h12   = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Batch scroll-to-bottom updates via requestAnimationFrame so that multiple
 * messages appended in the same tick only trigger one layout read.
 */
function scheduleScroll() {
  if (pendingScrollRaf) return;
  pendingScrollRaf = true;
  requestAnimationFrame(() => {
    chat.scrollTop   = chat.scrollHeight;
    pendingScrollRaf = false;
  });
}

function addMessage(text, isYou, messageId) {
  const id = messageId || generateMsgId();

  const wrapper         = document.createElement("div");
  wrapper.className     = `message-wrapper ${isYou ? "you" : "partner"}`;
  wrapper.dataset.messageId = id;

  const msgRow      = document.createElement("div");
  msgRow.className  = "message-row";

  const content     = document.createElement("div");
  content.className = `message-content${isYou ? " you" : ""}`;
  content.textContent = text;
  msgRow.appendChild(content);

  if (!isYou) {
    const reactBtn   = document.createElement("button");
    reactBtn.className = "react-btn";
    reactBtn.innerHTML = "📋";
    reactBtn.title   = "React";
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showReactionPicker(reactBtn, id);
    });
    msgRow.appendChild(reactBtn);
  }

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  const reactionArea    = document.createElement("div");
  reactionArea.className = "reaction-area";
  reactionArea.id       = `reactions_${id}`;

  // Append all children in one shot to minimize reflows
  wrapper.appendChild(msgRow);
  wrapper.appendChild(timestamp);
  wrapper.appendChild(reactionArea);
  chat.appendChild(wrapper);
  scheduleScroll();

  return id;
}

/** Shared helper for system / disconnect notices (avoids duplicated logic). */
function _appendInfoMessage(text, className) {
  const el      = document.createElement("div");
  el.className  = className;
  el.textContent = text;
  chat.appendChild(el);
  scheduleScroll();
}

function addSystemMessage(text) {
  _appendInfoMessage(text, "system-message");
}

function addDisconnectMessage(text) {
  _appendInfoMessage(text, "system-message-disconnect");
}

function showTypingIndicator() {
  if (document.getElementById("typingIndicator")) return;
  const el      = document.createElement("div");
  el.id         = "typingIndicator";
  el.className  = "typing-indicator";
  el.innerHTML  = "<span></span><span></span><span></span>";
  chat.appendChild(el);
  scheduleScroll();
}

function hideTypingIndicator() {
  document.getElementById("typingIndicator")?.remove();
}

function clearChat() {
  chat.innerHTML = "";
}

function updateOnlineCount(count) {
  onlineCountEl.textContent = `Users Online: ${count}`;
}

// ── Auto-retry while searching ────────────────────────────────────────────────
// Re-emits findPartner every 2 s so the user never has to press Search again
// if they were already in the queue when a previous partner disconnected.

function startSearchRetry() {
  stopSearchRetry();
  searchRetryInterval = setInterval(() => {
    if (!partnerConnected && userName) {
      socket.emit("findPartner");
    }
  }, 2000); // 2 s — prevents hammering the server
}

function stopSearchRetry() {
  if (searchRetryInterval !== null) {
    clearInterval(searchRetryInterval);
    searchRetryInterval = null;
  }
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
  nameError.textContent   = "";
  nameError.style.display = "none";
  nameInput.classList.remove("error");
}

// ── Reaction Picker ───────────────────────────────────────────────────────────

function showReactionPicker(anchorEl, messageId) {
  closeReactionPicker();

  const picker      = document.createElement("div");
  picker.className  = "reaction-picker";

  // Build all buttons in a fragment to avoid repeated reflows
  const frag = document.createDocumentFragment();
  REACTIONS.forEach((emoji) => {
    const btn       = document.createElement("button");
    btn.className   = "reaction-emoji-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reactToMessage(messageId, emoji);
      closeReactionPicker();
    });
    frag.appendChild(btn);
  });
  picker.appendChild(frag);

  document.body.appendChild(picker);
  activeReactionPicker = picker;

  requestAnimationFrame(() => {
    const rect = anchorEl.getBoundingClientRect();
    const pw   = picker.offsetWidth;
    const ph   = picker.offsetHeight;
    let left   = rect.left;
    let top    = rect.top - ph - 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top < 4) top = rect.bottom + 8;
    picker.style.cssText += `left:${left}px;top:${top}px;opacity:1;transform:scale(1)`;
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

  const cls  = isMine ? "reaction-mine" : "reaction-partner";
  let pill   = reactionArea.querySelector(`.${cls}`);

  if (pill) {
    // Re-trigger animation without cloning the node
    pill.classList.remove("reaction-pop");
    void pill.offsetWidth; // force reflow to restart animation
    pill.textContent = emoji;
    pill.classList.add("reaction-pop");
  } else {
    pill           = document.createElement("span");
    pill.className = `reaction-pill ${cls} reaction-pop`;
    pill.textContent = emoji;
    reactionArea.appendChild(pill);
  }
}

// ── Message Sending ───────────────────────────────────────────────────────────

function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || !partnerConnected || !userName) return;

  const msgId = generateMsgId();
  addMessage(message, true, msgId);
  socket.emit("message", { text: message, messageId: msgId });
  messageInput.value = "";
}

// ── Name Modal ────────────────────────────────────────────────────────────────

function saveName() {
  const name = nameInput.value.trim();
  if (!name)            { showNameError("Please enter a username."); return; }
  if (name.length < 2)  { showNameError("Username must be at least 2 characters."); return; }
  if (name.length > 20) { showNameError("Username must be 20 characters or less."); return; }
  clearNameError();
  saveNameBtn.disabled   = true;
  saveNameBtn.textContent = "Checking...";
  socket.emit("setName", name);
}

// ── Socket Events ─────────────────────────────────────────────────────────────

// Re-register username after a network blip / socket.io auto-reconnect
socket.on("connect", () => {
  if (userName && !isFirstLogin) {
    isReconnecting = true;
    socket.emit("setName", userName);
  }
});

socket.on("nameAccepted", (acceptedName) => {
  userName                = acceptedName;
  nameModal.style.display = "none";
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = "Start Chatting";
  clearNameError();

  if (isFirstLogin) {
    isFirstLogin = false;
    clearChat();
    socket.emit("findPartner");
    startSearchRetry();
  } else if (isReconnecting) {
    isReconnecting   = false;
    partnerConnected = false;
    partnerName      = "";
    setInputsEnabled(false);
    hideTypingIndicator();
    closeGifPickerPanel();
    clearChat();
    addSystemMessage("ვეძებთ ახალ პარტნიორს...");
    socket.emit("findPartner");
    startSearchRetry();
  }
  // else: name change mid-session — no extra action needed
});

socket.on("nameTaken", () => {
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = isFirstLogin ? "Start Chatting" : "Save Name";
  isReconnecting          = false;
  showNameError("ეს სახელი დაკავებულია. სხვა აირჩიეთ.");
  nameInput.focus();
  nameInput.select();
});

socket.on("onlineCount",    (count) => updateOnlineCount(count));

socket.on("partnerFound", (partner) => {
  stopSearchRetry();
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
  partnerName      = "";
  setInputsEnabled(false);
  startSearchRetry();
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
  stopSearchRetry();
  hideTypingIndicator();
  addDisconnectMessage(`${data.name || "Anonymous"} -მ სამწუხაროდ დაგტოვათ`);
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
});

socket.on("userBlocked", (data) => {
  stopSearchRetry();
  clearChat();
  addSystemMessage(`You blocked ${data.name}. Searching for a new partner...`);
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
  startSearchRetry();
});

// ── Button Handlers ───────────────────────────────────────────────────────────

nextBtn.addEventListener("click", () => {
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1000);
  hideTypingIndicator();
  clearChat();
  addSystemMessage("ვეძებთ ახალ პარტნიორს...");
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  closeGifPickerPanel();
  socket.emit("next");
  startSearchRetry();
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
  nameInput.value         = userName;
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

document.addEventListener("DOMContentLoaded", () => {
  userName      = "";
  isFirstLogin  = true;
  isReconnecting = false;
  stopSearchRetry();
  nameModal.style.display = "flex";
  setInputsEnabled(false);
  blockBtn.disabled        = true;
  saveNameBtn.textContent  = "Start Chatting";
  setTimeout(() => nameInput.focus(), 100);
});
