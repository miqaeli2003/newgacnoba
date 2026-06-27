const socket = io();
window.socket = socket;

// ── Bot Detection + Challenge Token ──────────────────────────────────────────
let _challengeToken  = null;
let _challengePow    = null;
let _isBotDetected   = false;

function _detectBot() {
  try {
    if (navigator.webdriver === true) return true;
    if (!navigator.plugins || navigator.plugins.length === 0) return true;
    if (!navigator.languages || navigator.languages.length === 0) return true;
    if (/Chrome/.test(navigator.userAgent) && !window.chrome) return true;
    if ('__webdriver_evaluate'        in window) return true;
    if ('__selenium_evaluate'         in window) return true;
    if ('__webdriver_script_function' in window) return true;
    if ('__fxdriver_evaluate'         in window) return true;
    if ('_phantom'                    in window) return true;
    if ('callPhantom'                 in window) return true;
    if ('__nightmare'                 in window) return true;
    if ('domAutomation'               in window) return true;
    if ('domAutomationController'     in window) return true;
    return false;
  } catch {
    return true;
  }
}

_isBotDetected = _detectBot();

if (!_isBotDetected) {
  fetch("/api/challenge")
    .then(r => r.json())
    .then(d => {
      _challengeToken = d.token;
      _challengePow   = (d.nonce * 31 + d.nonce % 97);
    })
    .catch(() => {});
}

// ── Account/Authentication State ──────────────────────────────────────────────
let isLoggedIn        = false;
let loggedInUsername  = "";
let addedPeople       = [];
let friendRequests    = [];
let currentPartnerUsername = "";

// Load account info from localStorage
function loadAccountInfo() {
  try {
    const stored = localStorage.getItem("gaicani_account");
    if (stored) {
      const account = JSON.parse(stored);
      isLoggedIn = true;
      loggedInUsername = account.username;
      return true;
    }
  } catch (e) {
    console.error("Failed to load account info:", e);
  }
  return false;
}

function saveAccountInfo(username) {
  try {
    localStorage.setItem("gaicani_account", JSON.stringify({ username }));
    isLoggedIn = true;
    loggedInUsername = username;
  } catch (e) {
    console.error("Failed to save account info:", e);
  }
}

function clearAccountInfo() {
  try {
    localStorage.removeItem("gaicani_account");
    isLoggedIn = false;
    loggedInUsername = "";
    addedPeople = [];
    friendRequests = [];
  } catch (e) {
    console.error("Failed to clear account info:", e);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let userName            = "";
let userBio             = "";
let partnerConnected    = false;
let partnerName         = "";
let isFirstLogin        = true;
let isReconnecting      = false;

let msgCounter          = 0;
let typingTimeout       = null;
let isTyping            = false;
let searchRetryInterval = null;
let pendingScrollRaf    = false;
let gifFetchController  = null;
let gifSearchTimer      = null;
let gifPickerOpen       = false;
let unreadCount         = 0;
let replyTo             = null;
let lastPartnerName     = "";
let canBlockDisconnected = false;
const originalTitle     = document.title;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const chat           = document.getElementById("chat");
const messageInput   = document.getElementById("messageInput");
const sendBtn        = document.getElementById("sendBtn");
const nextBtn        = document.getElementById("nextBtn");
const blockBtn       = document.getElementById("blockBtn");
const reportBtn      = document.getElementById("reportBtn");
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
const photoBtn       = document.getElementById("photoBtn");
const photoInput     = document.getElementById("photoInput");
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

// New entry/auth modal elements
const entryChoiceModal = document.getElementById("entryChoiceModal");
const guestBtn = document.getElementById("guestBtn");
const accountBtn = document.getElementById("accountBtn");

const guestNameModal = document.getElementById("guestNameModal");
const guestNameInput = document.getElementById("guestNameInput");
const guestStartBtn = document.getElementById("guestStartBtn");
const guestNameError = document.getElementById("guestNameError");

const accountModal = document.getElementById("accountModal");
const accountLoginForm = document.getElementById("accountLoginForm");
const accountSignupForm = document.getElementById("accountSignupForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const signupUsername = document.getElementById("signupUsername");
const signupPassword = document.getElementById("signupPassword");
const signupPasswordConfirm = document.getElementById("signupPasswordConfirm");
const signupBtn = document.getElementById("signupBtn");
const signupError = document.getElementById("signupError");
const switchToSignupBtn = document.getElementById("switchToSignupBtn");
const switchToLoginBtn = document.getElementById("switchToLoginBtn");
const accountModalClose = document.getElementById("accountModalClose");

const userDashboardModal = document.getElementById("userDashboardModal");
const dashboardUsername = document.getElementById("dashboardUsername");
const startChatBtn = document.getElementById("startChatBtn");
const addedPeopleList = document.getElementById("addedPeopleList");
const friendRequestsList = document.getElementById("friendRequestsList");
const logoutBtn = document.getElementById("logoutBtn");
const dashboardCloseBtn = document.getElementById("dashboardCloseBtn");

const profileBtn = document.getElementById("profileBtn");

const addPersonContainer = document.getElementById("addPersonContainer");
const addPersonBtn = document.getElementById("addPersonBtn");

const friendRequestNotification = document.getElementById("friendRequestNotification");
const friendRequestText = document.getElementById("friendRequestText");
const acceptFriendBtn = document.getElementById("acceptFriendBtn");
const declineFriendBtn = document.getElementById("declineFriendBtn");

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
  } catch (_) { }
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

// ── Tab visibility ────────────────────────────────────────────────────────────
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    unreadCount    = 0;
    document.title = originalTitle;
    if (!socket.connected && userName) {
      socket.connect();
    }
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
    `${name} - კავშირი გაწყდა, ველოდებით... ⏳`,
    "system-message-reconnecting",
    "reconnectingMsg"
  );
}
function removeReconnectingMessage()       { document.getElementById("reconnectingMsg")?.remove(); }

