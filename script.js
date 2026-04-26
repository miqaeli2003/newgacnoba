const socket = io();
window.socket = socket; // exposed so games.js can reuse the same connection

// ── State ─────────────────────────────────────────────────────────────────────
let userName            = "";
let userBio             = "";
let partnerConnected    = false;
let partnerName         = "";
let isFirstLogin        = true;
let isReconnecting      = false;
let wasAutoKicked       = false;
let msgCounter          = 0;
let typingTimeout       = null;
let isTyping            = false;
let searchRetryInterval = null;
let pendingScrollRaf    = false;
let gifFetchController  = null;
let gifSearchTimer      = null;
let gifPickerOpen       = false;
let unreadCount         = 0;
let replyTo             = null;   // { text, senderName, messageId }
let lastPartnerName     = "";     // remember partner name after disconnect for blocking
let canBlockDisconnected = false; // allow blocking a partner who just left
const originalTitle     = document.title;

// ── Away-timer (tab hidden while in a chat) ───────────────────────────────────
const AWAY_GRACE_MS  = 60000; // 60 seconds
let awayTimer        = null;
let awayTimedOut     = false; // true once the 60 s fired
let _wasInChatWhenHidden = false; // remember if we were in an active chat when tab hid

// ── DOM refs ──────────────────────────────────────────────────────────────────
const chat           = document.getElementById("chat");
const messageInput   = document.getElementById("messageInput");
const sendBtn        = document.getElementById("sendBtn");
const nextBtn        = document.getElementById("nextBtn");
const blockBtn       = document.getElementById("blockBtn");
const changeNameBtn  = document.getElementById("changeNameBtn");
const interestsBtn   = document.getElementById("interestsBtn");
const bioPopup       = document.getElementById("bioPopup");
const bioInput       = document.getElementById("bioInput");
const bioSaveBtn     = document.getElementById("bioSaveBtn");
const bioClearBtn    = document.getElementById("bioClearBtn");
const bioCharCount   = document.getElementById("bioCharCount");
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
const charCount      = document.getElementById("charCount");
const questionBtn    = document.getElementById("questionBtn");
const replyPreview   = document.getElementById("replyPreview");
const replyPreviewName = document.getElementById("replyPreviewName");
const replyPreviewText = document.getElementById("replyPreviewText");
const replyPreviewClose = document.getElementById("replyPreviewClose");

// ── Sound ─────────────────────────────────────────────────────────────────────
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function ensureAudioReady() {
  if (_audioCtx && _audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
}

document.addEventListener("click",   ensureAudioReady, { passive: true });
document.addEventListener("keydown", ensureAudioReady, { passive: true });

function playTone(freq, duration = 0.2, volume = 0.07) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) { /* audio not supported */ }
}

function playNotification(type) {
  if (type === "partnerFound") {
    playTone(880, 0.12); setTimeout(() => playTone(1100, 0.18), 110);
  } else if (type === "message") {
    playTone(660, 0.1, 0.04);
  }
}

// ── Tab unread badge ──────────────────────────────────────────────────────────
function incrementUnread() {
  if (document.hidden) {
    unreadCount++;
    document.title = `(${unreadCount}) ${originalTitle}`;
  }
}

// ── Tab visibility + away timer ───────────────────────────────────────────────
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // ── Tab hidden ──────────────────────────────────────────────────────────
    // If the user is in an active chat, start a 60-second grace timer.
    // They can switch to any app and come back without losing the chat.
    _wasInChatWhenHidden = partnerConnected;
    if (partnerConnected && !awayTimer) {
      awayTimer = setTimeout(() => {
        awayTimer     = null;
        awayTimedOut  = true;
        // Socket is still alive — explicitly end the chat server-side
        socket.emit("tabAwayTimeout");
      }, AWAY_GRACE_MS);
    }
  } else {
    // ── Tab visible again ───────────────────────────────────────────────────
    unreadCount    = 0;
    document.title = originalTitle;

    // Cancel the timer if they came back in time
    if (awayTimer) {
      clearTimeout(awayTimer);
      awayTimer = null;
    }

    // If the 60 s already fired, show the end-of-chat popup
    if (awayTimedOut) {
      awayTimedOut = false;
      showAwayEndedPopup();
      _wasInChatWhenHidden = false;
      return;
    }

    // Came back before 60 s — if we were in an active chat and the socket
    // is healthy, make sure inputs are enabled. This recovers from the edge
    // case where a brief socket reconnect disabled inputs mid-away.
    if (_wasInChatWhenHidden && socket.connected && partnerConnected) {
      setInputsEnabled(true);
      updateBlockBtn();
    }
    _wasInChatWhenHidden = false;
  }
});

