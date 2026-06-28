/* ════════════════════════════════════════════════════════════════════════════
   REG MENU ADDON — Three-dots (⋮) menu functionality for registered users
   
   HOW TO INTEGRATE:
   1. Add this code INSIDE the auth-client.js IIFE, after the updateAuthBadge() 
      function (around line 180).
   2. Make sure to add the CSS file: <link rel="stylesheet" href="auth-menu.css" />
   3. The menu will automatically show/hide based on login status
   ════════════════════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════════
     REGISTERED USER MENU (⋮)
     ══════════════════════════════════════════════════════════════════ */

  // Update menu visibility based on auth status
  function updateRegMenuVisibility() {
    const menuBtn = $("regMenuBtn");
    if (!menuBtn) return;
    menuBtn.style.display = authUser ? "flex" : "none";
    closeRegMenu(); // Close menu if user logs out
  }

  // Open/toggle the menu
  function toggleRegMenu(e) {
    const dropdown = $("regMenuDropdown");
    if (!dropdown) return;
    if (dropdown.style.display === "none" || !dropdown.style.display) {
      openRegMenu();
    } else {
      closeRegMenu();
    }
    e.stopPropagation();
  }

  function openRegMenu() {
    const dropdown = $("regMenuDropdown");
    if (dropdown) dropdown.style.display = "block";
  }

  function closeRegMenu() {
    const dropdown = $("regMenuDropdown");
    if (dropdown) dropdown.style.display = "none";
  }

  // Close menu when clicking outside
  document.addEventListener("click", () => {
    closeRegMenu();
  });

  // Menu button click
  $("regMenuBtn")?.addEventListener("click", toggleRegMenu);

  /* ── Menu item actions ─────────────────────────────────────────── */

  // Interests (Bio)
  $("regMenuInt")?.addEventListener("click", () => {
    closeRegMenu();
    const bioPopup = $("bioPopup");
    if (bioPopup) bioPopup.style.display = "flex";
  });

  // Games
  $("regMenuGames")?.addEventListener("click", () => {
    closeRegMenu();
    // Trigger the games button if it exists on chat screen
    const interestsBtn = $("interestsBtn");
    if (interestsBtn && interestsBtn.style.display !== "none") {
      interestsBtn.click();
    } else {
      showToast("🎮 თამაშები მხოლოდ ჩატის დროს ხელმისაწვდომია");
    }
  });

  // Dashboard (My Page)
  $("regMenuDash")?.addEventListener("click", () => {
    closeRegMenu();
    openDashboard();
  });

  // Logout
  $("regMenuLogout")?.addEventListener("click", () => {
    closeRegMenu();
    if (!confirm("გამოხვიდეთ სისტემიდან?")) return;
    clearAuth();
    window.location.reload();
  });

  // Update menu when auth changes
  const originalHandleAuthSuccess = window.handleAuthSuccess || null;
  if (originalHandleAuthSuccess) {
    window.handleAuthSuccess = function(...args) {
      originalHandleAuthSuccess(...args);
      updateRegMenuVisibility();
    };
  }

  // Also update when listening for auth events
  const originalBindSocketEvents = window.bindSocketEvents || null;

  /* ════════════════════════════════════════════════════════════════════
     INTEGRATION NOTE:
     This code hooks into:
     - updateAuthBadge() → also calls updateRegMenuVisibility()
     - Socket auth events to trigger updateRegMenuVisibility()
     
     The menu automatically:
     ✓ Shows when user logs in
     ✓ Hides when user logs out
     ✓ Closes when clicking outside
     ✓ Provides access to interests, games, dashboard, and logout
     ════════════════════════════════════════════════════════════════════ */