// ── Searching message with random fact ───────────────────────────────────────
function addSearchingMessage() {
  document.getElementById("searchingMsg")?.remove();
  setInputsEnabled(false);

  const wrapper     = document.createElement("div");
  wrapper.id        = "searchingMsg";
  wrapper.className = "searching-block";

  const searchText       = document.createElement("div");
  searchText.className   = "system-message";
  searchText.textContent = "ვეძებთ ახალ პარტნიორს... 🔎";
  wrapper.appendChild(searchText);

  const factCard       = document.createElement("div");
  factCard.className   = "fact-card";

  const factLabel       = document.createElement("span");
  factLabel.className   = "fact-label";
  factLabel.textContent = "💡 Random Fact";

  const factText       = document.createElement("span");
  factText.className   = "fact-text";
  factText.textContent = "...";

  const nextFactBtn       = document.createElement("button");
  nextFactBtn.className   = "fact-next-btn";
  nextFactBtn.title       = "სხვა ფაქტი";
  nextFactBtn.textContent = "→";

  factCard.appendChild(factLabel);
  factCard.appendChild(factText);
  factCard.appendChild(nextFactBtn);
  wrapper.appendChild(factCard);

  const warningEl = document.createElement("div");
  warningEl.className = "searching-warning";
  warningEl.textContent = "⚠️ WARNING : გთხოვთ არ ჩაკეცოთ ბრაუზერი";
  wrapper.appendChild(warningEl);

  chat.appendChild(wrapper);
  scheduleScroll();

  function loadFact() {
    nextFactBtn.classList.add("spinning");
    fetch("/api/random-fact")
      .then(r => r.json())
      .then(data => {
        if (data.fact) {
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

  loadFact();
  nextFactBtn.addEventListener("click", loadFact);
}

function addMessage(text, isYou, messageId, replyToData) {
  const id = messageId || generateMsgId();
  const msgEl = document.createElement("div");
  msgEl.className = isYou ? "message-you" : "message-partner";
  msgEl.id = id;

  const wrap = document.createElement("div");
  wrap.className = "message-wrap";

  if (replyToData) {
    const replyEl = document.createElement("div");
    replyEl.className = "message-reply-ref";
    const nameEl = document.createElement("strong");
    nameEl.textContent = replyToData.senderName;
    const textEl = document.createElement("span");
    textEl.textContent = replyToData.text || "(image)";
    replyEl.appendChild(nameEl);
    replyEl.appendChild(textEl);
    wrap.appendChild(replyEl);
  }

  const body = document.createElement("div");
  body.className = "message-body";

  const content = document.createElement("div");
  content.className = "message-content";
  
  // Handle images
  if (text.startsWith("data:image") || text.startsWith("blob:")) {
    const img = document.createElement("img");
    img.src = text;
    img.className = "message-image";
    img.style.maxWidth = "200px";
    img.style.borderRadius = "8px";
    content.appendChild(img);
  } else {
    content.textContent = text;
  }
  
  body.appendChild(content);

  const timeEl = document.createElement("div");
  timeEl.className = "message-time";
  timeEl.textContent = formatTimestamp(new Date());
  body.appendChild(timeEl);

  wrap.appendChild(body);

  const btns = document.createElement("div");
  btns.className = "message-buttons";
  
  const replyBtn = document.createElement("button");
  replyBtn.className = "msg-btn";
  replyBtn.textContent = "↩";
  replyBtn.title = "Reply";
  replyBtn.addEventListener("click", () => {
    const senderName = isYou ? userName : partnerName;
    setReply(id, text.substring(0, 50), senderName);
  });
  btns.appendChild(replyBtn);

  wrap.appendChild(btns);
  msgEl.appendChild(wrap);
  chat.appendChild(msgEl);
  scheduleScroll();
}

// ── Add Person Feature ───────────────────────────────────────────────────────
function showAddPersonButton() {
  if (isLoggedIn && partnerConnected) {
    addPersonContainer.style.display = "block";
  }
}

function hideAddPersonButton() {
  addPersonContainer.style.display = "none";
}

// ── Authentication UI Handlers ───────────────────────────────────────────────

function showEntryChoiceModal() {
  entryChoiceModal.style.display = "flex";
  guestNameModal.style.display = "none";
  accountModal.style.display = "none";
  userDashboardModal.style.display = "none";
}

function showGuestNameModal() {
  entryChoiceModal.style.display = "none";
  guestNameModal.style.display = "flex";
  guestNameError.textContent = "";
  guestNameInput.value = "";
  setTimeout(() => guestNameInput.focus(), 100);
}

function showAccountModal() {
  entryChoiceModal.style.display = "none";
  accountModal.style.display = "flex";
  accountLoginForm.style.display = "block";
  accountSignupForm.style.display = "none";
  loginError.textContent = "";
  loginUsername.value = "";
  loginPassword.value = "";
  setTimeout(() => loginUsername.focus(), 100);
}

function showDashboard() {
  entryChoiceModal.style.display = "none";
  guestNameModal.style.display = "none";
  accountModal.style.display = "none";
  userDashboardModal.style.display = "flex";
  dashboardUsername.textContent = `Welcome, ${loggedInUsername}`;
  updateDashboard();
}

function updateDashboard() {
  // Update added people list
  if (addedPeople.length === 0) {
    addedPeopleList.innerHTML = '<p class="empty-message">No friends added yet</p>';
  } else {
    addedPeopleList.innerHTML = addedPeople.map(person => `
      <div class="added-person-item">
        <span class="person-name">${person}</span>
      </div>
    `).join("");
  }

  // Update friend requests list
  if (friendRequests.length === 0) {
    friendRequestsList.innerHTML = '<p class="empty-message">No friend requests</p>';
  } else {
    friendRequestsList.innerHTML = friendRequests.map(req => `
      <div class="friend-request-item">
        <span class="request-name">${req.from}</span>
        <div class="request-actions">
          <button class="action-btn accept" onclick="acceptFriendRequest('${req.from}')">✓</button>
          <button class="action-btn decline" onclick="declineFriendRequest('${req.from}')">✕</button>
        </div>
      </div>
    `).join("");
  }
}

// API Handlers for Account System
async function handleGuestStart() {
  const name = guestNameInput.value.trim();
  if (!name) {
    guestNameError.textContent = "Please enter a name";
    return;
  }
  if (name.length < 2 || name.length > 20) {
    guestNameError.textContent = "Name must be 2-20 characters";
    return;
  }
  
  userName = name;
  guestNameModal.style.display = "none";
  emitSetName(name, false);
}

async function handleSignup() {
  const username = signupUsername.value.trim();
  const password = signupPassword.value;
  const confirm = signupPasswordConfirm.value;

  signupError.textContent = "";

  if (!username || !password || !confirm) {
    signupError.textContent = "All fields required";
    return;
  }
  if (username.length < 2 || username.length > 20) {
    signupError.textContent = "Username must be 2-20 characters";
    return;
  }
  if (password.length < 6) {
    signupError.textContent = "Password must be at least 6 characters";
    return;
  }
  if (password !== confirm) {
    signupError.textContent = "Passwords do not match";
    return;
  }

  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      signupError.textContent = data.error || "Signup failed";
      return;
    }
    saveAccountInfo(username);
    userName = username;
    accountModal.style.display = "none";
    showDashboard();
  } catch (err) {
    signupError.textContent = "Network error";
  }
}

async function handleLogin() {
  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  loginError.textContent = "";

  if (!username || !password) {
    loginError.textContent = "All fields required";
    return;
  }

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || "Login failed";
      return;
    }
    saveAccountInfo(username);
    userName = username;
    accountModal.style.display = "none";
    showDashboard();
  } catch (err) {
    loginError.textContent = "Network error";
  }
}

