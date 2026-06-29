/* ════════════════════════════════════════════════════════════════════════════
   auth-client.js — GAICANI Registered User System
   Handles: Register / Login / Friend Requests / Private Chat / Dashboard
   ════════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── $ helper ────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }

  /* ── HTML escape ─────────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g,
      c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }

  /* ── Storage ─────────────────────────────────────────────────────── */
  const LS_TOKEN = "gaicani_auth_token";
  const LS_USER  = "gaicani_auth_user";

  function saveAuth(token, username) {
    try { localStorage.setItem(LS_TOKEN, token); localStorage.setItem(LS_USER, username); } catch (_) {}
  }
  function loadAuth() {
    try { return { token: localStorage.getItem(LS_TOKEN), username: localStorage.getItem(LS_USER) }; }
    catch (_) { return {}; }
  }
  function clearAuth() {
    try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); } catch (_) {}
  }

  /* ── State ───────────────────────────────────────────────────────── */
  let authUser = null;    // { username, token, friends:[], pendingRequests:[] }
  let authSocket = null;  // reference to the main socket
  let sessionBlocked = new Set();  // lowercase usernames blocked this session

  // Private chat state
  let privChatPartner = null;  // username of open private chat
  let privChatMessages = [];

  /* ── Toast (uses script.js showToast if available) ───────────────── */
  function showToast(msg, ms = 3500) {
    if (typeof window.showToast === "function") { window.showToast(msg, ms); return; }
    const c = $("notif-container") || document.body;
    const t = document.createElement("div");
    t.className = "toast-popup"; t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add("toast-visible"));
    setTimeout(() => { t.classList.remove("toast-visible"); setTimeout(() => t.remove(), 350); }, ms);
  }

  /* ══════════════════════════════════════════════════════════════════
     AUTH TABS — Guest / Login / Register
     ══════════════════════════════════════════════════════════════════ */

  function activateTab(tab) {
    ["guest","login","signup"].forEach(id => {
      const btn = $("auth-tab-" + id);
      const sec = $("auth-section-" + id);
      if (btn) btn.classList.toggle("active", id === tab);
      if (sec) sec.style.display = id === tab ? "" : "none";
    });
    // clear errors on tab switch
    setError("login-error", "");
    setError("signup-error", "");
  }

  $("auth-tab-guest") ?.addEventListener("click", () => activateTab("guest"));
  $("auth-tab-login") ?.addEventListener("click", () => activateTab("login"));
  $("auth-tab-signup")?.addEventListener("click", () => activateTab("signup"));

  /* ── Error helpers ────────────────────────────────────────────────── */
  function setError(elId, msg) {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  /* ══════════════════════════════════════════════════════════════════
     REGISTER
     ══════════════════════════════════════════════════════════════════ */
  $("signup-btn")?.addEventListener("click", doRegister);
  $("signup-confirm")?.addEventListener("keydown", e => { if (e.key === "Enter") doRegister(); });

  async function doRegister() {
    const username = ($("signup-username")?.value || "").trim();
    const password = ($("signup-password")?.value || "");
    const confirm  = ($("signup-confirm") ?.value || "");

    setError("signup-error", "");

    if (!username) { setError("signup-error", "შეიყვანეთ სახელი"); return; }
    if (username.length < 2 || username.length > 20)
      { setError("signup-error", "სახელი: 2–20 სიმბოლო"); return; }
    if (!password) { setError("signup-error", "შეიყვანეთ პაროლი"); return; }
    if (password.length < 6) { setError("signup-error", "პაროლი მინ. 6 სიმბოლო"); return; }
    if (password !== confirm) { setError("signup-error", "პაროლები არ ემთხვევა"); return; }

    const btn = $("signup-btn");
    if (btn) { btn.disabled = true; btn.textContent = "⏳..."; }

    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError("signup-error", d.error || "შეცდომა");
        return;
      }
      // Success — auto-login
      handleAuthSuccess(d.token, d.username, d.friends || [], d.pendingRequests || []);
    } catch (_) {
      setError("signup-error", "კავშირის შეცდომა. კვლავ სცადეთ.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "რეგისტრაცია"; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     LOGIN
     ══════════════════════════════════════════════════════════════════ */
  $("login-btn")?.addEventListener("click", doLogin);
  $("login-password")?.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

  async function doLogin() {
    const username = ($("login-username")?.value || "").trim();
    const password = ($("login-password")?.value || "");

    setError("login-error", "");
    if (!username || !password) { setError("login-error", "შეიყვანეთ სახელი და პაროლი"); return; }

    const btn = $("login-btn");
    if (btn) { btn.disabled = true; btn.textContent = "⏳..."; }

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) { setError("login-error", d.error || "არასწორი სახელი ან პაროლი"); return; }
      handleAuthSuccess(d.token, d.username, d.friends || [], d.pendingRequests || []);
    } catch (_) {
      setError("login-error", "კავშირის შეცდომა. კვლავ სცადეთ.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "შესვლა"; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     AUTH SUCCESS — called after login or register
     ══════════════════════════════════════════════════════════════════ */
  function handleAuthSuccess(token, username, friends, pendingRequests) {
    saveAuth(token, username);
    authUser = { username, token, friends: friends || [], pendingRequests: pendingRequests || [] };
    window.gaicaniAuthUser = authUser;

    // Show success toast, then redirect straight to the dashboard
    showToast(`✅ ${esc(username)} — წარმატებით შეხვედით!`);
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 700);
  }

  function autoSetNameAfterAuth(username) {
    // Hide the name modal immediately — registered users never need to see it
    const nameModal = document.getElementById("nameModal");
    const overlay   = document.getElementById("modalLoadingOverlay");
    if (nameModal) nameModal.style.display = "none";

    // Used by tryAutoLogin so returning registered users skip the name modal
    setTimeout(() => {
      if (typeof window.socket !== "undefined" && window.socket.connected) {
        const currentName = window.userName || "";
        if (!currentName) {
          const nameInput = $("nameInput");
          if (nameInput) nameInput.value = username;
          const saveBtn = $("saveNameBtn");
          if (saveBtn) saveBtn.click();
        }
      }
    }, 400);
  }

  /* ── Update top bar badge ──────────────────────────────────────────── */
  function updateAuthBadge() {
    const badge = $("auth-user-badge");
    if (!badge) return;
    if (authUser) {
      badge.textContent = `🔐 ${authUser.username}`;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     SOCKET EVENTS — bind once when authUser is set
     ══════════════════════════════════════════════════════════════════ */
  let socketBound = false;

  function bindSocketEvents() {
    if (socketBound) return;
    // Wait for socket to be available
    const waitForSocket = setInterval(() => {
      if (typeof window.socket !== "undefined") {
        clearInterval(waitForSocket);
        _bindSocketNow(window.socket);
      }
    }, 100);
  }

  function _bindSocketNow(s) {
    if (socketBound) return;
    socketBound = true;
    authSocket = s;

    // Send auth token once socket connects or reconnects
    function sendAuthToken() {
      if (authUser) s.emit("auth:login", { token: authUser.token });
    }

    if (s.connected) sendAuthToken();
    s.on("connect", sendAuthToken);

    // Authentication confirmed
    s.on("auth:authenticated", ({ username, friends, pendingRequests }) => {
      if (authUser) {
        authUser.friends = friends || [];
        authUser.pendingRequests = pendingRequests || [];
        window.gaicaniAuthUser = authUser;
      }
      renderDashFriends(friends || []);
    });

    // Token expired
    s.on("auth:error", () => {
      clearAuth();
      authUser = null;
      window.gaicaniAuthUser = null;
      updateAuthBadge();
      updateRegMenuVisibility();
      showToast("⚠️ სესია ამოიწურა. გთხოვთ ხელახლა შეხვიდეთ.");
    });

    // ── Partner is a registered user — show banner ────────────────────
    s.on("auth:partnerRegInfo", ({ partnerRegName, isFriend }) => {
      showPartnerRegBanner(partnerRegName, isFriend);
      updateAddFriendBtn(partnerRegName, isFriend);
      const nameEl = document.getElementById("partnerNameDisplay");
      if (nameEl) nameEl.classList.add("is-registered");
    });

    // ── Incoming friend request ───────────────────────────────────────
    s.on("friend:incomingRequest", ({ fromUsername }) => {
      showFriendRequestNotif(fromUsername);
    });

    // ── Request accepted (by the other person) ────────────────────────
    s.on("friend:acceptedByOther", ({ byUsername, friends }) => {
      if (authUser && friends) authUser.friends = friends;
      else if (authUser && byUsername) {
        const lc = byUsername.toLowerCase();
        if (!authUser.friends.includes(lc)) authUser.friends.push(lc);
      }
      renderDashFriends(authUser?.friends || []);
      showToast(`✅ ${esc(byUsername)} ახლა შენი მეგობარია!`);
    });

    // ── Request accepted (I accepted someone) ─────────────────────────
    s.on("friend:accepted", ({ username, friends }) => {
      if (authUser) authUser.friends = friends || authUser.friends;
      renderDashFriends(authUser?.friends || []);
      if (username) showToast(`✅ ${esc(username)} ახლა შენი მეგობარია!`);
    });

    // ── Friend removed me ─────────────────────────────────────────────
    s.on("friend:removedByOther", ({ byUsername }) => {
      if (authUser) {
        authUser.friends = authUser.friends.filter(
          f => f.toLowerCase() !== byUsername.toLowerCase()
        );
        renderDashFriends(authUser.friends);
      }
      showToast(`ℹ️ ${esc(byUsername)}-მ შენი მეგობრობა გაიუქმა`);
    });

    // ── I removed a friend ────────────────────────────────────────────
    s.on("friend:removed", ({ friends }) => {
      if (authUser) authUser.friends = friends || [];
      renderDashFriends(authUser?.friends || []);
      showToast("✅ მეგობარი წაიშალა");
    });

    s.on("friend:error", ({ msg }) => showToast(`❌ ${esc(msg)}`));

    // ── Decline events ────────────────────────────────────────────────
    s.on("friend:declined", () => showToast("ℹ️ მეგობრობის მოთხოვნა უარყოფილ იქნა"));
    s.on("friend:declinedByOther", ({ byUsername }) =>
      showToast(`ℹ️ ${esc(byUsername)}-მ მოთხოვნა უარყო`));

    // ── Private messages ──────────────────────────────────────────────
    s.on("privateMsg:received", ({ fromUsername, message, timestamp }) => {
      if (privChatPartner === fromUsername) {
        appendPrivMsg(fromUsername, message, timestamp, false);
      } else {
        showToast(`💬 ${esc(fromUsername)}: ${esc(message.substring(0, 60))}`);
      }
    });

    // ── When partner disconnects, clear + hide add friend btn / banner ─
    s.on("partnerDisconnected", () => {
      hidePartnerRegBanner();
      const addBtn = $("addFriendIconBtn");
      if (addBtn) addBtn.style.display = "none";
      const nameEl = document.getElementById("partnerNameDisplay");
      if (nameEl) nameEl.classList.remove("is-registered");
    });

    // ── When a new partner is found, check if they're registered ────
    s.on("partnerFound", () => {
      hidePartnerRegBanner();
      const addBtn = $("addFriendIconBtn");
      if (addBtn) addBtn.style.display = "none";
      const nameEl = document.getElementById("partnerNameDisplay");
      if (nameEl) nameEl.classList.remove("is-registered");
      // Ask server if partner is a registered user (only if we're logged in)
      if (authUser) {
        setTimeout(() => s.emit("auth:checkPartner"), 400);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     PARTNER REG BANNER — "🌟 name — რეგისტრირებულია..."
     ══════════════════════════════════════════════════════════════════ */
  let bannerTimeout = null;

  function showPartnerRegBanner(partnerName, isFriend) {
    clearTimeout(bannerTimeout);
    const banner = $("partner-reg-banner");
    if (!banner) return;

    if (isFriend) {
      banner.textContent = `✅ ${partnerName} — შენი მეგობარია`;
    } else {
      banner.textContent = `🌟 ${partnerName} — რეგისტრირებულია თუ გსურთ შეგიძლიათ დაამატოთ`;
    }
    banner.style.display = "block";

    // Auto-hide after 5 seconds
    bannerTimeout = setTimeout(() => {
      banner.style.display = "none";
    }, 5000);
  }

  function hidePartnerRegBanner() {
    clearTimeout(bannerTimeout);
    const banner = $("partner-reg-banner");
    if (banner) banner.style.display = "none";
  }

  /* ══════════════════════════════════════════════════════════════════
     ADD FRIEND ICON BUTTON (➕)
     ══════════════════════════════════════════════════════════════════ */
  function updateAddFriendBtn(partnerRegName, isFriend) {
    const btn = $("addFriendIconBtn");
    if (!btn || !authUser) return;

    if (isFriend) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "flex";
    // Remove old listener by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", () => {
      if (!authUser || !partnerRegName) return;
      authSocket?.emit("friend:request", { toUsername: partnerRegName });
      newBtn.style.display = "none";
      showToast(`📨 მეგობრობის მოთხოვნა გაიგზავნა ${esc(partnerRegName)}-სთვის`);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     FRIEND REQUEST NOTIFICATION
     ══════════════════════════════════════════════════════════════════ */
  function showFriendRequestNotif(fromUsername) {
    const c = $("notif-container") || document.body;
    const notif = document.createElement("div");
    notif.className = "friend-request-notif";
    notif.innerHTML = `
      <div class="frn-body">
        <span class="frn-icon">👤</span>
        <div class="frn-text">
          <strong>${esc(fromUsername)}</strong> გიგზავნის მეგობრობის მოთხოვნას
        </div>
      </div>
      <div class="frn-btns">
        <button class="frn-accept">✅ დამატება</button>
        <button class="frn-decline">❌ უარყოფა</button>
      </div>
    `;

    c.appendChild(notif);

    notif.querySelector(".frn-accept").addEventListener("click", () => {
      authSocket?.emit("friend:accept", { fromUsername });
      notif.remove();
    });
    notif.querySelector(".frn-decline").addEventListener("click", () => {
      authSocket?.emit("friend:decline", { fromUsername });
      notif.remove();
    });

    // Auto-dismiss after 30 seconds
    setTimeout(() => notif.remove(), 30000);
  }

  /* ══════════════════════════════════════════════════════════════════
     DASHBOARD PANEL (inline sheet)
     ══════════════════════════════════════════════════════════════════ */
  function openDashboard() {
    const panel = $("dashboard-panel");
    if (!panel) return;
    panel.style.display = "block";

    // Populate user info
    const dashAvatar   = $("dashAvatar");
    const dashUsername = $("dashUsername");
    if (dashAvatar && authUser)   dashAvatar.textContent = authUser.username.charAt(0).toUpperCase();
    if (dashUsername && authUser) dashUsername.textContent = authUser.username;

    renderDashFriends(authUser?.friends || []);
    renderDashBlocked();
  }

  function closeDashboard() {
    const panel = $("dashboard-panel");
    if (panel) panel.style.display = "none";
  }

  $("dashClose")?.addEventListener("click", closeDashboard);
  $("dashOverlay")?.addEventListener("click", closeDashboard);

  $("dashRandomChat")?.addEventListener("click", () => {
    closeDashboard();
    // If already in a chat, press next; otherwise start searching
    const nextBtn = $("nextBtn");
    if (nextBtn) nextBtn.click();
  });

  /* ── Dashboard friends list ──────────────────────────────────────── */
  function renderDashFriends(friends) {
    const list  = $("dash-friends-list");
    const cnt   = $("dashFriendCount");
    if (!list) return;
    if (cnt) cnt.textContent = (friends || []).length;

    if (!friends || !friends.length) {
      list.innerHTML = `<div class="dash-empty">ჯერ მეგობრები არ გყავს.<br>
        <small>ჩატის დროს ➕ ღილაკზე დააჭირე.</small></div>`;
      return;
    }

    list.innerHTML = friends.map(f => `
      <div class="dash-friend-item" data-friend="${esc(f)}">
        <div class="dash-friend-avatar">${esc(f).charAt(0).toUpperCase()}</div>
        <span class="dash-friend-name">${esc(f)}</span>
        <div class="dash-friend-actions">
          <button class="dash-act-btn dash-act-chat"   data-f="${esc(f)}" title="Private Chat">💬</button>
          <button class="dash-act-btn dash-act-remove" data-f="${esc(f)}" title="მეგობრობის გაუქმება">✕</button>
          <button class="dash-act-btn dash-act-block"  data-f="${esc(f)}" title="სესიის ბლოკი">🚫</button>
        </div>
      </div>`).join("");

    list.querySelectorAll(".dash-act-chat").forEach(btn => {
      btn.addEventListener("click", () => {
        closeDashboard();
        openPrivateChat(btn.dataset.f);
      });
    });

    list.querySelectorAll(".dash-act-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        const fname = btn.dataset.f;
        if (!confirm(`წაშალოთ ${esc(fname)} მეგობრებიდან?`)) return;
        authSocket?.emit("friend:remove", { friendUsername: fname });
      });
    });

    list.querySelectorAll(".dash-act-block").forEach(btn => {
      btn.addEventListener("click", () => {
        const fname = btn.dataset.f;
        if (!confirm(`დაბლოკოთ ${esc(fname)} ამ სესიაზე?`)) return;
        const lc = fname.toLowerCase();
        sessionBlocked.add(lc);
        authSocket?.emit("reg:sessionBlock", { targetUsername: lc });
        renderDashFriends(authUser?.friends || []);
        renderDashBlocked();
        showToast(`🚫 ${esc(fname)} — დაბლოკილია ამ სესიაზე`);
      });
    });
  }

  /* ── Dashboard blocked list ──────────────────────────────────────── */
  function renderDashBlocked() {
    const list    = $("dash-blocked-list");
    const section = $("dashBlockedSection");
    const cnt     = $("dashBlockedCount");
    if (!list || !section) return;

    const blocked = [...sessionBlocked];
    if (cnt) cnt.textContent = blocked.length;
    section.style.display = blocked.length ? "" : "none";

    if (!blocked.length) { list.innerHTML = ""; return; }

    list.innerHTML = blocked.map(u => `
      <div class="dash-friend-item">
        <div class="dash-friend-avatar" style="background:rgba(242,63,66,0.15);color:#f23f42;">${esc(u).charAt(0).toUpperCase()}</div>
        <span class="dash-friend-name" style="color:#f23f42;">${esc(u)}</span>
        <button class="dash-act-btn dash-act-unblock" data-u="${esc(u)}" title="ბლოკის მოხსნა" style="color:#3ba55d;">✓</button>
      </div>`).join("");

    list.querySelectorAll(".dash-act-unblock").forEach(btn => {
      btn.addEventListener("click", () => {
        sessionBlocked.delete(btn.dataset.u);
        authSocket?.emit("reg:sessionUnblock", { targetUsername: btn.dataset.u });
        renderDashBlocked();
        renderDashFriends(authUser?.friends || []);
        showToast(`✅ ${esc(btn.dataset.u)} — ბლოკი მოხსნილია`);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     PRIVATE CHAT PANEL (with friends — full chat features)
     ══════════════════════════════════════════════════════════════════ */
  function openPrivateChat(friend) {
    if (!authUser) return;
    privChatPartner = friend;
    privChatMessages = [];

    const panel = $("priv-panel");
    const title = $("priv-title");
    if (!panel) return;

    if (title) title.textContent = `🔒 ${friend}`;
    panel.style.display = "flex";

    const msgs = $("priv-messages");
    if (msgs) msgs.innerHTML = "";

    // Load history
    fetch(`/api/priv/history?username=${encodeURIComponent(authUser.username)}&friend=${encodeURIComponent(friend)}`, {
      headers: { "Authorization": `Bearer ${authUser.token}` }
    }).then(r => r.json()).then(d => {
      if (d.messages) {
        d.messages.forEach(m => appendPrivMsg(m.from, m.text, m.ts, m.from.toLowerCase() === authUser.username.toLowerCase()));
      }
    }).catch(() => {});

    setTimeout(() => {
      const inp = $("priv-input");
      if (inp) inp.focus();
    }, 100);
  }

  function closePrivateChat() {
    privChatPartner = null;
    privChatMessages = [];
    const panel = $("priv-panel");
    if (panel) panel.style.display = "none";
  }

  $("priv-close")?.addEventListener("click", closePrivateChat);

  function appendPrivMsg(from, text, ts, isMe) {
    const msgs = $("priv-messages");
    if (!msgs) return;

    const d  = document.createElement("div");
    d.className = isMe ? "priv-msg priv-msg-me" : "priv-msg priv-msg-them";

    const bubble = document.createElement("div");
    bubble.className = "priv-bubble";
    bubble.textContent = text;

    const time = document.createElement("div");
    time.className = "priv-ts";
    const dt = ts ? new Date(ts) : new Date();
    const h = dt.getHours(), m = dt.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    time.textContent = `${h%12||12}:${String(m).padStart(2,"0")} ${ampm}`;

    d.appendChild(bubble);
    d.appendChild(time);
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function sendPrivMsg() {
    if (!privChatPartner || !authUser) return;
    const inp = $("priv-input");
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;
    inp.value = "";

    authSocket?.emit("privateMsg:send", { toUsername: privChatPartner, message: text });
    appendPrivMsg(authUser.username, text, new Date().toISOString(), true);
  }

  $("priv-send")?.addEventListener("click", sendPrivMsg);
  $("priv-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrivMsg(); }
  });

  /* ══════════════════════════════════════════════════════════════════
     FRIEND CHAT IN MAIN CHAT — when chatting with a friend
     The private chat panel opens on top for direct messaging.
     The main random chat can also continue with all features.
     ══════════════════════════════════════════════════════════════════ */

  // If we arrive from dashboard with a pending private chat open
  const pendingPriv = (() => {
    try { return JSON.parse(sessionStorage.getItem("gaicani_open_priv") || "null"); }
    catch (_) { return null; }
  })();
  if (pendingPriv?.friend) {
    sessionStorage.removeItem("gaicani_open_priv");
    setTimeout(() => {
      if (authUser) openPrivateChat(pendingPriv.friend);
    }, 500);
  }

  /* ══════════════════════════════════════════════════════════════════
     THREE-DOT MENU (⋮) for registered users
     Items: 🎮 Games | 🚩 Report | ინტერესები | ჩემი გვერდი
     ══════════════════════════════════════════════════════════════════ */
  function updateRegMenuVisibility() {
    const menuBtn = $("regMenuBtn");
    if (!menuBtn) return;
    menuBtn.style.display = authUser ? "flex" : "none";
    if (!authUser) closeRegMenu();

    // body.reg-user CSS hides ინტ., gameBtn, reportBtn, changeNameBtn via !important
    document.body.classList.toggle("reg-user", !!authUser);
  }

  function toggleRegMenu(e) {
    const dd = $("regMenuDropdown");
    if (!dd) return;
    if (dd.style.display === "none" || !dd.style.display) openRegMenu();
    else closeRegMenu();
    e.stopPropagation();
  }

  function openRegMenu() {
    const dd = $("regMenuDropdown");
    if (dd) dd.style.display = "block";
  }

  function closeRegMenu() {
    const dd = $("regMenuDropdown");
    if (dd) dd.style.display = "none";
  }

  document.addEventListener("click", () => closeRegMenu());
  $("regMenuBtn")?.addEventListener("click", toggleRegMenu);

  // 🎮 Games
  $("regMenuGames")?.addEventListener("click", () => {
    closeRegMenu();
    // gameBtn is injected by games.js into the top bar
    const gamesBtn = $("gameBtn");
    if (gamesBtn && !gamesBtn.disabled) {
      gamesBtn.click();
    } else {
      showToast("🎮 თამაშები მხოლოდ ჩატის დროს ხელმისაწვდომია");
    }
  });

  // 🎮 Games Interests — opens the bio/interests popup for sharing gaming preferences
  $("regMenuGameInt")?.addEventListener("click", () => {
    closeRegMenu();
    const bioPopup = $("bioPopup");
    if (bioPopup) bioPopup.style.display = "flex";
  });

  // 🚩 Report — same logic as main report button
  $("regMenuReport")?.addEventListener("click", () => {
    closeRegMenu();
    const reportBtn = $("reportBtn");
    if (reportBtn && !reportBtn.disabled) {
      reportBtn.click();
    } else {
      showToast("🚩 რეპორტი მხოლოდ ჩატის დროს ხელმისაწვდომია");
    }
  });

  // ინტერესები (Interests)
  $("regMenuInt")?.addEventListener("click", () => {
    closeRegMenu();
    const bioPopup = $("bioPopup");
    if (bioPopup) bioPopup.style.display = "flex";
  });

  // ჩემი გვერდი (My Page) — navigate to the full dashboard page
  $("regMenuDash")?.addEventListener("click", () => {
    closeRegMenu();
    window.location.href = '/dashboard.html';
  });

  // Logout
  $("regMenuLogout")?.addEventListener("click", () => {
    closeRegMenu();
    if (!confirm("გამოხვიდეთ სისტემიდან?")) return;
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: authUser?.token }),
    }).catch(() => {});
    clearAuth();
    window.location.reload();
  });

  /* ══════════════════════════════════════════════════════════════════
     AUTO-LOGIN on page load (from localStorage)
     ══════════════════════════════════════════════════════════════════ */
  async function tryAutoLogin() {
    const { token, username } = loadAuth();
    if (!token || !username) return;

    try {
      const r = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (!d.ok && !d.success) {
        clearAuth();
        return;
      }
      // Restore session silently
      authUser = {
        username: d.username || username,
        token,
        friends: d.friends || [],
        pendingRequests: d.pendingRequests || [],
      };
      window.gaicaniAuthUser = authUser;
      updateAuthBadge();
      updateRegMenuVisibility();
      bindSocketEvents();
      // Auto-fill and submit name so returning users skip the name modal
      autoSetNameAfterAuth(authUser.username);
    } catch (_) {
      // Network error — restore from local storage best-effort
      authUser = { username, token, friends: [], pendingRequests: [] };
      window.gaicaniAuthUser = authUser;
      updateAuthBadge();
      updateRegMenuVisibility();
      bindSocketEvents();
      autoSetNameAfterAuth(username);
    }
  }

  /* ── Expose openDashboard globally for any external callers ──────── */
  window.openDashboard = openDashboard;

  /* ── Init ────────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    // Activate guest tab by default
    activateTab("guest");
    updateAuthBadge();
    updateRegMenuVisibility();
    tryAutoLogin();
  });

})();
