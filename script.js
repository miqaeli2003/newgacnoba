const socket = io();
let userName = "", partnerConnected = false, replyingTo = null;

const chat = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const gifBtn = document.getElementById("gifBtn");
const replyIndicator = document.getElementById("replyIndicator");

const genId = () => Math.random().toString(36).substr(2, 9);

function addMessage(data, isYou) {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${isYou ? 'you' : 'partner'}`;
  wrapper.id = `msg-${data.id}`;

  const content = document.createElement("div");
  content.className = `message-content ${isYou ? 'you' : ''}`;

  if (data.replyText) {
    const rp = document.createElement("div");
    rp.className = "reply-preview";
    rp.textContent = data.replyText;
    content.appendChild(rp);
  }

  if (data.type === 'gif') {
    const img = document.createElement("img");
    img.src = data.text; img.style.maxWidth = "200px";
    content.appendChild(img);
  } else {
    content.appendChild(document.createTextNode(data.text));
  }

  const ts = document.createElement("span");
  ts.className = "timestamp";
  ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  content.appendChild(ts);

  const badge = document.createElement("div");
  badge.className = "reaction-badge";
  badge.style.display = "none";
  content.appendChild(badge);

  wrapper.appendChild(content);

  // Add Icons to the right side of partner messages
  if (!isYou) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML = `
      <button class="action-icon" onclick="setReply('${data.text}')">↩️</button>
      <button class="action-icon" onclick="sendReact('${data.id}', '❤️')">❤️</button>
    `;
    wrapper.appendChild(actions);
  }

  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

window.setReply = (text) => {
  replyingTo = text;
  replyIndicator.style.display = "flex";
  document.getElementById("replyText").textContent = `Replying to: ${text}`;
  messageInput.focus();
};

window.sendReact = (id, emoji) => {
  socket.emit("react", { id, emoji });
  showReact(id, emoji);
};

function showReact(id, emoji) {
  const m = document.getElementById(`msg-${id}`);
  if (m) {
    const b = m.querySelector(".reaction-badge");
    b.textContent = emoji; b.style.display = "block";
  }
}

function sendMsg(type = 'text', val = null) {
  const text = val || messageInput.value.trim();
  if (!text || !partnerConnected) return;
  const data = { id: genId(), text, type, replyText: replyingTo };
  socket.emit("message", data);
  addMessage(data, true);
  messageInput.value = "";
  replyingTo = null;
  replyIndicator.style.display = "none";
}

// GIFs
const gifUrls = ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJueXByZ3B6NHZidHByZ3B6NHZidHByZ3B6NHZidHByZ3B6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/ICOgUNjpvO0PC/giphy.gif", "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJueXByZ3B6NHZidHByZ3B6NHZidHByZ3B6NHZidHByZ3B6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/vFKqnCdLPNOKc/giphy.gif"];
gifBtn.onclick = () => {
  document.getElementById("gifModal").style.display = "flex";
  const grid = document.getElementById("gifGrid");
  grid.innerHTML = "";
  gifUrls.forEach(u => {
    const i = document.createElement("img");
    i.src = u; i.onclick = () => { sendMsg('gif', u); document.getElementById("gifModal").style.display = "none"; };
    grid.appendChild(i);
  });
};

socket.on("message", d => addMessage(d, false));
socket.on("react", d => showReact(d.id, d.emoji));
socket.on("partnerFound", p => { partnerConnected = true; setDisabled(false); });
socket.on("partnerDisconnected", () => { partnerConnected = false; setDisabled(true); });
socket.on("nameAccepted", n => { userName = n; document.getElementById("nameModal").style.display="none"; socket.emit("findPartner"); });

document.getElementById("saveNameBtn").onclick = () => socket.emit("setName", document.getElementById("nameInput").value);
sendBtn.onclick = () => sendMsg();
document.getElementById("cancelReply").onclick = () => { replyingTo = null; replyIndicator.style.display = "none"; };
function setDisabled(b) { messageInput.disabled = b; sendBtn.disabled = b; gifBtn.disabled = b; document.getElementById("blockBtn").disabled = b; }