// Friend Request Handlers
async function sendFriendRequest() {
  if (!isLoggedIn || !partnerConnected || !currentPartnerUsername) {
    addSystemMessage("❌ Can only add friends who are logged in!");
    return;
  }
  
  try {
    const res = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: loggedInUsername,
        to: currentPartnerUsername
      })
    });
    const data = await res.json();
    if (res.ok) {
      addSystemMessage(`✅ Friend request sent to ${currentPartnerUsername}!`);
    } else {
      addSystemMessage(`❌ ${data.error || "Failed to send friend request"}`);
    }
  } catch (err) {
    addSystemMessage("❌ Network error");
  }
}

async function acceptFriendRequest(from) {
  try {
    const res = await fetch("/api/friends/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loggedInUsername,
        from: from
      })
    });
    if (res.ok) {
      friendRequests = friendRequests.filter(r => r.from !== from);
      addedPeople.push(from);
      updateDashboard();
    }
  } catch (err) {
    console.error("Error accepting friend request:", err);
  }
}

async function declineFriendRequest(from) {
  try {
    await fetch("/api/friends/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loggedInUsername,
        from: from
      })
    });
    friendRequests = friendRequests.filter(r => r.from !== from);
    updateDashboard();
  } catch (err) {
    console.error("Error declining friend request:", err);
  }
}

