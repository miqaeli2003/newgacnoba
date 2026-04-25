'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   script.js  –  GAICANI client
════════════════════════════════════════════════════════════════════════════ */

/* ── Socket ─────────────────────────────────────────────────────────────── */
const socket = io({ transports: ['websocket', 'polling'] });
window.socket = socket;   // expose globally so games.js can reach it

/* ── DOM refs ────────────────────────────────────────────────────────────── */
const chat              = document.getElementById('chat');
const messageInput      = document.getElementById('messageInput');
const sendBtn           = document.getElementById('sendBtn');
const nextBtn           = document.getElementById('nextBtn');
const blockBtn          = document.getElementById('blockBtn');
const questionBtn       = document.getElementById('questionBtn');
const gifBtn            = document.getElementById('gifBtn');
const charCount         = document.getElementById('charCount');
const typingIndicator   = document.getElementById('typingIndicator');
const onlineCountEl     = document.getElementById('onlineCount');
const userNameDisplay   = document.getElementById('userNameDisplay');
const interestsBtn      = document.getElementById('interestsBtn');

// Name modal
const nameModal         = document.getElementById('nameModal');
const nameInput         = document.getElementById('nameInput');
const nameError         = document.getElementById('nameError');
const saveNameBtn       = document.getElementById('saveNameBtn');
const nameModalClose    = document.getElementById('nameModalClose');
const changeNameBtn     = document.getElementById('changeNameBtn');

// Reply preview
const replyPreview      = document.getElementById('replyPreview');
const replyPreviewName  = document.getElementById('replyPreviewName');
const replyPreviewText  = document.getElementById('replyPreviewText');
const replyPreviewClose = document.getElementById('replyPreviewClose');

// GIF picker
const gifPicker         = document.getElementById('gifPicker');
const gifSearch         = document.getElementById('gifSearch');
const gifResults        = document.getElementById('gifResults');
const gifPickerClose    = document.getElementById('gifPickerClose');
const gifLoading        = document.getElementById('gifLoading');

// Bio popup
const bioPopup          = document.getElementById('bioPopup');
const bioInput          = document.getElementById('bioInput');
const bioCharCount      = document.getElementById('bioCharCount');
const bioClearBtn       = document.getElementById('bioClearBtn');
const bioSaveBtn        = document.getElementById('bioSaveBtn');
const bioCloseBtn       = document.getElementById('bioCloseBtn');

/* ── State ───────────────────────────────────────────────────────────────── */
let myName       = '';
let myBio        = '';
let partnerName  = '';
let isConnected  = false;   // paired with someone
let replyTarget  = null;    // { name, text }
let typingTimer  = null;
let isTyping     = false;
let gifDebounce  = null;
let tenorNextPos = '';
const TENOR_KEY  = 'AIzaSyC9GG_Q7x0GEH9vFYPdLY7bFtPuvKVjXEI'; // replace if needed

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function enableInput(on) {
  messageInput.disabled = !on;
  sendBtn.disabled      = !on;
  questionBtn.disabled  = !on;
  gifBtn.disabled       = !on;
  blockBtn.disabled     = !on;
}

