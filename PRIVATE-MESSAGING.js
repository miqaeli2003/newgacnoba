// ══════════════════════════════════════════════════════════════════════════════
// PRIVATE MESSAGING SYSTEM WITH 12-HOUR AUTO-DELETE
// Add to server.js - Complete implementation
// ══════════════════════════════════════════════════════════════════════════════

// ── Private Message Storage ───────────────────────────────────────────────────
// In-memory storage (replace with database in production)
const privateMessages = new Map(); // "user1:user2" => [{ from, text, timestamp }]
const MESSAGE_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

function getConversationKey(user1, user2) {
  // Normalize so conversation is same regardless of order
  const users = [user1, user2].sort();
  return `${users[0]}:${users[1]}`.toLowerCase();
}

function getMessageExpiry() {
  return Date.now() + MESSAGE_EXPIRY_MS;
}

function cleanupExpiredMessages() {
  // Clean up expired messages every hour
  const now = Date.now();
  
  for (const [key, messages] of privateMessages.entries()) {
    // Filter out expired messages
    const filtered = messages.filter(msg => msg.expiresAt > now);
    
    if (filtered.length === 0) {
      // Delete conversation if no messages left
      privateMessages.delete(key);
    } else if (filtered.length < messages.length) {
      // Update with remaining messages
      privateMessages.set(key, filtered);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredMessages, 60 * 60 * 1000);

// ── Private Message API Routes ─────────────────────────────────────────────────

app.post("/api/messages/send", express.json(), async (req, res) => {
  const { from, to, text } = req.body;

  if (!from || !to || !text) {
    return res.status(400).json({ error: "from, to, and text required" });
  }

  // Verify both users exist
  const fromUser = users.get(from.toLowerCase());
  const toUser = users.get(to.toLowerCase());

  if (!fromUser || !toUser) {
    return res.status(404).json({ error: "User not found" });
  }

  // Verify they are friends
  if (!fromUser.friends.includes(to)) {
    return res.status(403).json({ error: "You are not friends" });
  }

  // Create message
  const messageId = `${from}:${Date.now()}:${Math.random()}`;
  const message = {
    id: messageId,
    from: from,
    text: text,
    timestamp: Date.now(),
    expiresAt: getMessageExpiry(),
    read: false
  };

  // Store message
  const conversationKey = getConversationKey(from, to);
  if (!privateMessages.has(conversationKey)) {
    privateMessages.set(conversationKey, []);
  }
  privateMessages.get(conversationKey).push(message);

  // Notify recipient via socket
  const sockets = io.sockets.sockets;
  for (const [, socket] of sockets) {
    if (socket.accountUsername === to) {
      socket.emit("privateMessage", {
        from: from,
        text: text,
        timestamp: message.timestamp,
        messageId: messageId
      });
      break;
    }
  }

  res.json({ 
    success: true, 
    messageId: messageId,
    expiresAt: message.expiresAt 
  });
});

app.get("/api/messages/history", (req, res) => {
  const { username, friend } = req.query;

  if (!username || !friend) {
    return res.status(400).json({ error: "username and friend required" });
  }

  const user = users.get(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Check if friends
  if (!user.friends.includes(friend)) {
    return res.status(403).json({ error: "Not friends" });
  }

  const conversationKey = getConversationKey(username, friend);
  const messages = privateMessages.get(conversationKey) || [];

  // Filter out expired messages (extra safety check)
  const now = Date.now();
  const validMessages = messages.filter(msg => msg.expiresAt > now);

  // Sort by timestamp (oldest first)
  validMessages.sort((a, b) => a.timestamp - b.timestamp);

  res.json({
    messages: validMessages.map(msg => ({
      id: msg.id,
      from: msg.from,
      text: msg.text,
      timestamp: msg.timestamp,
      expiresAt: msg.expiresAt,
      timeUntilDelete: Math.max(0, msg.expiresAt - now),
      read: msg.read
    }))
  });
});

app.post("/api/messages/delete-all", express.json(), (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "username required" });
  }

  const user = users.get(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Delete all conversations for this user
  let deletedCount = 0;
  for (const [key, messages] of privateMessages.entries()) {
    const [user1, user2] = key.split(":");
    if (user1 === username.toLowerCase() || user2 === username.toLowerCase()) {
      privateMessages.delete(key);
      deletedCount++;
    }
  }

  res.json({ success: true, deletedCount });
});

app.post("/api/messages/clear-conversation", express.json(), (req, res) => {
  const { username, friend } = req.body;

  if (!username || !friend) {
    return res.status(400).json({ error: "username and friend required" });
  }

  const conversationKey = getConversationKey(username, friend);
  privateMessages.delete(conversationKey);

  res.json({ success: true });
});

// ── Socket.io Events for Private Messaging ─────────────────────────────────────

// Add these inside the io.on("connection", (socket) => { ... }) block

socket.on("openPrivateChat", (data) => {
  // data.username = current user
  // data.friend = friend to chat with
  const conversationKey = getConversationKey(data.username, data.friend);
  
  // Subscribe socket to this conversation room
  socket.join(`private:${conversationKey}`);
  
  socket.emit("privateChatOpened", { 
    friend: data.friend,
    conversationKey: conversationKey
  });
});

socket.on("closePrivateChat", (data) => {
  const conversationKey = data.conversationKey;
  socket.leave(`private:${conversationKey}`);
});

socket.on("sendPrivateMessage", (data) => {
  // data.from = sender username
  // data.to = recipient username
  // data.text = message text
  
  const fromUser = users.get(data.from.toLowerCase());
  const toUser = users.get(data.to.toLowerCase());
  
  if (!fromUser || !toUser) {
    socket.emit("error", { msg: "User not found" });
    return;
  }
  
  if (!fromUser.friends.includes(data.to)) {
    socket.emit("error", { msg: "Not friends" });
    return;
  }
  
  // Create message
  const messageId = `${data.from}:${Date.now()}:${Math.random()}`;
  const message = {
    id: messageId,
    from: data.from,
    text: data.text,
    timestamp: Date.now(),
    expiresAt: getMessageExpiry(),
    read: false
  };
  
  // Store message
  const conversationKey = getConversationKey(data.from, data.to);
  if (!privateMessages.has(conversationKey)) {
    privateMessages.set(conversationKey, []);
  }
  privateMessages.get(conversationKey).push(message);
  
  // Emit to conversation room
  io.to(`private:${conversationKey}`).emit("privateMessageReceived", {
    id: messageId,
    from: data.from,
    text: data.text,
    timestamp: message.timestamp,
    expiresAt: message.expiresAt,
    timeUntilDelete: MESSAGE_EXPIRY_MS
  });
  
  // Notify recipient if not in conversation
  const sockets = io.sockets.sockets;
  for (const [, sock] of sockets) {
    if (sock.accountUsername === data.to && 
        !sock.rooms.has(`private:${conversationKey}`)) {
      sock.emit("privateMessageNotification", {
        from: data.from,
        preview: data.text.substring(0, 50),
        timestamp: message.timestamp
      });
      break;
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Frontend JavaScript - Add to script.js
// ═══════════════════════════════════════════════════════════════════════════════

// ── Private Message State ──────────────────────────────────────────────────────
let privateChats = new Map();          // username => { messages: [], unread: 0 }
let currentPrivateChatPartner = null;  // Current open chat partner
let privateChatMessages = [];          // Current conversation messages

// ── Private Chat UI Elements ──────────────────────────────────────────────────
const privateChatModal = document.getElementById("privateChatModal") || 
  createPrivateChatModal();
const privateChatTitle = document.getElementById("privateChatTitle");
const privateChatMessages_el = document.getElementById("privateChatMessagesArea");
const privateChatInput = document.getElementById("privateChatInput");
const privateChatSendBtn = document.getElementById("privateChatSendBtn");
const privateChatCloseBtn = document.getElementById("privateChatCloseBtn");
const privateChatList = document.getElementById("privateChatList");

// Create private chat modal if it doesn't exist
function createPrivateChatModal() {
  const modal = document.createElement("div");
  modal.id = "privateChatModal";
  modal.className = "modal";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-content private-chat-window">
      <div class="private-chat-header">
        <h3 id="privateChatTitle">Chat with Friend</h3>
        <span id="privateChatTimer" class="message-timer"></span>
        <button id="privateChatCloseBtn" class="modal-close-btn">✕</button>
      </div>
      <div id="privateChatMessagesArea" class="private-chat-messages"></div>
      <div class="private-chat-expiry-notice">
        💾 Messages delete automatically in 12 hours
      </div>
      <div class="private-chat-input-area">
        <textarea id="privateChatInput" placeholder="Type your message..." 
                  maxlength="2000" rows="3"></textarea>
        <button id="privateChatSendBtn" class="private-chat-send">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

// ── Open Private Chat ──────────────────────────────────────────────────────────
async function openPrivateChat(friend) {
  currentPrivateChatPartner = friend;
  privateChatTitle.textContent = `Chat with ${friend}`;
  privateChatMessages_el.innerHTML = "";
  
  // Tell server we opened this conversation
  socket.emit("openPrivateChat", {
    username: loggedInUsername,
    friend: friend
  });
  
  // Load message history
  try {
    const res = await fetch(
      `/api/messages/history?username=${loggedInUsername}&friend=${friend}`
    );
    const data = await res.json();
    
    if (data.messages) {
      privateChatMessages = data.messages;
      renderPrivateChatMessages();
      updateMessageTimers();
    }
  } catch (err) {
    console.error("Failed to load chat history:", err);
  }
  
  // Show modal
  privateChatModal.style.display = "flex";
  setTimeout(() => privateChatInput.focus(), 100);
}

// ── Close Private Chat ────────────────────────────────────────────────────────
function closePrivateChat() {
  if (currentPrivateChatPartner) {
    socket.emit("closePrivateChat", {
      conversationKey: getConversationKey(loggedInUsername, currentPrivateChatPartner)
    });
  }
  currentPrivateChatPartner = null;
  privateChatMessages = [];
  privateChatModal.style.display = "none";
}

// ── Render Messages ────────────────────────────────────────────────────────────
function renderPrivateChatMessages() {
  privateChatMessages_el.innerHTML = "";
  
  privateChatMessages.forEach(msg => {
    const el = document.createElement("div");
    el.className = msg.from === loggedInUsername ? "private-msg-you" : "private-msg-them";
    el.id = `msg-${msg.id}`;
    
    const timeLeft = Math.max(0, msg.expiresAt - Date.now());
    const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
    
    el.innerHTML = `
      <div class="private-msg-body">
        <p>${escapeHtml(msg.text)}</p>
        <small class="private-msg-time">
          ${formatTimestamp(new Date(msg.timestamp))}
          <span class="delete-timer">• Deletes in ${hoursLeft}h</span>
        </small>
      </div>
    `;
    
    privateChatMessages_el.appendChild(el);
  });
  
  // Scroll to bottom
  privateChatMessages_el.scrollTop = privateChatMessages_el.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Send Private Message ───────────────────────────────────────────────────────
async function sendPrivateMessage() {
  if (!currentPrivateChatPartner) return;
  
  const text = privateChatInput.value.trim();
  if (!text) return;
  
  privateChatInput.value = "";
  privateChatInput.style.height = "auto";
  
  // Send via socket
  socket.emit("sendPrivateMessage", {
    from: loggedInUsername,
    to: currentPrivateChatPartner,
    text: text
  });
}

// ── Update Message Timers ──────────────────────────────────────────────────────
function updateMessageTimers() {
  const now = Date.now();
  
  privateChatMessages.forEach(msg => {
    const el = document.getElementById(`msg-${msg.id}`);
    if (!el) return;
    
    const timeLeft = Math.max(0, msg.expiresAt - now);
    const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
    const timerEl = el.querySelector(".delete-timer");
    
    if (timerEl) {
      if (hoursLeft <= 0) {
        el.remove();
      } else {
        timerEl.textContent = `• Deletes in ${hoursLeft}h`;
      }
    }
  });
}

// Update timers every minute
setInterval(() => {
  if (currentPrivateChatPartner) {
    updateMessageTimers();
  }
}, 60 * 1000);

// ── Socket Events for Private Messages ────────────────────────────────────────
socket.on("privateMessage", (data) => {
  // Notification received while not in conversation
  if (!privateChats.has(data.from)) {
    privateChats.set(data.from, { messages: [], unread: 0 });
  }
  const chat = privateChats.get(data.from);
  chat.unread++;
  
  // Show toast notification
  showPrivateMessageNotification(data.from, data.text);
  
  // Update chat list
  updatePrivateChatList();
});

socket.on("privateMessageReceived", (data) => {
  // Message received in open conversation
  if (currentPrivateChatPartner === data.from || 
      currentPrivateChatPartner === data.from) {
    privateChatMessages.push({
      id: data.id,
      from: data.from,
      text: data.text,
      timestamp: data.timestamp,
      expiresAt: data.expiresAt
    });
    renderPrivateChatMessages();
  }
});

socket.on("privateMessageNotification", (data) => {
  // Notify if not in this conversation
  if (currentPrivateChatPartner !== data.from) {
    showPrivateMessageNotification(data.from, data.preview);
  }
});

// ── Show Notification Toast ────────────────────────────────────────────────────
function showPrivateMessageNotification(from, text) {
  const toast = document.createElement("div");
  toast.className = "private-message-toast";
  toast.innerHTML = `
    <strong>${from}</strong>: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}
  `;
  toast.onclick = () => {
    if (isLoggedIn) {
      openPrivateChat(from);
      toast.remove();
    }
  };
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ── Update Private Chat List (in Dashboard) ────────────────────────────────────
function updatePrivateChatList() {
  // Add to dashboard
  if (!privateChatList) return;
  
  privateChatList.innerHTML = "";
  
  if (addedPeople.length === 0) {
    privateChatList.innerHTML = '<p class="empty-message">No friends yet</p>';
    return;
  }
  
  addedPeople.forEach(friend => {
    const item = document.createElement("div");
    item.className = "private-chat-item";
    
    const chat = privateChats.get(friend) || { unread: 0 };
    const unreadBadge = chat.unread > 0 ? 
      `<span class="unread-badge">${chat.unread}</span>` : "";
    
    item.innerHTML = `
      <span class="friend-name">${friend}</span>
      ${unreadBadge}
      <button class="open-chat-btn" onclick="openPrivateChat('${friend}')">💬</button>
    `;
    
    privateChatList.appendChild(item);
  });
}

// ── Event Listeners ────────────────────────────────────────────────────────────
privateChatSendBtn.addEventListener("click", sendPrivateMessage);
privateChatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendPrivateMessage();
  }
});
privateChatCloseBtn.addEventListener("click", closePrivateChat);

// Auto-update dashboard when viewing it
document.addEventListener("DOMContentLoaded", () => {
  // After loading account info, update chat list
  if (isLoggedIn) {
    updatePrivateChatList();
  }
});

function getConversationKey(user1, user2) {
  const users = [user1, user2].sort();
  return `${users[0]}:${users[1]}`.toLowerCase();
}