// ── Socket Listeners ──────────────────────────────────────────────────────────

socket.on("connect", () => {
  // Auto-reconnect logged-in users
  if (isLoggedIn && userName) {
    fetch("/api/challenge")
      .then(r => r.json())
      .then(d => {
        _challengeToken = d.token;
        _challengePow = (d.nonce * 31 + d.nonce % 97);
        isReconnecting = true;
        emitSetName(userName, isLoggedIn);
      })
      .catch(() => {
        showEntryChoiceModal();
      });
  }
});

function emitSetName(name, isAccount) {
  if (!_challengeToken) {
    console.warn("No challenge token, retrying...");
    setTimeout(() => emitSetName(name, isAccount), 500);
    return;
  }

  socket.emit("setName", {
    name: name,
    isAccount: isAccount,
    token: _challengeToken,
    powAnswer: _challengePow,
    webdriver: !!navigator.webdriver,
  });
}

socket.on("nameSet", (data) => {
  userName = data.name;
  currentPartnerUsername = "";
  isFirstLogin = false;
  
  if (isLoggedIn) {
    showDashboard();
  } else {
    entryChoiceModal.style.display = "none";
    guestNameModal.style.display = "none";
    accountModal.style.display = "none";
    setInputsEnabled(false);
    messageInput.disabled = true;
  }
});