// ── Scroll ────────────────────────────────────────────────────────────────────
function scheduleScroll() {
  if (pendingScrollRaf) return;
  pendingScrollRaf = true;
  requestAnimationFrame(() => {
    chat.scrollTop   = chat.scrollHeight;
    pendingScrollRaf = false;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateMsgId() {
  return `${socket.id}_${++msgCounter}_${Date.now()}`;
}

function formatTimestamp(date) {
  const h    = date.getHours();
  const m    = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function _appendInfoMessage(text, className, id) {
  const el       = document.createElement("div");
  el.className   = className;
  el.textContent = text;
  if (id) el.id  = id;
  chat.appendChild(el);
  scheduleScroll();
}

function addSystemMessage(text)            { _appendInfoMessage(text, "system-message"); }
function addDisconnectMessage(text)        { _appendInfoMessage(text, "system-message-disconnect"); }
function addReconnectingMessage(name)      {
  document.getElementById("reconnectingMsg")?.remove();
  _appendInfoMessage(
    `${name} - გავიდა საიტიდან  ... 😟 `,
    "system-message-reconnecting",
    "reconnectingMsg"
  );
}
function removeReconnectingMessage()       { document.getElementById("reconnectingMsg")?.remove(); }

// ── Searching message with random fact ───────────────────────────────────────
function addSearchingMessage() {
  // Remove any existing searching block
  document.getElementById("searchingMsg")?.remove();

  const wrapper     = document.createElement("div");
  wrapper.id        = "searchingMsg";
  wrapper.className = "searching-block";

  const searchText       = document.createElement("div");
  searchText.className   = "system-message";
  searchText.textContent = "ვეძებთ ახალ პარტნიორს... 🔎";
  wrapper.appendChild(searchText);

  // Fact card
  const factCard       = document.createElement("div");
  factCard.className   = "fact-card";

  const factLabel       = document.createElement("span");
  factLabel.className   = "fact-label";
  factLabel.textContent = "💡 Random Fact";

  const factText       = document.createElement("span");
  factText.className   = "fact-text";
  factText.textContent = "...";

  // Arrow button — bottom-right corner
  const nextFactBtn       = document.createElement("button");
  nextFactBtn.className   = "fact-next-btn";
  nextFactBtn.title       = "სხვა ფაქტი";
  nextFactBtn.textContent = "→";

  factCard.appendChild(factLabel);
  factCard.appendChild(factText);
  factCard.appendChild(nextFactBtn);
  wrapper.appendChild(factCard);

  chat.appendChild(wrapper);
  scheduleScroll();

  function loadFact() {
    nextFactBtn.classList.add("spinning");
    fetch("/api/random-fact")
      .then(r => r.json())
      .then(data => {
        if (data.fact) {
          // Fade out → swap text → fade in
          factText.style.transition = "opacity 0.15s";
          factText.style.opacity    = "0";
          setTimeout(() => {
            factText.textContent      = data.fact;
            factText.style.opacity    = "1";
          }, 150);
        }
      })
      .catch(() => {
        factText.textContent = "ფაქტი ვერ ჩაიტვირთა 😕";
      })
      .finally(() => {
        nextFactBtn.classList.remove("spinning");
      });
  }

  // Load initial fact
  loadFact();

  // Arrow click → load next fact
  nextFactBtn.addEventListener("click", loadFact);
}

function addMessage(text, isYou, messageId, replyToData) {
  const id = messageId || generateMsgId();

  const wrapper         = document.createElement("div");
  wrapper.className     = `message-wrapper ${isYou ? "you" : "partner"}`;
  wrapper.dataset.messageId = id;

  // ── Reply quote block ────────────────────────────────────────────────────
  if (replyToData && replyToData.text) {
    const quote       = document.createElement("div");
    quote.className   = `reply-quote ${isYou ? "you" : "partner"}`;

    if (replyToData.senderName) {
      const quoteName       = document.createElement("span");
      quoteName.className   = "reply-quote-name";
      quoteName.textContent = replyToData.senderName;
      quote.appendChild(quoteName);
    }

    const quoteText       = document.createElement("span");
    quoteText.className   = "reply-quote-text";
    const raw = replyToData.text;
    quoteText.textContent = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;

    quote.appendChild(quoteText);
    wrapper.appendChild(quote);
  }

  const msgRow      = document.createElement("div");
  msgRow.className  = "message-row";

  const content     = document.createElement("div");
  content.className = `message-content${isYou ? " you" : ""}`;
  content.textContent = text;

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp inline-ts";
  timestamp.textContent = formatTimestamp(new Date());

  // ── Reply button ──────────────────────────────────────────────────────────
  const replyBtn     = document.createElement("button");
  replyBtn.className = "reply-btn";
  replyBtn.innerHTML = "↩";
  replyBtn.title     = "Reply";
  replyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setReplyTo({
      text,
      senderName: isYou ? userName : (partnerName || "Partner"),
      messageId: id,
    });
  });

  if (isYou) {
    // You: [reply-btn]  [timestamp]  [bubble]
    msgRow.appendChild(replyBtn);
    msgRow.appendChild(timestamp);
    msgRow.appendChild(content);
  } else {
    // Partner: [bubble]  [react-btn]  [reply-btn]  [timestamp]
    const reactBtn     = document.createElement("button");
    reactBtn.className = "react-btn";
    reactBtn.innerHTML = "🙂";
    reactBtn.title     = "React";
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showReactionPicker(reactBtn, id);
    });
    msgRow.appendChild(content);
    msgRow.appendChild(reactBtn);
    msgRow.appendChild(replyBtn);
    msgRow.appendChild(timestamp);
  }

  const reactionArea    = document.createElement("div");
  reactionArea.className = "reaction-area";
  reactionArea.id       = `reactions_${id}`;

  wrapper.appendChild(msgRow);
  wrapper.appendChild(reactionArea);

  // Seen indicator — only for messages you sent
  if (isYou) {
    const seen       = document.createElement("div");
    seen.className   = "seen-status";
    seen.id          = `seen_${id}`;
    seen.textContent = "";
    wrapper.appendChild(seen);
  }

  chat.appendChild(wrapper);
  scheduleScroll();
  return id;
}

