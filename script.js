const socket = io();
let userName = "", partnerConnected = false, replyingTo = null;

// Elements
const chat = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const gifModal = document.getElementById("gifModal");
const gifSearch = document.getElementById("gifSearchInput");
const gifGrid = document.getElementById("gifGrid");

const genId = () => Math.random().toString(36).substr(2, 9);

// Add Message to UI
function appendMessage(data, isYou) {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${isYou ? 'you' : 'partner'}`;
  wrapper.id = `msg-${data.id}`;

  let replyHTML = data.reply ? `<div class="reply-preview">${data.reply}</div>` : '';
  
  let contentHTML = data.type === 'gif' 
    ? `<img src="${data.text}" style="max-width:100%; border-radius:10px;" />`
    : `<span>${data.text}</span>`;

  wrapper.innerHTML = `
    <div class="message-content">
      ${replyHTML}
      ${contentHTML}
      <div class="reaction-pills" id="reacts-${data.id}"></div>
    </div>
    ${!isYou ? `
      <div class="msg-options">
        <button class="opt-btn" onclick="handleReply('${data.text}')"><i class="fas fa-reply"></i></button>
        <button class="opt-btn" onclick="sendReact('${data.id}', '😂')">😂</button>
        <button class="opt-btn" onclick="sendReact('${data.id}', '😭')">😭</button>
      </div>
    ` : ''}
  `;

  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

// Logic Functions
window.handleReply = (text) => {
  replyingTo = text;
  document.getElementById("replyBar").style.display = "flex";
  document.getElementById("replyText").textContent = text;
  messageInput.focus();
};

window.sendReact = (id, emoji) => {
  socket.emit("react", { id, emoji });
  addReactionUI(id, emoji);
};

function addReactionUI(id, emoji) {
  const container = document.getElementById(`reacts-${id}`);
  if (container) container.innerHTML = `<span class="pill">${emoji}</span>`;
}

// GIF SEARCH (Using Giphy Public API - You can replace the Key)
async function searchGifs(query = "trending") {
  gifGrid.innerHTML = "Searching...";
  const apiKey = "dc6zaTOxFJmzC"; // Public Beta Key
  const response = await fetch(`https://api.giphy.com/v1/gifs/search?q=${query}&api_key=${apiKey}&limit=10`);
  const { data } = await response.json();
  
  gifGrid.innerHTML = "";
  data.forEach(img => {
    const el = document.createElement("img");
    el.src = img.images.fixed_height.url;
    el.onclick = () => {
      sendData('gif', el.src);
      gifModal.classList.remove("active");
    };
    gifGrid.appendChild(el);
  });
}

function sendData(type, text) {
  if (!partnerConnected) return;
  const data = { id: genId(), type, text, reply: replyingTo };
  socket.emit("message", data);
  appendMessage(data, true);
  clearReply();
}

function clearReply() {
  replyingTo = null;
  document.getElementById("replyIndicator").style.display = "none";
}

// Listeners
document.getElementById("sendBtn").onclick = () => {
  const val = messageInput.value.trim();
  if (val) { sendData('text', val); messageInput.value = ""; }
};

document.getElementById("nextBtn").onclick = () => {
  chat.innerHTML = '<div class="system-msg">ვეძებთ პარტნიორს...</div>';
  socket.emit("next");
};

document.getElementById("gifBtn").onclick = () => {
  gifModal.classList.add("active");
  searchGifs();
};

gifSearch.oninput = (e) => searchGifs(e.target.value);

document.getElementById("saveNameBtn").onclick = () => {
  const n = document.getElementById("nameInput").value;
  socket.emit("setName", n);
};

socket.on("nameAccepted", () => {
  document.getElementById("nameModal").classList.remove("active");
  socket.emit("findPartner");
});

socket.on("partnerFound", (p) => {
  partnerConnected = true;
  chat.innerHTML = `<div class="system-msg">დაკავშირებული ხართ: ${p.name}</div>`;
  toggleInputs(false);
});

socket.on("partnerLeft", () => {
  partnerConnected = false;
  chat.innerHTML += `<div class="system-msg">პარტნიორი გავიდა.</div>`;
  toggleInputs(true);
});

socket.on("message", d => appendMessage(d, false));
socket.on("react", d => addReactionUI(d.id, d.emoji));
socket.on("onlineCount", c => document.getElementById("onlineCount").textContent = `${c} Online`);

function toggleInputs(disabled) {
  messageInput.disabled = disabled;
  document.getElementById("sendBtn").disabled = disabled;
  document.getElementById("gifBtn").disabled = disabled;
  document.getElementById("blockBtn").disabled = disabled;
}

document.getElementById("closeGifBtn").onclick = () => gifModal.classList.remove("active");
document.getElementById("cancelReply").onclick = clearReply;
