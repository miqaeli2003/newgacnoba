/* ══════════════════════════════════════════════════════════════════
   music.js — "Listen Together" (synced YouTube) for GAICANI random chat
   ──────────────────────────────────────────────────────────────────
   • Available to every user — guest or registered.
   • Anyone can send AND accept a listen-together request.
   • Once accepted, both sides load the same YouTube video and stay
     in sync (play / pause / seek relayed over the socket).
   Depends on: socket.io (window.socket, set in script.js)
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  function waitForSocket(cb) {
    if (window.socket) return cb(window.socket);
    let tries = 0;
    const iv = setInterval(() => {
      if (window.socket || ++tries > 100) {
        clearInterval(iv);
        if (window.socket) cb(window.socket);
        else console.warn('[music] socket never appeared on window');
      }
    }, 100);
  }

  waitForSocket(function (socket) {
    const el  = (id)  => document.getElementById(id);
    const qs  = (sel) => document.querySelector(sel);

    let ytApiReady   = false;
    let ytApiLoading = false;
    let player       = null;      // YT.Player instance
    let session      = null;      // { videoId, hostId }
    let pendingInviteVideoId = null;
    let applyingRemote = false;   // guard to avoid echo loops
    let requestSentAt  = 0;

    // ────────────────────────────────────────────────────────────
    // 1. "Send request" — reached via the 🎵 button in the top bar
    // ────────────────────────────────────────────────────────────
    function bindMusicButton() {
      const btn = el('musicBtn');
      if (btn) btn.addEventListener('click', openRequestModal);
    }

    function setMusicBtnEnabled(on) {
      const btn = el('musicBtn');
      if (btn) btn.disabled = !on;
    }
    socket.on('partnerFound',       () => setMusicBtnEnabled(true));
    socket.on('partnerRestored',    () => setMusicBtnEnabled(true));
    socket.on('partnerReconnected', () => setMusicBtnEnabled(true));
    socket.on('partnerDisconnected',() => setMusicBtnEnabled(false));
    socket.on('youWereBlocked',     () => setMusicBtnEnabled(false));
    socket.on('queuePosition',      () => setMusicBtnEnabled(false));
    socket.on('partnerReconnecting',() => setMusicBtnEnabled(false));

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindMusicButton);
    } else {
      bindMusicButton();
    }
    function createRequestModal() {
      if (el('musicRequestModal')) return;
      const modal = document.createElement('div');
      modal.id = 'musicRequestModal';
      modal.className = 'music-modal';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="music-modal-box">
          <div class="music-modal-header">
            <span>🎵 ერთად მოსმენა</span>
            <button id="musicModalClose" class="music-modal-close">✕</button>
          </div>
          <p class="music-modal-hint">მოძებნეთ სიმღერა და დააჭირეთ მას — პარტნიორს გაეგზავნება მოთხოვნა.</p>
          <input type="text" id="musicSearchInput" class="music-url-input"
                 placeholder="სიმღერის დასახელება..." autocomplete="off" />
          <div class="music-modal-error" id="musicModalError" style="display:none"></div>
          <div id="musicSearchResults" class="music-search-results"></div>
        </div>`;
      document.body.appendChild(modal);

      el('musicModalClose').addEventListener('click', closeRequestModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeRequestModal(); });

      const searchInput = el('musicSearchInput');
      let searchDebounce = null;

      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        const q = searchInput.value.trim();
        if (q.length < 2) { el('musicSearchResults').innerHTML = ''; el('musicModalError').style.display = 'none'; return; }
        searchDebounce = setTimeout(() => runSearch(q), 400);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        clearTimeout(searchDebounce);
        const q = searchInput.value.trim();
        if (q.length >= 2) runSearch(q);
      });
    }

    let searchSeq = 0;
    function runSearch(q) {
      const mySeq = ++searchSeq;
      const err = el('musicModalError');
      const resultsEl = el('musicSearchResults');
      err.style.display = 'none';
      resultsEl.innerHTML = `<div class="music-search-loading">🔎 იძებნება...</div>`;

      fetch(`/api/music-search?q=${encodeURIComponent(q)}`)
        .then(r => r.json().then(data => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (mySeq !== searchSeq) return; // superseded by a newer search
          if (!ok) {
            resultsEl.innerHTML = '';
            err.textContent = data.error || 'ძებნა ვერ განხორციელდა.';
            err.style.display = 'block';
            return;
          }
          renderSearchResults(data.results || []);
        })
        .catch(() => {
          if (mySeq !== searchSeq) return;
          resultsEl.innerHTML = '';
          err.textContent = 'ძებნა ვერ განხორციელდა.';
          err.style.display = 'block';
        });
    }

    function renderSearchResults(list) {
      const resultsEl = el('musicSearchResults');
      if (!list.length) {
        resultsEl.innerHTML = `<div class="music-search-loading">შედეგი ვერ მოიძებნა.</div>`;
        return;
      }
      resultsEl.innerHTML = list.map(item => `
        <div class="music-result-item" data-video-id="${escapeHtml(item.videoId)}" data-title="${escapeHtml(item.title)}">
          <img class="music-result-thumb" src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />
          <div class="music-result-info">
            <div class="music-result-title">${escapeHtml(item.title)}</div>
            <div class="music-result-channel">${escapeHtml(item.channel)}</div>
          </div>
        </div>`).join('');

      resultsEl.querySelectorAll('.music-result-item').forEach(node => {
        node.addEventListener('click', () => {
          selectSong(node.dataset.videoId, node.dataset.title);
        });
      });
    }

    function selectSong(videoId, title) {
      if (!videoId) return;
      requestSentAt = Date.now();
      socket.emit('music:request', { url: videoId });
      closeRequestModal();
      appendSystemMessage(`⏳ მოთხოვნა გაიგზავნა: ${title || 'სიმღერა'}`);
    }

    function openRequestModal() {
      if (!window.partnerConnected) {
        showToastFallback('🎵 მუსიკა ხელმისაწვდომია მხოლოდ ჩატის დროს.');
        return;
      }
      if (session) {
        showToastFallback('🎵 უკვე უსმენთ ერთად მუსიკას.');
        return;
      }
      createRequestModal();
      el('musicModalError').style.display = 'none';
      el('musicSearchInput').value = '';
      el('musicSearchResults').innerHTML = '';
      el('musicRequestModal').style.display = 'flex';
      setTimeout(() => el('musicSearchInput')?.focus(), 50);
    }
    window._openMusicRequest = openRequestModal;

    function closeRequestModal() {
      const modal = el('musicRequestModal');
      if (modal) modal.style.display = 'none';
    }

    function showToastFallback(text) {
      if (typeof window.showToast === 'function') window.showToast(text);
      else appendSystemMessage(text);
    }

    // ────────────────────────────────────────────────────────────
    // 2. Incoming invite → accept / decline bar
    // ────────────────────────────────────────────────────────────
    socket.on('music:invite', ({ videoId, fromId, fromName }) => {
      pendingInviteVideoId = videoId;
      showInviteBar(fromId, fromName);
    });

    function showInviteBar(fromId, fromName) {
      const existing = el('musicInviteBar');
      if (existing) existing.remove();

      const bar = document.createElement('div');
      bar.id = 'musicInviteBar';
      bar.className = 'music-invite-bar';
      bar.innerHTML = `
        <span class="music-invite-text">🎵 <strong>${escapeHtml(fromName || 'პარტნიორმა')}</strong> გიწვევთ ერთად მუსიკის მოსასმენად</span>
        <div class="music-invite-actions">
          <button class="music-invite-accept"  id="musicAcceptBtn">✅ მიღება</button>
          <button class="music-invite-decline" id="musicDeclineBtn">❌ უარყოფა</button>
        </div>`;

      const chatInput = qs('.chat-input');
      if (chatInput) chatInput.prepend(bar);
      else document.body.appendChild(bar);

      let expired = false;
      el('musicAcceptBtn').addEventListener('click', () => {
        if (expired) return;
        expired = true;
        bar.remove();
        socket.emit('music:response', { accepted: true, toId: fromId, videoId: pendingInviteVideoId });
      });
      el('musicDeclineBtn').addEventListener('click', () => {
        if (expired) return;
        expired = true;
        bar.remove();
        socket.emit('music:response', { accepted: false, toId: fromId, videoId: pendingInviteVideoId });
        pendingInviteVideoId = null;
      });

      setTimeout(() => {
        if (el('musicInviteBar') && !expired) {
          expired = true;
          el('musicInviteBar').remove();
          socket.emit('music:response', { accepted: false, toId: fromId, videoId: pendingInviteVideoId });
          pendingInviteVideoId = null;
        }
      }, 30000);
    }

    socket.on('music:declined', () => {
      appendSystemMessage('❌ მუსიკის მოთხოვნა უარყოფილ იქნა.');
    });

    socket.on('music:error', ({ message }) => {
      showToastFallback('🎵 ' + (message || 'ვერ მოხერხდა.'));
    });

    // ────────────────────────────────────────────────────────────
    // 3. Session start → load YouTube IFrame API + audio-only player,
    //    scheduled to start playback at the same wall-clock moment
    //    (startAt) on both ends.
    // ────────────────────────────────────────────────────────────
    socket.on('music:start', ({ videoId, hostId, startAt }) => {
      session = { videoId, hostId, startAt };
      loadYouTubeAPI(() => createPlayerWidget(videoId, startAt));
      fetchTitle(videoId);
    });

    function fetchTitle(videoId) {
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const titleEl = el('musicWidgetTitle');
          if (titleEl && d && d.title) titleEl.textContent = d.title;
        })
        .catch(() => {});
    }

    function loadYouTubeAPI(cb) {
      if (ytApiReady && window.YT && window.YT.Player) return cb();
      if (!window._musicYtCallbacks) window._musicYtCallbacks = [];
      window._musicYtCallbacks.push(cb);
      if (ytApiLoading) return;
      ytApiLoading = true;

      window.onYouTubeIframeAPIReady = function () {
        ytApiReady = true;
        (window._musicYtCallbacks || []).forEach(fn => fn());
        window._musicYtCallbacks = [];
      };

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    function createPlayerWidget(videoId, startAt) {
      removePlayerWidget();

      const chat = el('chat');
      const widget = document.createElement('div');
      widget.id = 'musicWidget';
      widget.className = 'music-widget music-widget--inline';
      widget.innerHTML = `
        <div class="music-widget-header">
          <span class="music-widget-note">🎵 ერთად მოსმენა</span>
          <button id="musicWidgetClose" class="music-widget-close" title="დასრულება">✕</button>
        </div>
        <div class="music-widget-body">
          <button id="musicPlayPauseBtn" class="music-playpause-btn" disabled>⏳</button>
          <div class="music-widget-info">
            <div id="musicWidgetTitle" class="music-widget-title">იტვირთება...</div>
            <div id="musicWidgetStatus" class="music-widget-status">დასინქრონება...</div>
          </div>
        </div>
        <div id="musicPlayerMount" class="music-player-mount"></div>`;

      // Attach directly in the chat feed, at the point it was created —
      // it stays there as the conversation continues instead of floating
      // at a fixed spot on screen.
      if (chat) {
        chat.appendChild(widget);
        chat.scrollTop = chat.scrollHeight;
      } else {
        document.body.appendChild(widget);
      }

      el('musicWidgetClose').addEventListener('click', () => {
        socket.emit('music:stop');
        endSession('🎵 ერთად მოსმენა დასრულდა.');
      });

      el('musicPlayPauseBtn').addEventListener('click', () => {
        if (!player) return;
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) player.pauseVideo();
        else player.playVideo();
      });

      player = new YT.Player('musicPlayerMount', {
        height: '1',
        width: '1',
        videoId: videoId,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: () => scheduleSimultaneousStart(startAt),
          onStateChange: onPlayerStateChange,
        },
      });
    }

    // Both sides call playVideo() at the same wall-clock time (startAt,
    // sent by the server) so the track begins simultaneously instead of
    // whichever client's player finished loading first.
    function scheduleSimultaneousStart(startAt) {
      const delay = Math.max(0, (startAt || Date.now()) - Date.now());
      const statusEl = el('musicWidgetStatus');
      if (statusEl) statusEl.textContent = 'იწყება...';
      setTimeout(() => {
        if (!player) return;
        applyingRemote = true;
        player.playVideo();
        setTimeout(() => { applyingRemote = false; }, 400);
      }, delay);
    }

    function onPlayerStateChange(e) {
      const btn = el('musicPlayPauseBtn');
      const statusEl = el('musicWidgetStatus');

      if (e.data === YT.PlayerState.PLAYING) {
        if (btn) { btn.textContent = '⏸️'; btn.disabled = false; }
        if (statusEl) statusEl.textContent = 'უკრავს';
      } else if (e.data === YT.PlayerState.PAUSED) {
        if (btn) { btn.textContent = '▶️'; btn.disabled = false; }
        if (statusEl) statusEl.textContent = 'დაპაუზებულია';
      } else if (e.data === YT.PlayerState.BUFFERING) {
        if (statusEl) statusEl.textContent = 'იტვირთება...';
      } else if (e.data === YT.PlayerState.ENDED) {
        if (statusEl) statusEl.textContent = 'დასრულდა';
      }

      // Relay this state change to the partner so both stay paused/playing
      // together — unless we're the one just applying a remote command.
      if (applyingRemote || !player) return;
      if (e.data === YT.PlayerState.PLAYING) {
        socket.emit('music:control', { action: 'play', time: player.getCurrentTime() });
      } else if (e.data === YT.PlayerState.PAUSED) {
        socket.emit('music:control', { action: 'pause', time: player.getCurrentTime() });
      }
    }

    socket.on('music:control', ({ action, time }) => {
      if (!player) return;
      applyingRemote = true;
      try {
        if (typeof time === 'number' && Math.abs((player.getCurrentTime?.() || 0) - time) > 1.2) {
          player.seekTo(time, true);
        }
        if (action === 'play')  player.playVideo();
        if (action === 'pause') player.pauseVideo();
      } catch (err) { /* player not ready yet — ignore */ }
      setTimeout(() => { applyingRemote = false; }, 400);
    });

    socket.on('music:stop', () => {
      endSession('🎵 პარტნიორმა დაასრულა ერთად მოსმენა.');
    });

    function endSession(message) {
      if (session && message) appendSystemMessage(message);
      session = null;
      pendingInviteVideoId = null;
      removePlayerWidget();
      const bar = el('musicInviteBar');
      if (bar) bar.remove();
    }

    function removePlayerWidget() {
      const widget = el('musicWidget');
      if (widget) widget.remove();
      if (player && player.destroy) { try { player.destroy(); } catch {} }
      player = null;
    }

    // Close the shared session whenever the chat partner goes away
    function onPartnerGone() { endSession(session ? '🎵 ერთად მოსმენა შეწყდა.' : null); }
    socket.on('partnerDisconnected',  onPartnerGone);
    socket.on('youWereBlocked',       onPartnerGone);
    socket.on('partnerReconnecting',  onPartnerGone);
    socket.on('queuePosition',        () => endSession(null));

    // ────────────────────────────────────────────────────────────
    // Utilities
    // ────────────────────────────────────────────────────────────
    function appendSystemMessage(text) {
      const chat = el('chat');
      if (!chat) return;
      const div = document.createElement('div');
      div.className = 'system-message';
      div.textContent = text;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    function escapeHtml(str) {
      const d = document.createElement('div');
      d.textContent = str == null ? '' : String(str);
      return d.innerHTML;
    }
  });
})();