function addGifMessage(gifUrl, isYou) {
  const wrapper     = document.createElement("div");
  wrapper.className = `message-wrapper gif-msg-wrapper ${isYou ? "you" : "partner"}`;

  const img       = document.createElement("img");
  img.src         = gifUrl;
  img.className   = "gif-message-img";
  img.loading     = "lazy";
  img.decoding    = "async";

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  wrapper.appendChild(img);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  scheduleScroll();
}

// ── Question card ─────────────────────────────────────────────────────────────
function addQuestionCard(questionText, isYou) {
  const card       = document.createElement("div");
  card.className   = `question-card ${isYou ? "you" : "partner"}`;

  const label      = document.createElement("div");
  label.className  = "question-card-label";
  label.textContent = isYou ? "❓ შენ გამოგზავნე კითხვა" : `❓ ${partnerName || "პარტნიორი"} გიგზავნის კითხვას`;

  const text       = document.createElement("div");
  text.className   = "question-card-text";
  text.textContent = questionText;

  const ts         = document.createElement("div");
  ts.className     = "timestamp";
  ts.textContent   = formatTimestamp(new Date());

  card.appendChild(label);
  card.appendChild(text);
  card.appendChild(ts);
  chat.appendChild(card);
  scheduleScroll();
}

// ── Typing indicator (fixed overlay — Instagram style) ────────────────────────
// The element lives in the HTML outside the chat scroll area so it never
// appears between messages. We just show/hide it and update its bottom offset.

function updateTypingIndicatorPosition() {
  const kbH = getKeyboardHeight();
  const bottom = kbH + chatInputBar.offsetHeight + 8;
  document.documentElement.style.setProperty("--typing-bottom", bottom + "px");
}

function showTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (!el) return;
  el.style.display = "flex";
  updateTypingIndicatorPosition();
  // Add indicator height on top of the existing input-bar padding so the
  // last message is never hidden behind the dots
  chat.style.paddingBottom = "calc(72px + env(safe-area-inset-bottom, 0px) + 56px)";
  scheduleScroll();
}

function hideTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (el) el.style.display = "none";
  // Restore normal padding
  chat.style.paddingBottom = "";
}

function clearChat() { chat.innerHTML = ""; clearReply(); }

function updateOnlineCount(count) {
  onlineCountEl.textContent = `Users: ${count+50}`;
}

// ── Reply helpers ──────────────────────────────────────────────────────────────
function setReplyTo({ text, senderName, messageId }) {
  replyTo = { text, senderName, messageId };
  replyPreviewName.textContent = senderName;
  replyPreviewText.textContent = text.length > 80 ? text.slice(0, 80) + "…" : text;
  replyPreview.style.display = "flex";
  messageInput.focus();
}

function clearReply() {
  replyTo = null;
  replyPreview.style.display = "none";
  replyPreviewName.textContent = "";
  replyPreviewText.textContent = "";
}

replyPreviewClose.addEventListener("click", () => clearReply());

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled      = !enabled;
  gifBtn.disabled       = !enabled;
  questionBtn.disabled  = !enabled;
  // blockBtn is managed separately via updateBlockBtn()
}