function scrollBottom() {
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

function formatTime() {
  const d = new Date();
  return d.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── Message rendering ───────────────────────────────────────────────────── */
function appendMessage({ who, name, text, gifUrl, replyTo, isSystem, isFact, isQuestion }) {
  const div = document.createElement('div');

  if (isSystem) {
    div.className = 'msg msg--system';
    div.textContent = text;
    chat.appendChild(div);
    scrollBottom();
    return;
  }

  div.className = `msg msg--${who}`;   // msg--me | msg--partner

  let html = '';

  // Reply quote
  if (replyTo) {
    html += `
      <div class="msg-reply-quote">
        <span class="msg-reply-quote-name">${escapeHtml(replyTo.name)}</span>
        <span class="msg-reply-quote-text">${escapeHtml(replyTo.text)}</span>
      </div>`;
  }

  // Bubble
  html += `<div class="msg-bubble">`;

  if (isFact || isQuestion) {
    html += `<div class="msg-label">${isFact ? '💡 ფაქტი' : '❓ კითხვა'}</div>`;
  }

  if (text) {
    html += `<div class="msg-text">${escapeHtml(text)}</div>`;
  }
  if (gifUrl) {
    html += `<img class="msg-gif" src="${escapeHtml(gifUrl)}" alt="GIF" loading="lazy" />`;
  }

  html += `<span class="msg-time">${formatTime()}</span>`;
  html += `</div>`; // .msg-bubble

  div.innerHTML = html;

  // Allow partner messages to be replied-to
  if (who === 'partner') {
    div.addEventListener('click', () => {
      replyTarget = { name: partnerName || 'პარტნიორი', text: text || '📷 GIF' };
      replyPreviewName.textContent = replyTarget.name;
      replyPreviewText.textContent = replyTarget.text;
      replyPreview.style.display   = 'flex';
      messageInput.focus();
    });
  }

  chat.appendChild(div);
  scrollBottom();
}

function appendSystemMsg(text) {
  appendMessage({ isSystem: true, text });
}

/* ── Typing events ───────────────────────────────────────────────────────── */
function stopTyping() {
  if (isTyping) {
    isTyping = false;
    socket.emit('typing', { isTyping: false });
  }
}

messageInput.addEventListener('input', () => {
  // Char counter
  const len = messageInput.value.length;
  charCount.textContent = len > 0 ? `${len}/500` : '';
  charCount.style.color = len > 450 ? '#f23f42' : '';

  // Typing indicator
  if (!isTyping && isConnected) {
    isTyping = true;
    socket.emit('typing', { isTyping: true });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2000);
});

messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ── Send message ────────────────────────────────────────────────────────── */
function sendMessage() {
  const text = messageInput.value.trim().slice(0, 500);
  if (!text || !isConnected) return;

  const payload = { text, replyTo: replyTarget };
  socket.emit('message', payload);
  appendMessage({ who: 'me', name: myName, text, replyTo: replyTarget });

  messageInput.value = '';
  charCount.textContent = '';
  stopTyping();
  clearReply();
}

sendBtn.addEventListener('click', sendMessage);

/* ── Reply ───────────────────────────────────────────────────────────────── */
function clearReply() {
  replyTarget = null;
  replyPreview.style.display = 'none';
}
replyPreviewClose.addEventListener('click', clearReply);

/* ── Next / Search ───────────────────────────────────────────────────────── */
nextBtn.addEventListener('click', () => {
  if (!myName) { openNameModal(); return; }

  if (isConnected) {
    appendSystemMsg('🔎 ახალ პარტნიორს ეძებ...');
    isConnected = false;
    enableInput(false);
    typingIndicator.style.display = 'none';
    clearReply();
  }

  socket.emit('search', { name: myName, bio: myBio });
});

/* ── Block ───────────────────────────────────────────────────────────────── */
blockBtn.addEventListener('click', () => {
  if (!isConnected) return;
  socket.emit('block');
  appendSystemMsg('🚫 მომხმარებელი დაიბლოკა.');
  isConnected = false;
  enableInput(false);
  typingIndicator.style.display = 'none';
  clearReply();
});

/* ── Question button ─────────────────────────────────────────────────────── */
questionBtn.addEventListener('click', () => {
  if (!isConnected) return;
  socket.emit('requestQuestion');
});

/* ════════════════════════════════════════════════════════════════════════════
   NAME MODAL
════════════════════════════════════════════════════════════════════════════ */
function openNameModal() {
  nameModal.style.display = 'flex';
  nameInput.focus();
}

function closeNameModal() {
  if (!myName) return;  // can't close until name set
  nameModal.style.display = 'none';
}

function saveName() {
  const val = nameInput.value.trim().slice(0, 20);
  if (!val) { nameError.textContent = 'გთხოვთ შეიყვანოთ სახელი.'; return; }
  nameError.textContent = '';
  myName = val;
  userNameDisplay.textContent = myName;
  userNameDisplay.style.display = 'inline';
  nameModal.style.display = 'none';
  nameModalClose.style.display = 'inline-flex';
  interestsBtn.style.display = 'inline-flex';

  // Auto-search after setting name for first time
  socket.emit('search', { name: myName, bio: myBio });
  appendSystemMsg('🔎 პარტნიორს ეძებ...');
}

saveNameBtn.addEventListener('click', saveName);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
nameModalClose.addEventListener('click', closeNameModal);
changeNameBtn.addEventListener('click', openNameModal);

/* ── Show modal on load ──────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  openNameModal();
});

/* ════════════════════════════════════════════════════════════════════════════
   BIO / INTERESTS POPUP
════════════════════════════════════════════════════════════════════════════ */
interestsBtn.addEventListener('click', () => {
  bioInput.value = myBio;
  bioCharCount.textContent = `${myBio.length}/60`;
  bioPopup.style.display = 'flex';
  bioInput.focus();
});

bioInput.addEventListener('input', () => {
  bioCharCount.textContent = `${bioInput.value.length}/60`;
});

bioClearBtn.addEventListener('click', () => {
  bioInput.value = '';
  bioCharCount.textContent = '0/60';
});

bioSaveBtn.addEventListener('click', () => {
  myBio = bioInput.value.trim().slice(0, 60);
  bioPopup.style.display = 'none';
});

bioCloseBtn.addEventListener('click', () => {
  bioPopup.style.display = 'none';
});

/* ════════════════════════════════════════════════════════════════════════════
   GIF PICKER
════════════════════════════════════════════════════════════════════════════ */
gifBtn.addEventListener('click', () => {
  if (!isConnected) return;
  gifPicker.style.display = 'flex';
  gifSearch.value = '';
  tenorNextPos    = '';
  loadGifs('');
  gifSearch.focus();
});

gifPickerClose.addEventListener('click', () => {
  gifPicker.style.display = 'none';
});

gifSearch.addEventListener('input', () => {
  clearTimeout(gifDebounce);
  tenorNextPos = '';
  gifDebounce  = setTimeout(() => loadGifs(gifSearch.value.trim()), 400);
});

async function loadGifs(query, next = '') {
  gifResults.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'gif-placeholder';
  loading.textContent = '✨ იტვირთება...';
  gifResults.appendChild(loading);

  try {
    const base   = query ? 'https://tenor.googleapis.com/v2/search' : 'https://tenor.googleapis.com/v2/featured';
    const params = new URLSearchParams({ key: TENOR_KEY, limit: 20, media_filter: 'gif', locale: 'ka_GE' });
    if (query) params.set('q', query);
    if (next)  params.set('pos', next);

    const res  = await fetch(`${base}?${params}`);
    const data = await res.json();

    gifResults.innerHTML = '';
    tenorNextPos = data.next || '';

    (data.results || []).forEach(item => {
      const gif = item.media_formats?.gif?.url || item.media_formats?.tinygif?.url;
      if (!gif) return;
      const img = document.createElement('img');
      img.src       = gif;
      img.className = 'gif-item';
      img.loading   = 'lazy';
      img.addEventListener('click', () => sendGif(gif));
      gifResults.appendChild(img);
    });

    if (!gifResults.children.length) {
      gifResults.innerHTML = '<div class="gif-placeholder">😕 ვერ მოიძებნა</div>';
    }
  } catch {
    gifResults.innerHTML = '<div class="gif-placeholder">⚠️ შეცდომა</div>';
  }
}

function sendGif(url) {
  if (!isConnected) return;
  socket.emit('message', { gifUrl: url, replyTo: replyTarget });
  appendMessage({ who: 'me', name: myName, gifUrl: url, replyTo: replyTarget });
  clearReply();
  gifPicker.style.display = 'none';
}

// Infinite scroll
gifResults.addEventListener('scroll', () => {
  if (!tenorNextPos) return;
  if (gifResults.scrollTop + gifResults.clientHeight >= gifResults.scrollHeight - 100) {
    loadGifs(gifSearch.value.trim(), tenorNextPos);
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   SOCKET EVENTS
════════════════════════════════════════════════════════════════════════════ */

/* Online count */
socket.on('onlineCount', count => {
  onlineCountEl.textContent = `👥 ${count}`;
});

/* Waiting */
socket.on('waiting', () => {
  appendSystemMsg('🔎 პარტნიორს ეძებ...');
  enableInput(false);
  isConnected = false;
});

/* Matched */
socket.on('matched', ({ partnerName: pName, partnerBio }) => {
  partnerName = pName || 'უცნობი';
  isConnected = true;
  enableInput(true);
  typingIndicator.style.display = 'none';
  clearReply();

  let sysMsg = `✅ პარტნიორი ნაპოვნია: ${partnerName}`;
  if (partnerBio) sysMsg += ` — "${partnerBio}"`;
  appendSystemMsg(sysMsg);
  messageInput.focus();
});

/* Incoming message */
socket.on('message', ({ text, gifUrl, replyTo }) => {
  appendMessage({ who: 'partner', name: partnerName, text, gifUrl, replyTo });
});

/* Typing indicator */
socket.on('typing', ({ isTyping: it }) => {
  typingIndicator.style.display = it && isConnected ? 'flex' : 'none';
});

/* Partner left */
socket.on('partnerLeft', () => {
  appendSystemMsg('❌ პარტნიორი გავიდა.');
  isConnected = false;
  enableInput(false);
  typingIndicator.style.display = 'none';
  clearReply();
});

/* Blocked by server logic (you blocked them) */
socket.on('blocked', () => {
  isConnected = false;
  enableInput(false);
  typingIndicator.style.display = 'none';
  clearReply();
});

/* Question pushed to both sides */
socket.on('question', q => {
  appendMessage({ who: 'me', name: myName, text: q, isQuestion: true });
});

/* Fact */
socket.on('fact', f => {
  appendSystemMsg(`💡 ${f}`);
});

/* ════════════════════════════════════════════════════════════════════════════
   GAME UI BRIDGE
   All game rendering lives in games.js — here we only emit the invitation
   handshake that requires access to the connected socket.
════════════════════════════════════════════════════════════════════════════ */

// Expose helpers so games.js can call them
window.gaicani = {
  appendSystemMsg,
  appendMessage,
  isConnectedFn: () => isConnected,
  myNameFn:      () => myName,
  partnerNameFn: () => partnerName,
};
