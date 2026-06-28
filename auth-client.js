/* ═══════════════════════════════════════════════════════════════════
   GAICANI — Auth Client  (auth-client.js)
   Registered users · Friends · Private Chat · Dashboard · ⋮ Menu
   Loaded after script.js. Uses window.socket (set in script.js).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── State ─────────────────────────────────────────────────────── */
  let authUser        = null;  // { username, token, friends[], pendingRequests[] }
  let partnerRegInfo  = null;  // { partnerRegName, isFriend, roomId }
  let currentPrivRoom = null;  // string roomId when panel is open
  let expiryInterval  = null;
  let privPanelOpen   = false;

  // Expose registration status globally so script.js can read it
  window.gaicaniAuthUser = null;

  // Session-only blocked registered users: Set of lowercase usernames
  let sessionBlockedReg = new Set();

  /* ── Shorthand ─────────────────────────────────────────────────── */
  const $  = id => document.getElementById(id);
  const sk = () => window.socket;

  /* ── HTML-escape ───────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g,
      c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }

  /* ══════════════════════════════════════════════════════════════════
     TOKEN STORAGE
     ══════════════════════════════════════════════════════════════════ */
  const LS_TOKEN = "gaicani_auth_token";
  const LS_USER  = "gaicani_auth_user";

  function saveAuth(token, username) {
    try { localStorage.setItem(LS_TOKEN, token); localStorage.setItem(LS_USER, username); }
    catch (_) {}
  }
  function loadAuth() {
    try { return { token: localStorage.getItem(LS_TOKEN), username: localStorage.getItem(LS_USER) }; }
    catch (_) { return {}; }
  }
  function clearAuth() {
    try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); }
    catch (_) {}
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL TABS
     ══════════════════════════════════════════════════════════════════ */
  function showAuthTab(tab) {
    ["guest", "signup", "login"].forEach(t => {
      const btn = $(`auth-tab-${t}`);
      const sec = $(`auth-section-${t}`);
      if (btn) btn.classList.toggle("active", t === tab);
      if (sec) sec.style.display = t === tab ? "" : "none";
    });
  }

  $("auth-tab-guest")  ?.addEventListener("click", () => showAuthTab("guest"));
  $("auth-tab-signup") ?.addEventListener("click", () => showAuthTab("signup"));
  $("auth-tab-login")  ?.addEventListener("click", () => showAuthTab("login"));

  /* ── Inline auth errors ─────────────────────────────────────────── */
  function setErr(section, msg) {
    const el = $(`${section}-error`);
    if (el) { el.textContent = msg; el.style.display = msg ? "block" : "none"; }
  }

  /* ══════════════════════════════════════════════════════════════════
     SIGN UP
     ══════════════════════════════════════════════════════════════════ */
  async function doSignup() {
    const username = ($("signup-username")?.value || "").trim();
    const password = $("signup-password")?.value  || "";
    const confirm  = $("signup-confirm")?.value   || "";

    setErr("signup", "");
    if (username.length < 2)   return setErr("signup", "სახელი — მინ. 2 სიმბოლო");
    if (username.length > 20)  return setErr("signup", "სახელი — მაქს. 20 სიმბოლო");
    if (password.length < 6)   return setErr("signup", "პაროლი — მინ. 6 სიმბოლო");
    if (password !== confirm)   return setErr("signup", "პაროლები არ ემთხვევა");

    const btn = $("signup-btn");
    if (btn) { btn.disabled = true; btn.textContent = "..."; }
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) return setErr("signup", d.error || "შეცდომა");
      handleAuthSuccess(d);
    } catch { setErr("signup", "კავშირის შეცდომა, სცადეთ თავიდან"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = "რეგისტრაცია"; } }
  }

  $("signup-btn")?.addEventListener("click", doSignup);
  ["signup-username","signup-password","signup-confirm"].forEach(id =>
    $(id)?.addEventListener("keydown", e => { if (e.key === "Enter") doSignup(); }));

  /* ══════════════════════════════════════════════════════════════════
     SIGN IN
     ══════════════════════════════════════════════════════════════════ */
  async function doLogin() {
    const username = ($("login-username")?.value || "").trim();
    const password = $("login-password")?.value  || "";

    setErr("login", "");
    if (!username || !password) return setErr("login", "შეავსეთ ყველა ველი");

    const btn = $("login-btn");
    if (btn) { btn.disabled = true; btn.textContent = "..."; }
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) return setErr("login", d.error || "სახელი ან პაროლი არასწორია");
      handleAuthSuccess(d);
    } catch { setErr("login", "კავშირის შეცდომა, სცადეთ თავიდან"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = "შესვლა"; } }
  }

  $("login-btn")?.addEventListener("click", doLogin);
  ["login-username","login-password"].forEach(id =>
    $(id)?.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); }));

  /* ── Common: after auth success ─────────────────────────────────── */
  function handleAuthSuccess(data) {
    authUser = {
      username: data.username, token: data.token,
      friends: data.friends || [], pendingRequests: data.pendingRequests || [],
    };
    saveAuth(data.token, data.username);

    if (sk()) {
      if (sk().connected) sk().emit("auth:token", data.token);
      else sk().once("connect", () => sk().emit("auth:token", data.token));
    }

    updateAuthBadge();
    renderFriendsList(authUser.friends);
    renderDashFriends(authUser.friends);

    // Pre-fill the existing name field and auto-submit
    const ni = $("nameInput");
    if (ni) ni.value = data.username;
    const sb = $("saveNameBtn");
    if (sb) setTimeout(() => sb.click(), 50);
  }

  /* ── Auth badge (top bar) ───────────────────────────────────────── */
  function updateAuthBadge() {
    const b = $("auth-user-badge");
    if (!b) return;
    // Keep global in sync so script.js can check registration status
    window.gaicaniAuthUser = authUser;
    if (authUser) {
      b.textContent = `🔐 ${esc(authUser.username)}`;
      b.style.display = "inline-flex";
      // Show/hide logout
      const lb = $("auth-logout-btn");
      if (lb) lb.style.display = "inline-flex";
      // Update dashboard user card
      const du = $("dashUsername");
      const da = $("dashAvatar");
      if (du) du.textContent = authUser.username;
      if (da) da.textContent = authUser.username.charAt(0).toUpperCase();
      // Registered users: hide Change Name button and dropdown item (name is permanent)
      const cnb = document.getElementById("changeNameBtn");
      if (cnb) cnb.style.display = "none";
      const dmName = document.getElementById("dm-name");
      if (dmName) dmName.style.display = "none";
    } else {
      b.style.display = "none";
      const lb = $("auth-logout-btn");
      if (lb) lb.style.display = "none";
      // Guest: restore Change Name button and dropdown item
      const cnb = document.getElementById("changeNameBtn");
      if (cnb) cnb.style.display = "";
      const dmName = document.getElementById("dm-name");
      if (dmName) dmName.style.display = "";
    }
  }

  /* ── Logout button ──────────────────────────────────────────────── */
  $("auth-logout-btn")?.addEventListener("click", () => {
    if (!confirm("გამოხვიდეთ სისტემიდან?")) return;
    clearAuth(); window.location.reload();
  });

  /* ══════════════════════════════════════════════════════════════════
     AUTO-LOGIN  (on page load, if token is saved)
     ══════════════════════════════════════════════════════════════════ */
  async function tryAutoLogin() {
    const { token, username } = loadAuth();
    if (!token || !username) return false;

    const ni = $("nameInput");
    if (ni && !ni.value) ni.value = username;

    try {
      const r = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (!d.ok) { clearAuth(); return false; }
      handleAuthSuccess({ ...d, token });
      return true;
    } catch { clearAuth(); return false; }
  }

  /* ══════════════════════════════════════════════════════════════════
     THREE-DOT MENU
     ══════════════════════════════════════════════════════════════════ */
  const dotMenuBtn       = $("dotMenuBtn");
  const dotMenuDropdown  = $("dotMenuDropdown");

  function closeDotMenu() {
    if (dotMenuDropdown) dotMenuDropdown.style.display = "none";
  }

  dotMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = dotMenuDropdown?.style.display !== "none";
    if (dotMenuDropdown) dotMenuDropdown.style.display = open ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (dotMenuDropdown && !dotMenuBtn?.contains(e.target)) closeDotMenu();
  });

  // ⋮ → Games: trigger the existing games button if present
  $("dm-games")?.addEventListener("click", () => {
    closeDotMenu();
    // Try to find the games button injected by games.js
    const gBtn = document.getElementById("gamesBtn") || document.querySelector(".games-btn");
    if (gBtn) { gBtn.click(); return; }
    // Fallback: dispatch a custom event games.js can listen for
    document.dispatchEvent(new CustomEvent("gaicani:openGames"));
  });

  // ⋮ → Change name
  $("dm-name")?.addEventListener("click", () => {
    closeDotMenu();
    document.getElementById("changeNameBtn")?.click();
  });

  // ⋮ → Interests
  $("dm-interests")?.addEventListener("click", () => {
    closeDotMenu();
    document.getElementById("interestsBtn")?.click();
  });

  // ⋮ → My Page (Dashboard)
  $("dm-mypage")?.addEventListener("click", () => {
    closeDotMenu();
    openDashboard();
  });

  /* ══════════════════════════════════════════════════════════════════
     DASHBOARD / MY PAGE
     ══════════════════════════════════════════════════════════════════ */
  function openDashboard() {
    if (!authUser) {
      showToast("ჯერ შედით სისტემაში 👆");
      // Show login tab in modal
      const nameModal = $("nameModal");
      if (nameModal) {
        nameModal.style.display = "flex";
        showAuthTab("login");
      }
      return;
    }
    // Redirect to the dedicated dashboard page
    window.location.href = "/dashboard.html";
  }

  /* ── Dashboard: friends list ────────────────────────────────────── */
  function renderDashFriends(friends) {
    const list = $("dash-friends-list");
    if (!list) return;

    const fc = $("dashFriendCount");
    if (fc) fc.textContent = (friends || []).length;

    if (!friends || !friends.length) {
      list.innerHTML = `<div class="dash-empty">ჯერ მეგობრები არ გყავს.<br>
        <small>ჩატის დროს ➕ ღილაკზე დააჭირე.</small></div>`;
      return;
    }

    list.innerHTML = friends.map(f => `
      <div class="dash-friend-item" data-friend="${esc(f)}">
        <div class="dash-friend-avatar">${esc(f).charAt(0).toUpperCase()}</div>
        <span class="dash-friend-name dash-reg-name">${esc(f)}</span>
        <div class="dash-friend-actions">
          <button class="dash-action-sm dash-chat-btn" data-f="${esc(f)}" title="Private Chat">💬</button>
          <button class="dash-action-sm dash-remove-btn" data-f="${esc(f)}" title="მეგობრობის გაუქმება">✕</button>
          <button class="dash-action-sm dash-block-reg-btn" data-f="${esc(f)}" title="სესიის ბლოკი">🚫</button>
        </div>
      </div>`).join("");

    // Chat with friend
    list.querySelectorAll(".dash-chat-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!authUser) return;
        const rid = [authUser.username.toLowerCase(),
                     btn.dataset.f.toLowerCase()].sort().join("::");
        openPrivateChat(rid, btn.dataset.f);
        closeDashboard();
      });
    });

    // Remove friend
    list.querySelectorAll(".dash-remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const fname = btn.dataset.f;
        if (!confirm(`წაშალოთ ${fname} მეგობრებიდან?`)) return;
        sk()?.emit("friend:remove", { friendUsername: fname });
      });
    });

    // Session-block friend
    list.querySelectorAll(".dash-block-reg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const fname = btn.dataset.f;
        if (!confirm(`დაბლოკოთ ${fname} ამ სესიაზე? (ბლოკი ავტომატურად გაუქმდება სესიის ბოლოს)`)) return;
        sessionBlockReg(fname);
      });
    });
  }

  /* ── Dashboard: blocked list (session only) ─────────────────────── */
  function renderDashBlocked() {
    const list    = $("dash-blocked-list");
    const section = $("dashBlockedSection");
    const cnt     = $("dashBlockedCount");
    if (!list || !section) return;

    const blocked = [...sessionBlockedReg];
    if (cnt) cnt.textContent = blocked.length;
    section.style.display = blocked.length ? "block" : "none";

    if (!blocked.length) { list.innerHTML = ""; return; }

    list.innerHTML = blocked.map(u => `
      <div class="dash-friend-item">
        <div class="dash-friend-avatar" style="background:rgba(242,63,66,.2);color:#f23f42">${esc(u).charAt(0).toUpperCase()}</div>
        <span class="dash-friend-name" style="color:#f23f42">${esc(u)}</span>
        <button class="dash-action-sm" data-u="${esc(u)}" title="ბლოკის მოხსნა" style="color:#3ba55d">✓</button>
      </div>`).join("");

    list.querySelectorAll("button[data-u]").forEach(btn => {
      btn.addEventListener("click", () => {
        sessionBlockedReg.delete(btn.dataset.u);
        sk()?.emit("reg:sessionUnblock", { targetUsername: btn.dataset.u });
        renderDashBlocked();
        showToast(`✅ ${esc(btn.dataset.u)} — ბლოკი მოხსნილია (სესია)`);
      });
    });
  }

  /* ── Session-block a registered user ───────────────────────────── */
  function sessionBlockReg(username) {
    const lc = username.toLowerCase();
    sessionBlockedReg.add(lc);
    sk()?.emit("reg:sessionBlock", { targetUsername: lc });
    renderDashBlocked();
    renderDashFriends(authUser?.friends || []);
    showToast(`🚫 ${esc(username)} — დაბლოკილია ამ სესიაზე`);
    const section = $("dashBlockedSection");
    if (section) section.style.display = "block";
  }

  /* ── Purple name helper ─────────────────────────────────────────── */
  // Marks partner name element purple when they are a registered user
  function markPartnerNamePurple(isReg) {
    const el = document.getElementById("partnerNameDisplay");
    if (!el) return;
    if (isReg) {
      el.classList.add("reg-partner-name");
    } else {
      el.classList.remove("reg-partner-name");
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     SOCKET EVENTS — AUTH
     ══════════════════════════════════════════════════════════════════ */
  function bindSocketEvents() {
    const s = sk();
    if (!s) return;

    s.on("auth:authenticated", ({ username, friends, pendingRequests }) => {
      if (authUser) {
        authUser.username = username;
        authUser.friends  = friends || [];
        authUser.pendingRequests = pendingRequests || [];
      }
      updateAuthBadge();
      renderFriendsList(friends || []);
      renderDashFriends(friends || []);
      (pendingRequests || []).forEach(fr => showFriendRequestNotif(fr));
    });

    s.on("auth:invalid", () => { clearAuth(); authUser = null; updateAuthBadge(); });

    /* ── Partner reg info ─────────────────────────────────────────── */
    s.on("auth:partnerRegInfo", ({ partnerRegName, isFriend, roomId }) => {
      partnerRegInfo = { partnerRegName, isFriend, roomId };
      renderPartnerRegBanner(partnerRegName, isFriend, roomId);
      // Mark partner name purple
      markPartnerNamePurple(true);
    });

    s.on("partnerFound", () => {
      hidePartnerRegBanner();
      partnerRegInfo = null;
      markPartnerNamePurple(false); // reset until we learn otherwise
      if (authUser) setTimeout(() => s.emit("auth:checkPartner"), 700);
    });

    s.on("partnerDisconnected", () => {
      hidePartnerRegBanner();
      partnerRegInfo = null;
      markPartnerNamePurple(false);
    });

    /* ── Friend events ─────────────────────────────────────────────── */
    s.on("friend:requested",  ({ fromUsername }) => showFriendRequestNotif(fromUsername));

    s.on("friend:accepted",   ({ username, friends }) => {
      if (authUser) authUser.friends = friends || [];
      renderFriendsList(friends || []);
      renderDashFriends(friends || []);
      showToast(`✅ ${esc(username)} ახლა შენი მეგობარია!`);
      const fc = $("dashFriendCount");
      if (fc) fc.textContent = (friends || []).length;
    });

    s.on("friend:nowFriends", ({ withUsername }) => {
      if (authUser && !authUser.friends.includes(withUsername.toLowerCase()))
        authUser.friends.push(withUsername.toLowerCase());
      renderFriendsList(authUser?.friends || []);
      renderDashFriends(authUser?.friends || []);
      showToast(`✅ ${esc(withUsername)} ახლა შენი მეგობარია!`);
      if (partnerRegInfo &&
          partnerRegInfo.partnerRegName.toLowerCase() === withUsername.toLowerCase()) {
        partnerRegInfo.isFriend = true;
        renderPartnerRegBanner(partnerRegInfo.partnerRegName, true, partnerRegInfo.roomId);
      }
    });

    s.on("friend:removed", ({ friends }) => {
      if (authUser) authUser.friends = friends || [];
      renderFriendsList(friends || []);
      renderDashFriends(friends || []);
      const fc = $("dashFriendCount");
      if (fc) fc.textContent = (friends || []).length;
      showToast("✅ მეგობარი წაიშალა");
    });

    s.on("friend:error",      ({ msg }) => showToast(`❌ ${esc(msg)}`));

    /* ── Private chat events ──────────────────────────────────────── */
    s.on("private:history", ({ roomId, messages, expiresAt }) => {
      if (roomId !== currentPrivRoom) return;
      const msgs = $("priv-messages");
      if (!msgs) return;
      msgs.innerHTML = "";
      if (!messages.length) {
        msgs.innerHTML = `<div class="pcm-empty">📭 შეტყობინება ჯერ არ არის<br>
          <small style="color:#72767d">ჩატი ავტომატურად იშლება 12 საათში</small></div>`;
      } else {
        messages.forEach(m => appendPrivMsg(m));
      }
      scrollPriv();
      startExpiryTimer(expiresAt);
    });

    s.on("private:newMessage", ({ roomId, message }) => {
      if (roomId !== currentPrivRoom) {
        showToast(`💬 ${esc(message.sender)}: ${esc(message.text.slice(0, 45))}…`);
        return;
      }
      appendPrivMsg(message);
      scrollPriv();
    });

    s.on("private:notification", ({ from }) => {
      if (!privPanelOpen) showToast(`💬 ახალი შეტყობინება — ${esc(from)}`);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     PARTNER REGISTERED BANNER
     ══════════════════════════════════════════════════════════════════ */
  function renderPartnerRegBanner(name, isFriend, roomId) {
    const b = $("partner-reg-banner");
    if (!b) return;
    b.innerHTML = "";

    const info = document.createElement("span");
    info.className = "prb-info";

    const btn = document.createElement("button");

    if (isFriend) {
      info.textContent = `💬 ${esc(name)} — შენი მეგობარია`;
      btn.className    = "prb-btn prb-private";
      btn.textContent  = "🔒 Private Chat";
      btn.onclick      = () => openPrivateChat(roomId, name);
    } else {
      info.textContent = `🌟 ${esc(name)} — რეგისტრირებულია`;
      btn.className    = "prb-btn prb-add";
      btn.textContent  = "➕ მეგობრობა";
      btn.onclick      = () => {
        sk()?.emit("friend:request", { toUsername: name });
        btn.textContent = "✅ გაგზავნილია";
        btn.disabled    = true;
      };
    }

    b.append(info, btn);
    b.style.display = "flex";
  }

  function hidePartnerRegBanner() {
    const b = $("partner-reg-banner");
    if (b) b.style.display = "none";
  }

  /* ══════════════════════════════════════════════════════════════════
     FRIENDS PANEL (sidebar)
     ══════════════════════════════════════════════════════════════════ */
  $("auth-friends-btn")?.addEventListener("click", () => {
    if (!authUser) { showToast("ჯერ შედით სისტემაში"); return; }
    const p = $("friends-panel");
    if (p) p.style.display = p.style.display === "flex" ? "none" : "flex";
  });

  $("friends-panel-close")?.addEventListener("click", () => {
    const p = $("friends-panel");
    if (p) p.style.display = "none";
  });

  function renderFriendsList(friends) {
    const list = $("friends-list");
    if (!list) return;
    if (!friends || !friends.length) {
      list.innerHTML = `<div class="fl-empty">ჯერ მეგობრები არ გყავს.<br>
        ჩატის დროს ნახავ <strong>➕</strong> ღილაკს.</div>`;
      return;
    }
    list.innerHTML = friends.map(f => `
      <div class="fl-item">
        <span class="fl-name dash-reg-name">👤 ${esc(f)}</span>
        <button class="fl-btn" data-f="${esc(f)}">💬 Chat</button>
      </div>`).join("");
    list.querySelectorAll(".fl-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!authUser || !btn.dataset.f) return;
        const rid = [authUser.username.toLowerCase(),
                     btn.dataset.f.toLowerCase()].sort().join("::");
        openPrivateChat(rid, btn.dataset.f);
        const p = $("friends-panel");
        if (p) p.style.display = "none";
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     PRIVATE CHAT PANEL
     ══════════════════════════════════════════════════════════════════ */
  function openPrivateChat(roomId, partnerName) {
    if (!authUser) { showToast("ჯერ შედით სისტემაში"); return; }
    currentPrivRoom = roomId;
    privPanelOpen   = true;

    const title = $("priv-title");
    if (title) title.textContent = `🔒 ${esc(partnerName)}`;

    const msgs = $("priv-messages");
    if (msgs) msgs.innerHTML = `<div class="pcm-loading">⌛ ჩიტვირთება...</div>`;

    const panel = $("priv-panel");
    if (panel) panel.style.display = "flex";

    sk()?.emit("private:join", { roomId });
  }

  function closePrivateChat() {
    if (currentPrivRoom) sk()?.emit("private:leave", { roomId: currentPrivRoom });
    currentPrivRoom = null;
    privPanelOpen   = false;
    const panel = $("priv-panel");
    if (panel) panel.style.display = "none";
    if (expiryInterval) { clearInterval(expiryInterval); expiryInterval = null; }
  }

  $("priv-close")?.addEventListener("click", closePrivateChat);
  $("priv-send") ?.addEventListener("click", sendPrivMsg);
  $("priv-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrivMsg(); }
  });

  function sendPrivMsg() {
    const input = $("priv-input");
    const text  = (input?.value || "").trim();
    if (!text || !currentPrivRoom) return;
    sk()?.emit("private:message", { roomId: currentPrivRoom, text });
    if (input) { input.value = ""; input.style.height = "auto"; }
  }

  function appendPrivMsg(msg) {
    const msgs = $("priv-messages");
    if (!msgs || !authUser) return;
    const isMe = msg.senderLower === authUser.username.toLowerCase();
    const el   = document.createElement("div");
    el.className = `pc-msg ${isMe ? "pc-me" : "pc-them"}`;
    const ts = new Date(msg.ts).toLocaleTimeString("ka-GE",
      { hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `<span class="pc-text">${esc(msg.text)}</span>
                    <span class="pc-ts">${ts}</span>`;
    msgs.appendChild(el);
  }

  function scrollPriv() {
    const msgs = $("priv-messages");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function startExpiryTimer(expiresAt) {
    if (expiryInterval) clearInterval(expiryInterval);
    function tick() {
      const el = $("priv-expiry");
      if (!el) return;
      const rem = expiresAt - Date.now();
      if (rem <= 0) { el.textContent = "⚠️ ჩატი ამოიწურა"; clearInterval(expiryInterval); return; }
      const h = Math.floor(rem / 3600000);
      const m = Math.floor((rem % 3600000) / 60000);
      el.textContent = `⏱ ავტო-წაშლა: ${h}სთ ${m}წთ`;
    }
    tick();
    expiryInterval = setInterval(tick, 60000);
  }

  /* ══════════════════════════════════════════════════════════════════
     FRIEND REQUEST NOTIFICATION (in-app)
     ══════════════════════════════════════════════════════════════════ */
  function showFriendRequestNotif(fromUsername) {
    const c = $("notif-container");
    if (!c) return;
    if (c.querySelector(`[data-from="${CSS.escape(fromUsername)}"]`)) return;

    const n = document.createElement("div");
    n.className = "fn-notif";
    n.dataset.from = fromUsername;
    n.innerHTML = `
      <div class="fn-text">👥 <strong>${esc(fromUsername)}</strong><br>
        <span style="font-size:.82em;color:#b5bac1">მეგობრობის მოთხოვნა</span></div>
      <div class="fn-btns">
        <button class="fn-accept">✅ მიღება</button>
        <button class="fn-decline">❌</button>
      </div>`;
    n.querySelector(".fn-accept").onclick = () => {
      sk()?.emit("friend:accept", { fromUsername }); n.remove();
    };
    n.querySelector(".fn-decline").onclick = () => {
      sk()?.emit("friend:decline", { fromUsername }); n.remove();
    };
    c.appendChild(n);
    setTimeout(() => n.remove(), 30000);
  }

  /* ══════════════════════════════════════════════════════════════════
     TOAST
     ══════════════════════════════════════════════════════════════════ */
  function showToast(msg, ms = 3800) {
    const c = $("notif-container");
    if (!c) return;
    const t = document.createElement("div");
    t.className   = "auth-toast";
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .35s";
      t.style.opacity    = "0";
      setTimeout(() => t.remove(), 380);
    }, ms);
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════════ */
  document.addEventListener("DOMContentLoaded", async () => {
    showAuthTab("guest");
    updateAuthBadge();
    renderFriendsList([]);
    renderDashFriends([]);
    bindSocketEvents();
    await tryAutoLogin();

    // Handle private-chat redirect coming from dashboard.html
    try {
      const privRedirect = sessionStorage.getItem("gaicani_open_priv");
      if (privRedirect && authUser) {
        sessionStorage.removeItem("gaicani_open_priv");
        const { friend } = JSON.parse(privRedirect);
        if (friend && authUser) {
          const rid = [authUser.username.toLowerCase(), friend.toLowerCase()].sort().join("::");
          // Wait a moment for socket to be ready, then open private chat
          setTimeout(() => openPrivateChat(rid, friend), 1200);
        }
      }
    } catch (_) {}
  });

})();