// Block button is enabled when chatting OR when partner just left normally.
// It stays disabled during the reconnecting grace-period ("გავიდა საიტიდან").
function updateBlockBtn() {
  blockBtn.disabled = !(partnerConnected || canBlockDisconnected);
}

function showNameError(msg) {
  nameError.textContent   = msg;
  nameError.style.display = "block";
  nameInput.classList.add("error");
}

function clearNameError() {
  nameError.textContent   = "";
  nameError.style.display = "none";
  nameInput.classList.remove("error");
}

// ── Toast popup — used for name-change confirmation ───────────────────────────
function showToast(text, duration = 3000) {
  document.querySelectorAll(".toast-popup").forEach(t => t.remove());
  const toast       = document.createElement("div");
  toast.className   = "toast-popup";
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── Away-ended popup ──────────────────────────────────────────────────────────
// Shown when the user comes back after being away for more than 60 seconds.
function showAwayEndedPopup() {
  document.getElementById("awayEndedOverlay")?.remove();

  const overlay     = document.createElement("div");
  overlay.id        = "awayEndedOverlay";
  overlay.className = "away-ended-overlay";

  const box         = document.createElement("div");
  box.className     = "away-ended-box";

  const icon        = document.createElement("div");
  icon.className    = "away-ended-icon";
  icon.textContent  = "⏱️";

  const msg         = document.createElement("p");
  msg.className     = "away-ended-msg";
  msg.textContent   = "დიდი ხნით გასვლის გამო ჩათი გაითიშა";

  const btn         = document.createElement("button");
  btn.className     = "away-ended-btn";
  btn.textContent   = "Welcome Page";
  btn.addEventListener("click", () => {
    window.location.reload();
  });

  box.appendChild(icon);
  box.appendChild(msg);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("away-ended-visible"));
}

// ── Search retry ──────────────────────────────────────────────────────────────
function startSearchRetry() {
  stopSearchRetry();
  searchRetryInterval = setInterval(() => {
    if (!partnerConnected && userName) socket.emit("findPartner");
  }, 2000);
}

function stopSearchRetry() {
  if (searchRetryInterval !== null) {
    clearInterval(searchRetryInterval);
    searchRetryInterval = null;
  }
}

// ── GIF Picker ────────────────────────────────────────────────────────────────
const TENOR_PROXY = "/api/gifs"; // key stays on the server

async function fetchGifs(query) {
  if (gifFetchController) gifFetchController.abort();
  gifFetchController = new AbortController();
  gifResults.innerHTML = '<div class="gif-placeholder">Loading...</div>';

  try {
    const url  = query ? `${TENOR_PROXY}?q=${encodeURIComponent(query)}` : TENOR_PROXY;
    const res  = await fetch(url, { signal: gifFetchController.signal });
    const data = await res.json();
    renderGifResults(data.results || []);
  } catch (err) {
    if (err.name !== "AbortError") {
      gifResults.innerHTML = '<div class="gif-placeholder">Failed to load GIFs 😢</div>';
    }
  } finally {
    gifFetchController = null;
  }
}

function renderGifResults(results) {
  const frag = document.createDocumentFragment();
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
    img.addEventListener("click", () => sendGif(fullUrl, previewUrl));
    (i % 2 === 0 ? col1 : col2).appendChild(img);
  });
  frag.appendChild(col1);
  frag.appendChild(col2);
  gifResults.innerHTML = "";
  gifResults.appendChild(frag);
}

// ── Visual Viewport — drives BOTH the input bar and GIF picker ────────────────
// On iOS Safari the keyboard (+ its accessory bar) shrinks the visual viewport
// but NOT the layout viewport, so position:fixed elements stay hidden behind it.
// We read the gap and push everything up by exactly that amount — the same trick
// Instagram uses so their input sits flush above the keyboard with no extra bar.
const chatInputBar = document.querySelector(".chat-input");

function getKeyboardHeight() {
  if (!window.visualViewport) return 0;
  const vv = window.visualViewport;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

function updateViewportOffsets() {
  const vv  = window.visualViewport;
  const kbH = getKeyboardHeight();

  // Clamp body to the visual viewport height so the flex chat area fills
  // exactly the space above the keyboard — maximum messages visible and
  // the container stays scrollable (same trick Instagram uses).
  document.body.style.height = kbH > 0 ? vv.height + "px" : "";

  // Toggle a class so CSS can zoom out messages slightly when keyboard is open
  document.body.classList.toggle("keyboard-open", kbH > 0);

  // Input bar is position:fixed (layout-viewport coords) so still needs
  // shifting up by the full keyboard height (accessory bar included).
  chatInputBar.style.bottom     = kbH + "px";
  chatInputBar.style.transition = kbH === 0 ? "bottom 0.22s ease" : "none";

  // GIF picker floats 8 px above the input bar
  if (gifPickerOpen) {
    gifPicker.style.bottom = (kbH + chatInputBar.offsetHeight + 8) + "px";
  }

  // Pin scroll to bottom whenever the viewport shifts
  scheduleScroll();
  // Keep typing indicator pinned above the input bar
  updateTypingIndicatorPosition();
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportOffsets, { passive: true });
  window.visualViewport.addEventListener("scroll", updateViewportOffsets, { passive: true });
}