socket.on("partnerFound", (data) => {
  playNotification("partnerFound");
  partnerConnected = true;
  partnerName = data.name;
  currentPartnerUsername = data.username || "";
  
  setPartnerNameDisplay(partnerName);
  document.getElementById("searchingMsg")?.remove();
  setInputsEnabled(true);
  messageInput.disabled = false;
  
  // Show Add Person button only if both are logged in
  if (isLoggedIn && currentPartnerUsername) {
    showAddPersonButton();
  } else {
    hideAddPersonButton();
  }
});

socket.on("messageReceived", (data) => {
  playNotification("message");
  incrementUnread();
  addMessage(data.text, false, data.id, data.replyTo);
});

socket.on("partnerDisconnected", () => {
  partnerConnected = false;
  partnerName = "";
  setPartnerNameDisplay("");
  lastPartnerName = partnerName;
  hideAddPersonButton();
  addDisconnectMessage("Partner disconnected");
  setInputsEnabled(false);
});

socket.on("friendRequest", (data) => {
  const req = { from: data.from };
  if (!friendRequests.find(r => r.from === data.from)) {
    friendRequests.push(req);
  }
  
  friendRequestText.textContent = `${data.from} sent you a friend request!`;
  friendRequestNotification.style.display = "flex";
  
  acceptFriendBtn.onclick = () => {
    acceptFriendRequest(data.from);
    friendRequestNotification.style.display = "none";
  };
  declineFriendBtn.onclick = () => {
    declineFriendRequest(data.from);
    friendRequestNotification.style.display = "none";
  };
});

// ── Remaining button handlers ──────────────────────────────────────────────────

function setPartnerNameDisplay(name) {
  const el = document.getElementById("partnerNameDisplay");
  if (el) {
    if (name) {
      el.textContent = name;
      el.style.display = "inline";
    } else {
      el.style.display = "none";
    }
  }
}

function setUserNameDisplay(name) {
  const el = document.getElementById("userNameDisplay");
  if (el) {
    if (name && isLoggedIn) {
      el.textContent = `@${name}`;
      el.style.display = "inline";
    } else {
      el.style.display = "none";
    }
  }
}

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  gifBtn.disabled = !enabled;
  photoBtn.disabled = !enabled;
  questionBtn.disabled = !enabled;
}

function clearChat() {
  chat.innerHTML = "";
}

function setReply(msgId, text, senderName) {
  replyTo = { messageId: msgId, text, senderName };
  replyPreview.style.display = "block";
  replyPreviewName.textContent = senderName;
  replyPreviewText.textContent = text;
}

function clearReply() {
  replyTo = null;
  replyPreview.style.display = "none";
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  
  const msgId = generateMsgId();
  addMessage(text, true, msgId, replyTo);
  
  socket.emit("message", {
    text: text,
    replyTo: replyTo ? { text: replyTo.text, senderName: replyTo.senderName, messageId: replyTo.messageId } : null
  });
  
  messageInput.value = "";
  messageInput.style.height = "auto";
  charCount.textContent = "";
  clearReply();
}

function closeGifPickerPanel() {
  gifPicker.style.display = "none";
  gifPickerOpen = false;
}

function goToWelcome() {
  clearAccountInfo();
  showEntryChoiceModal();
  clearChat();
  partnerConnected = false;
  partnerName = "";
  currentPartnerUsername = "";
  setPartnerNameDisplay("");
}

function startSearchRetry() {
  if (searchRetryInterval) return;
  searchRetryInterval = setInterval(() => {
    if (!partnerConnected) {
      socket.emit("next");
    }
  }, 15000);
}

function stopSearchRetry() {
  if (searchRetryInterval) {
    clearInterval(searchRetryInterval);
    searchRetryInterval = null;
  }
}

function hideTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (el) el.style.display = "none";
  isTyping = false;
  if (typingTimeout) clearTimeout(typingTimeout);
}

function updateBlockBtn() {
  blockBtn.disabled = !partnerConnected && !canBlockDisconnected;
}

