const socket = io();

let userName = "";
let partnerConnected = false;
let partnerName = "";
let isFirstLogin = true;
let replyingTo = null; // Stores {id, text, name}

const chat = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const nextBtn = document.getElementById("nextBtn");
const blockBtn = document.getElementById("blockBtn");
const gifBtn = document.getElementById("gifBtn");
const gifPicker = document.getElementById("gifPicker");
const gifSearch = document.getElementById("gifSearch");
const gifResults = document.getElementById("gifResults");
const replyPreview = document.getElementById("replyPreview");
const replyText = document.getElementById("replyText");
const cancelReply = document.getElementById("cancelReply");

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMessage(data, isYou) {
  const { text, id, replyData, isGif, reactions } = data;

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper " + (isYou ? "you" : "partner");
  wrapper.id = `msg-${id}`;

  // Action Menu (Reply & Reactions)
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  
  // Reaction Emojis
  ["❤️", "😂", "😢"].forEach(emoji => {
    const span = document.createElement("span");
    span.className = "reaction-trigger";
    span.textContent = emoji;
    span.onclick = () => socket.emit("addReaction", { msgId: id, emoji });
    actions.appendChild(span);
  });

  // Reply Icon
  const replyIcon = document.createElement("span");
  replyIcon.className = "reply-trigger";
  replyIcon.innerHTML = '<i class="fas fa-reply"></i>';
  replyIcon.onclick = () => initiateReply(id, text, isYou ? "You" : partnerName);
  actions.appendChild(replyIcon);

  const content = document.createElement("div");
  content.className = "message-content" + (isYou ? " you" : "");

  // Render Reply Context if exists
  if (replyData) {
    const context = document.createElement("div");
    context.className = "replied-context";
    context.textContent = `${replyData.name}: ${replyData.text.substring(0, 40)}...`;
    content.appendChild(context);
  }

  // Text or GIF
  if (isGif) {
    const img = document.createElement("img");
    img.src = text;
    img.className = "gif-img";
    content.appendChild(img);
  } else {
    const p = document.createElement("span");
    p.textContent = text;
    content.appendChild(p);
  }

  const reactDisplay = document.createElement("div");
  reactDisplay.className = "reaction-display";
  reactDisplay.id = `reacts-${id}`;

  wrapper.appendChild(actions);
  wrapper.appendChild(content);
  wrapper.appendChild(reactDisplay);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

function initiateReply(id, text, name) {
  replyingTo = { id, text, name };
  replyText.textContent = `Replying to ${name}...`;
  replyPreview.style.display = "flex";
  messageInput.focus();
}

cancelReply.onclick = () => {
  replyingTo = null;
  replyPreview.style.display = "none";
};

// ── GIF Search ───────────────────────────────────────────────────────────────

gifBtn.onclick = () => {
  gifPicker.style.display = gifPicker.style.display === "flex" ? "none" : "flex";
  gifSearch.focus();
};

gifSearch.addEventListener("input", async (e) => {
  const query = e.target.value;
  if (query.length < 2) return;
  
  // Public Beta Key for demo
  const url = `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query)}&limit=10`;
  try {
    const res = await fetch(url);
    const { data } = await res.json();
    gifResults.innerHTML = "";
    data.forEach(gif => {
      const img = document.createElement("img");
      img.src = gif.images.fixed_height_small.url;
      img.onclick = () => {
        const gifUrl = gif.images.fixed_height.url;
        const msgData = { text: gifUrl, id: Date.now(), isGif: true, replyData: replyingTo };
        socket.emit("message", msgData);
        addMessage(msgData, true);
        gifPicker.style.display = "none";
        cancelReply.onclick();
      };
      gifResults.appendChild(img);
    });
  } catch (err) { console.error(err); }
});

// ── Standard Chat Functions ──────────────────────────────────────────────────

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !partnerConnected) return;

  const msgData = { text, id: Date.now(), replyData: replyingTo, isGif: false };
  addMessage(msgData, true);
  socket.emit("message", msgData);
  
  messageInput.value = "";
  cancelReply.onclick();
}

function setInputsEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  blockBtn.disabled = !enabled;
  gifBtn.disabled = !enabled;
}

// ── Socket Events ─────────────────────────────────────────────────────────────

socket.on("message", (data) => addMessage(data, false));

socket.on("reactionAdded", ({ msgId, emoji }) => {
  const container = document.getElementById(`reacts-${msgId}`);
  if (container) {
    const pill = document.createElement("div");
    pill.className = "reaction-pill";
    pill.textContent = emoji;
    container.appendChild(pill);
  }
});

socket.on("partnerFound", (partner) => {
  chat.innerHTML = "";
  partnerName = partner.name || "Anonymous";
  const sys = document.createElement("div");
  sys.className = "system-message";
  sys.textContent = `Connected to ${partnerName}`;
  chat.appendChild(sys);
  partnerConnected = true;
  setInputsEnabled(true);
});

socket.on("waitingForPartner", () => {
  chat.innerHTML = '<div class="system-message">ვეძებთ ახალ პარტნიორს...</div>';
  partnerConnected = false;
  setInputsEnabled(false);
});

socket.on("partnerDisconnected", (data) => {
  const sys = document.createElement("div");
  sys.className = "system-message-disconnect";
  sys.textContent = `${data.name || "Partner"} has left.`;
  chat.appendChild(sys);
  partnerConnected = false;
  setInputsEnabled(false);
});

// (Rest of the socket events from your original script follow here...)
socket.on("nameAccepted", (name) => {
  userName = name;
  document.getElementById("nameModal").style.display = "none";
  if (isFirstLogin) { isFirstLogin = false; socket.emit("findPartner"); }
});

socket.on("nameTaken", () => alert("ეს სახელი დაკავებულია."));

socket.on("onlineCount", (count) => {
  document.getElementById("onlineCount").textContent = `Users Online: ${count}`;
});

// ── Event Listeners ──────────────────────────────────────────────────────────
sendBtn.onclick = sendMessage;
messageInput.onkeypress = (e) => { if (e.key === "Enter") sendMessage(); };
nextBtn.onclick = () => socket.emit("next");
blockBtn.onclick = () => { if (confirm("ბლოკი?")) socket.emit("blockUser"); };
document.getElementById("saveNameBtn").onclick = () => {
  const n = document.getElementById("nameInput").value.trim();
  if (n) socket.emit("setName", n);
};
document.getElementById("changeNameBtn").onclick = () => {
  document.getElementById("nameModal").style.display = "flex";
};