function updateGifPickerPosition() {
  if (!gifPickerOpen) return;
  const kbH = getKeyboardHeight();
  gifPicker.style.bottom = (kbH + chatInputBar.offsetHeight + 8) + "px";
}

function openGifPicker() {
  gifPicker.style.display = "flex";
  gifPickerOpen = true;
  gifSearch.value = "";
  gifSearch.focus();
  updateGifPickerPosition();
  fetchGifs("");
}

function closeGifPickerPanel() {
  gifPicker.style.display = "none";
  gifPicker.style.bottom  = ""; // reset Visual Viewport override
  gifPickerOpen = false;
}

gifBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  gifPickerOpen ? closeGifPickerPanel() : openGifPicker();
});

gifPickerClose.addEventListener("click", (e) => { e.stopPropagation(); closeGifPickerPanel(); });

gifSearch.addEventListener("input", () => {
  clearTimeout(gifSearchTimer);
  gifSearchTimer = setTimeout(() => fetchGifs(gifSearch.value.trim()), 400);
});

gifSearch.addEventListener("keydown", (e) => e.stopPropagation());

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

socket.on("gif", (data) => addGifMessage(data.url, false));

// ── Question button ───────────────────────────────────────────────────────────
let questionBtnCooldown = false;

questionBtn.addEventListener("click", async () => {
  if (!partnerConnected || questionBtnCooldown) return;
  questionBtnCooldown = true;
  questionBtn.disabled = true;
  questionBtn.textContent = "⌛";

  try {
    const res  = await fetch("/api/random-question");
    const data = await res.json();
    if (data.question) {
      // Show question card locally for you
      addQuestionCard(data.question, true);
      // Relay to partner via socket
      socket.emit("sendQuestion", { text: data.question });
    }
  } catch {
    addSystemMessage("კითხვა ვერ ჩაიტვირთა 😕");
  } finally {
    setTimeout(() => {
      questionBtnCooldown  = false;
      questionBtn.disabled = !partnerConnected;
      questionBtn.textContent = "?";
    }, 3000); // 3 s cooldown
  }
});

// Partner received a question card from us
socket.on("partnerQuestion", ({ text }) => {
  addQuestionCard(text, false);
  playNotification("message");
  incrementUnread();
});

// ── Reactions ─────────────────────────────────────────────────────────────────
const REACTIONS          = ["❤️","😂","😢"];
let activeReactionPicker = null;

function showReactionPicker(anchorEl, messageId) {
  closeReactionPicker();
  const picker      = document.createElement("div");
  picker.className  = "reaction-picker";
  const frag = document.createDocumentFragment();
  REACTIONS.forEach(emoji => {
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
    const pw = picker.offsetWidth, ph = picker.offsetHeight;
    let left = rect.left, top = rect.top - ph - 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top < 4) top = rect.bottom + 8;
    picker.style.cssText += `left:${left}px;top:${top}px;opacity:1;transform:scale(1)`;
  });
}

function closeReactionPicker() {
  activeReactionPicker?.remove();
  activeReactionPicker = null;
}

document.addEventListener("click", () => closeReactionPicker());

function reactToMessage(messageId, emoji) {
  socket.emit("react", { messageId, emoji });
  displayReaction(messageId, emoji, true);
}

function displayReaction(messageId, emoji, isMine) {
  const area = document.getElementById(`reactions_${messageId}`);
  if (!area) return;
  const cls = isMine ? "reaction-mine" : "reaction-partner";
  let pill   = area.querySelector(`.${cls}`);
  if (pill) {
    pill.classList.remove("reaction-pop");
    void pill.offsetWidth;
    pill.textContent = emoji;
    pill.classList.add("reaction-pop");
  } else {
    pill = document.createElement("span");
    pill.className   = `reaction-pill ${cls} reaction-pop`;
    pill.textContent = emoji;
    area.appendChild(pill);
  }
}