function clearNameError() {
  if (nameError) nameError.textContent = "";
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Load account info if available
  loadAccountInfo();
  
  if (isLoggedIn) {
    // Logged in user: try to auto-connect
    setUserNameDisplay(loggedInUsername);
    if (socket.connected) {
      fetch("/api/challenge")
        .then(r => r.json())
        .then(d => {
          _challengeToken = d.token;
          _challengePow = (d.nonce * 31 + d.nonce % 97);
          emitSetName(loggedInUsername, true);
        })
        .catch(() => {
          showDashboard();
        });
    } else {
      socket.once("connect", () => {
        fetch("/api/challenge")
          .then(r => r.json())
          .then(d => {
            _challengeToken = d.token;
            _challengePow = (d.nonce * 31 + d.nonce % 97);
            emitSetName(loggedInUsername, true);
          })
          .catch(() => {
            showDashboard();
          });
      });
    }
  } else {
    // Not logged in: show entry choice
    showEntryChoiceModal();
  }

  // Entry choice handlers
  guestBtn.addEventListener("click", showGuestNameModal);
  accountBtn.addEventListener("click", showAccountModal);

  // Guest name modal
  guestStartBtn.addEventListener("click", handleGuestStart);
  guestNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleGuestStart();
  });

  // Account form toggle
  switchToSignupBtn.addEventListener("click", () => {
    accountLoginForm.style.display = "none";
    accountSignupForm.style.display = "block";
    loginError.textContent = "";
    signupError.textContent = "";
    signupUsername.focus();
  });

  switchToLoginBtn.addEventListener("click", () => {
    accountLoginForm.style.display = "block";
    accountSignupForm.style.display = "none";
    loginError.textContent = "";
    signupError.textContent = "";
    loginUsername.focus();
  });

  // Account form handlers
  signupBtn.addEventListener("click", handleSignup);
  loginBtn.addEventListener("click", handleLogin);

  signupPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSignup();
  });
  loginPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  // Dashboard
  profileBtn.addEventListener("click", showDashboard);
  logoutBtn.addEventListener("click", () => {
    clearAccountInfo();
    userDashboardModal.style.display = "none";
    showEntryChoiceModal();
  });
  dashboardCloseBtn.addEventListener("click", () => {
    userDashboardModal.style.display = "none";
  });

  startChatBtn.addEventListener("click", () => {
    userDashboardModal.style.display = "none";
    setInputsEnabled(false);
    clearChat();
    addSearchingMessage();
    socket.emit("next");
    startSearchRetry();
    showAddPersonButton();
  });

  // Add Person button
  addPersonBtn.addEventListener("click", sendFriendRequest);

  // Modal close buttons
  accountModalClose.addEventListener("click", () => {
    accountModal.style.display = "none";
    showEntryChoiceModal();
  });

  // Legacy name input (for backward compatibility)
  changeNameBtn.addEventListener("click", () => {
    if (isLoggedIn) {
      showDashboard();
    } else {
      showGuestNameModal();
    }
  });

  // Message input handlers
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!messageInput.disabled) sendMessage();
    }
  });

  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
    messageInput.style.overflowY = messageInput.scrollHeight > 120 ? "auto" : "hidden";
    const len = messageInput.value.length;
    charCount.textContent = len > 0 ? `${len}/2000` : ``;
    charCount.classList.toggle("warning", len > 1800);
  });

  sendBtn.addEventListener("click", sendMessage);
  replyPreviewClose.addEventListener("click", clearReply);

  // Interests button (if needed)
  if (interestsBtn) {
    interestsBtn.addEventListener("click", () => {
      bioPopup.style.display = "flex";
    });
  }

  // Bio popup
  if (bioPopup) {
    document.getElementById("bioCloseBtn").addEventListener("click", () => {
      bioPopup.style.display = "none";
    });
    bioSaveBtn.addEventListener("click", () => {
      userBio = bioInput.value;
      bioPopup.style.display = "none";
    });
    bioClearBtn.addEventListener("click", () => {
      bioInput.value = "";
    });
    bioInput.addEventListener("input", () => {
      bioCharCount.textContent = `${bioInput.value.length}/60`;
    });
  }

  // Gif picker (basic)
  if (gifPickerClose) {
    gifPickerClose.addEventListener("click", closeGifPickerPanel);
  }

  // Online count
  socket.on("onlineCount", (count) => {
    if (onlineCountEl) {
      onlineCountEl.textContent = `${count} online`;
    }
  });
});