// ── Message sending ───────────────────────────────────────────────────────────
function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || !partnerConnected || !userName) return;
  const msgId = generateMsgId();
  const currentReply = replyTo ? { ...replyTo } : null;
  addMessage(message, true, msgId, currentReply);
  socket.emit("message", { text: message, messageId: msgId, replyTo: currentReply });
  messageInput.value = "";
  charCount.textContent = "";
  charCount.classList.remove("warning");
  clearReply();
  // Keep focus on input so the keyboard stays open on mobile
  messageInput.focus();
}

// ── Bio / Interests popup ─────────────────────────────────────────────────────
let bioPopupOpen = false;

function openBioPopup() {
  bioInput.value       = userBio;
  bioCharCount.textContent = `${userBio.length}/60`;
  bioPopup.style.display = "flex";
  bioPopupOpen = true;
  setTimeout(() => bioInput.focus(), 50);
}

function closeBioPopup() {
  bioPopup.style.display = "none";
  bioPopupOpen = false;
}

interestsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  bioPopupOpen ? closeBioPopup() : openBioPopup();
});

bioInput.addEventListener("input", () => {
  bioCharCount.textContent = `${bioInput.value.length}/60`;
});

bioInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") { e.preventDefault(); saveBio(); }
  if (e.key === "Escape") closeBioPopup();
});

function saveBio() {
  const text = bioInput.value.trim().slice(0, 60);
  userBio = text;
  socket.emit("setBio", text);
  interestsBtn.classList.toggle("has-bio", text.length > 0);
  closeBioPopup();
  if (text) showToast("✅ ინფო შენახულია!");
}

function clearBio() {
  bioInput.value = "";
  bioCharCount.textContent = "0/60";
  userBio = "";
  socket.emit("setBio", "");
  interestsBtn.classList.remove("has-bio");
}

bioSaveBtn.addEventListener("click", saveBio);
bioClearBtn.addEventListener("click", clearBio);
document.getElementById("bioCloseBtn").addEventListener("click", (e) => { e.stopPropagation(); closeBioPopup(); });

// Close popup when clicking outside it
document.addEventListener("click", (e) => {
  if (bioPopupOpen && !bioPopup.contains(e.target) && e.target !== interestsBtn) {
    closeBioPopup();
  }
});

// ── Name modal ────────────────────────────────────────────────────────────────
function saveName() {
  const name = nameInput.value.trim();
  if (!name)            { showNameError("შეიყვანეთ სახელი ..."); return; }
  if (name.length < 2)  { showNameError("სახელი უნდა შედგებოდეს მინიმუ ორი სიმბოლოსგან!"); return; }
  if (name.length > 20) { showNameError("20 სიმბოლოზე მეტი ვერ იქნება სახელი ! "); return; }
  clearNameError();
  saveNameBtn.disabled    = true;
  saveNameBtn.textContent = "Checking...";
  socket.emit("setName", name);
}

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on("connect", () => {
  if (wasAutoKicked) return;
  // If socket reconnected while away timer was running, cancel it —
  // the session is fresh so the old timer is no longer valid.
  if (awayTimer) { clearTimeout(awayTimer); awayTimer = null; }
  if (userName && !isFirstLogin) {
    isReconnecting = true;
    socket.emit("setName", userName);
  }
});

socket.on("nameAccepted", (acceptedName) => {
  const wasNameChange = !isFirstLogin && !isReconnecting;
  userName                = acceptedName;
  nameModal.style.display = "none";
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = "საუბრის დაწყება";
  clearNameError();

  // Show the username in the top bar
  const displayEl = document.getElementById("userNameDisplay");
  if (displayEl) {
    displayEl.textContent = `👤 ${acceptedName}`;
    displayEl.style.display = "block";
  }

  // Show interests/bio button
  if (interestsBtn) interestsBtn.style.display = "inline-block";

  if (isFirstLogin) {
    isFirstLogin = false;
    clearChat();
    addSearchingMessage();
    socket.emit("findPartner");
    startSearchRetry();
  } else if (isReconnecting) {
    isReconnecting   = false;
    partnerConnected = false;
    partnerName      = "";
    setInputsEnabled(false);
    hideTypingIndicator();
    closeGifPickerPanel();
    // Do NOT clearChat, do NOT auto-search — everything stays as-is until user presses ძებნა
  }
  // else: mid-session name change — no extra action
  if (wasNameChange) {
    addSystemMessage(`🟢 თქვენ წარმატებით შეიცვალეთ სახელი „${acceptedName}" 🟢`);
  }
});

socket.on("nameTaken", () => {
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = isFirstLogin ? "საუბრის დაწყება" : "Save Name";
  isReconnecting          = false;
  showNameError("ეს სახელი დაკავებულია. სხვა აირჩიეთ. 😟 ");
  nameInput.focus();
  nameInput.select();
});

socket.on("onlineCount", (count) => updateOnlineCount(count));

socket.on("queuePosition", ({ position, total }) => {
  const wrapper = document.getElementById("searchingMsg");
  if (wrapper) {
    const msg = wrapper.querySelector(".system-message");
    if (msg) msg.textContent = `ვეძებთ ახალ პარტნიორს... 🔎`;
  }
});

socket.on("partnerFound", (partner) => {
  stopSearchRetry();
  clearChat();
  partnerName          = partner.name || "Anonymous";
  partnerConnected     = true;
  lastPartnerName      = "";
  canBlockDisconnected = false;
  // Cancel any leftover away timer from a previous chat
  if (awayTimer) { clearTimeout(awayTimer); awayTimer = null; }
  awayTimedOut = false;
  addSystemMessage(`გილოცავთ პარტნიორი ნაპოვნია 🥳 : ${partnerName}`);

  // Show partner's bio if they set one
  if (partner.partnerBio) {
    const bioEl       = document.createElement("div");
    bioEl.className   = "partner-bio-line";
    bioEl.textContent = `💬 ${partner.partnerBio}`;
    chat.appendChild(bioEl);
    scheduleScroll();
  }

  setInputsEnabled(true);
  updateBlockBtn();
  playNotification("partnerFound");
  incrementUnread();
});

// Reconnect grace-period events
let partnerWasReconnecting = false;

socket.on("partnerReconnecting", (data) => {
  // Partner stepped away — do NOTHING for up to 60 s.
  // Inputs stay enabled, chat is untouched, no messages shown.
  // Only partnerDisconnected (fired after 60 s) will take action.
  partnerWasReconnecting = true;
  canBlockDisconnected   = false;
});

socket.on("partnerReconnected", (data) => {
  // Partner came back within 60 s — silently restore state, nothing visible.
  partnerWasReconnecting = false;
  partnerName            = data.name || partnerName;
  partnerConnected       = true;
  canBlockDisconnected   = false;
});

// Own socket restored to previous partner after reconnecting
socket.on("partnerRestored", (data) => {
  stopSearchRetry();
  partnerName      = data.name || "Anonymous";
  partnerConnected = true;
  _wasInChatWhenHidden = false;
  // Cancel any away timer — we're back in chat
  if (awayTimer) { clearTimeout(awayTimer); awayTimer = null; }
  awayTimedOut = false;
  setInputsEnabled(true);
  updateBlockBtn();
  // No clearChat(), no system message — messages stay, chat resumes silently
});

socket.on("waitingForPartner", () => {
  partnerConnected = false;
  partnerName      = "";
  setInputsEnabled(false);
  // Do NOT auto-search — user must press ძებნა manually
});

socket.on("partnerTyping", (typing) => {
  typing ? showTypingIndicator() : hideTypingIndicator();
});

socket.on("message", (msg) => {
  hideTypingIndicator();
  addMessage(msg.text, false, msg.messageId, msg.replyTo || null);
  playNotification("message");
  incrementUnread();
  // Tell sender we received/read the message
  if (msg.messageId) socket.emit("seen", { messageId: msg.messageId });
});

socket.on("partnerSeen", ({ messageId }) => {
  const el = document.getElementById(`seen_${messageId}`);
  if (el) { el.textContent = ""; el.classList.add("seen"); }
});

socket.on("reacted", ({ messageId, emoji }) => {
  displayReaction(messageId, emoji, false);
});

socket.on("partnerDisconnected", (data) => {
  const wasReconnecting = partnerWasReconnecting;
  partnerWasReconnecting = false;

  if (!wasReconnecting) {
    removeReconnectingMessage();
    addDisconnectMessage(`${data.name || "Anonymous"} -მ სამწუხაროდ დაგტოვათ 😟 `);
    // Allow blocking after a normal leave
    lastPartnerName      = partnerName || data.name || "";
    canBlockDisconnected = !!lastPartnerName;
  } else {
    // Grace-period expired — partner fully left, allow block
    lastPartnerName      = partnerName || data.name || "";
    canBlockDisconnected = !!lastPartnerName;
  }

  partnerConnected = false;
  partnerName      = "";
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
});

socket.on("userBlocked", (data) => {
  const blockedName = data.name || lastPartnerName || "მომხმარებელი";
  stopSearchRetry();
  clearChat();
  partnerConnected     = false;
  partnerName          = "";
  lastPartnerName      = "";
  canBlockDisconnected = false;
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  addSystemMessage(`🔴 „${blockedName}" -  წარმატებით იქნა დაბლოკილი 🔴`);
});

socket.on("youWereBlocked", (data) => {
  const blockerName = data.name || "მომხმარებელი";
  partnerConnected     = false;
  partnerName          = "";
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  addDisconnectMessage(`${blockerName} -მა დაგბლოკათ :(`);
});

socket.on("reportConfirmed", () => {
  addSystemMessage("შეტყობინება გაგზავნილია. გმადლობთ. 🙏");
});

socket.on("messageFlagged", () => {
  const notice       = document.createElement("div");
  notice.className   = "system-message";
  notice.textContent = "შეტყობინება გაიფილტრა და არ გაიგზავნა.";
  chat.appendChild(notice);
  scheduleScroll();
  setTimeout(() => notice.remove(), 3000);
});

// Sender gets kicked for sending a link
socket.on("linkKicked", () => {
  partnerConnected     = false;
  partnerName          = "";
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  clearChat();
  addDisconnectMessage("🚫 ლინკების გაგზავნა აკრძალულია! თქვენ გაირიცხეთ საიტიდან.");
});

// Partner of the link-sender sees a notice and gets unlinked
socket.on("partnerLinkKicked", () => {
  partnerConnected     = false;
  partnerName          = "";
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  addDisconnectMessage("🚫 ლინკების გაგზავნა აკრძალულია! პარტნიორი გაირიცხა საიტიდან.");
});

socket.on("autoKicked", () => {
  partnerConnected = false;
  partnerName      = "";
  stopSearchRetry();
  clearChat();
  setInputsEnabled(false);
  addDisconnectMessage("თქვენ დაბლოკილი ხართ განმეორებადი დარღვევების გამო.");
  socket.disconnect();
});

// ── Away timeout — server confirmed chat ended because user was away > 60 s ──
socket.on("awayTimeout", () => {
  partnerConnected     = false;
  partnerName          = "";
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  setInputsEnabled(false);
  updateBlockBtn();
  hideTypingIndicator();
  closeGifPickerPanel();
  clearChat();

  if (document.hidden) {
    // Tab still hidden — popup shown when user comes back (visibilitychange)
    awayTimedOut = true;
  } else {
    // Already visible (desktop / came back at exact same ms) — show now
    awayTimedOut = false;
    showAwayEndedPopup();
  }
});

// ── Button handlers ───────────────────────────────────────────────────────────

nextBtn.addEventListener("click", () => {
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1000);
  hideTypingIndicator();
  clearChat();
  addSearchingMessage();
  partnerConnected     = false;
  partnerName          = "";
  lastPartnerName      = "";
  canBlockDisconnected = false;
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  socket.emit("next");
  startSearchRetry();
});

blockBtn.addEventListener("click", () => {
  const targetName = partnerName || lastPartnerName;
  if (!targetName) return;
  const confirmed = confirm(
    `Block "${targetName}"? თქვენ ვეღარ შეხვდებით ამ იუზერს ბლოკის შემდეგ. 😡 `
  );
  if (confirmed) socket.emit("blockUser");
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

messageInput.addEventListener("input", () => {
  // Character counter
  const len = messageInput.value.length;
  charCount.textContent = ``;
  charCount.classList.toggle("warning", len > 1800);

  // Typing indicator
  if (!partnerConnected) return;
  if (!isTyping) { isTyping = true; socket.emit("typing", true); }
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
  const closeBtn = document.getElementById("nameModalClose");
  if (closeBtn) closeBtn.style.display = "block";
  setTimeout(() => nameInput.focus(), 50);
});

saveNameBtn.addEventListener("click", saveName);
nameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") saveName(); });

// ── Swipe-right gesture → Next (mobile) ──────────────────────────────────────
let touchStartX = 0, touchStartY = 0;

document.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
  // Swipe right > 150 px, mostly horizontal (dy < 30% of dx),
  // AND must start from the left edge (first 30px) to avoid accidental triggers
  if (dx > 150 && dy < dx * 0.3 && touchStartX < 30 && !nextBtn.disabled) {
    nextBtn.click();
  }
}, { passive: true });

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  userName       = "";
  isFirstLogin   = true;
  isReconnecting = false;
  wasAutoKicked  = false;
  stopSearchRetry();
  setInputsEnabled(false);
  updateBlockBtn();
  saveNameBtn.textContent  = "საუბრის დაწყება";
  charCount.textContent    = "";

  // Always show entry modal — nothing is stored between visits
  nameModal.style.display = "flex";
  setTimeout(() => nameInput.focus(), 100);

  // X button on name modal — only active during mid-session name change
  const nameModalClose = document.getElementById("nameModalClose");
  if (nameModalClose) {
    nameModalClose.addEventListener("click", () => {
      nameModal.style.display = "none";
      nameModalClose.style.display = "none";
      clearNameError();
    });
  }
});
