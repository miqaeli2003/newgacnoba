/**
 * ═════════════════════════════════════════════════════════════════════════════
 * KEYBOARD HANDLER — Mobile-Optimized Viewport & Input Management
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Detects mobile keyboard open/close
 * - Adjusts chat input position dynamically
 * - Prevents keyboard overlap
 * - Smooth scroll to input on focus
 * - Cross-browser & cross-device compatible
 * 
 * Usage: Add <script src="keyboard-handler.js"></script> before </body>
 * ═════════════════════════════════════════════════════════════════════════════
 */

(function () {
  "use strict";

  const DEBUG = false; // Set to true to see console logs

  // ── State ─────────────────────────────────────────────────────────────────
  let keyboardOpen = false;
  let originalScrollY = 0;
  let chatInputElement = null;
  let messageInputElement = null;
  let chatContainerElement = null;

  // Device detection
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  function log(...args) {
    if (DEBUG) console.log("[KeyboardHandler]", ...args);
  }

  // ── Initialize ────────────────────────────────────────────────────────────
  function init() {
    log("Initializing keyboard handler...");

    chatInputElement = document.querySelector(".chat-input");
    messageInputElement = document.getElementById("messageInput");
    chatContainerElement = document.querySelector(".chat-container");

    if (!chatInputElement || !messageInputElement) {
      log("Required elements not found, retrying in 100ms...");
      setTimeout(init, 100);
      return;
    }

    log("Elements found, setting up listeners...");

    // Focus/blur on input
    messageInputElement.addEventListener("focus", handleInputFocus, { passive: true });
    messageInputElement.addEventListener("blur", handleInputBlur, { passive: true });

    // Window resize (keyboard open/close triggers resize)
    window.addEventListener("resize", handleWindowResize, { passive: true });

    // iOS specific: detect keyboard via visual viewport
    if (isIOS) {
      log("iOS detected, setting up visual viewport listener...");
      window.visualViewport?.addEventListener("resize", handleVisualViewportResize, {
        passive: true,
      });
    }

    // Orientation change
    window.addEventListener("orientationchange", handleOrientationChange, { passive: true });

    // Prevent double-tap zoom (improves responsiveness)
    document.addEventListener("touchstart", handleTouchStart, { passive: true });

    log("Keyboard handler initialized");
  }

  // ── Input Focus ───────────────────────────────────────────────────────────
  function handleInputFocus(e) {
    log("Input focused");
    keyboardOpen = true;
    document.body.classList.add("keyboard-open");

    // Scroll chat to bottom after small delay (for keyboard animation)
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  }

  // ── Input Blur ────────────────────────────────────────────────────────────
  function handleInputBlur(e) {
    log("Input blurred");
    // Don't immediately mark as closed — wait for visual confirmation
    setTimeout(() => {
      if (document.activeElement !== messageInputElement) {
        keyboardOpen = false;
        document.body.classList.remove("keyboard-open");
        log("Keyboard marked as closed");
      }
    }, 100);
  }

  // ── Window Resize (Keyboard Detection) ─────────────────────────────────
  function handleWindowResize() {
    const currentHeight = window.innerHeight;
    log(`Window resize: ${currentHeight}px`);

    // iOS: visual viewport will be smaller when keyboard open
    // Android: window.innerHeight will change
    if (isIOS && window.visualViewport) {
      const ratio = window.visualViewport.height / window.innerHeight;
      const isOpen = ratio < 0.9; // Keyboard covers >10% of viewport
      updateKeyboardState(isOpen);
    } else if (isAndroid) {
      // Android: assume keyboard is open if input is focused
      const isOpen = document.activeElement === messageInputElement;
      updateKeyboardState(isOpen);
    }

    adjustInputPosition();
  }

  // ── Visual Viewport Resize (iOS Keyboard) ─────────────────────────────
  function handleVisualViewportResize(e) {
    if (!window.visualViewport) return;
    const ratio = window.visualViewport.height / window.innerHeight;
    log(`Visual viewport ratio: ${ratio.toFixed(2)}`);

    // Keyboard open = visual viewport much smaller
    updateKeyboardState(ratio < 0.85);
    adjustInputPosition();
  }

  // ── Orientation Change ────────────────────────────────────────────────
  function handleOrientationChange() {
    log(`Orientation changed to ${window.orientation}`);
    setTimeout(() => {
      adjustInputPosition();
      scrollToBottom();
    }, 200); // Wait for rotation animation
  }

  // ── Touch Start (Prevent double-tap zoom) ─────────────────────────────
  let lastTouchTime = 0;
  function handleTouchStart(e) {
    const now = Date.now();
    if (now - lastTouchTime < 300) {
      e.preventDefault();
    }
    lastTouchTime = now;
  }

  // ── Update Keyboard State ─────────────────────────────────────────────
  function updateKeyboardState(isOpen) {
    if (isOpen === keyboardOpen) return; // No change
    keyboardOpen = isOpen;
    log(`Keyboard state: ${isOpen ? "OPEN" : "CLOSED"}`);

    if (isOpen) {
      document.body.classList.add("keyboard-open");
    } else {
      document.body.classList.remove("keyboard-open");
    }
  }

  // ── Adjust Input Position ─────────────────────────────────────────────
  function adjustInputPosition() {
    if (!chatInputElement) return;

    const chatInput = chatInputElement;
    const safeAreaBottom = getComputedStyle(document.documentElement).getPropertyValue(
      "--safe-area-bottom"
    );

    if (keyboardOpen) {
      // Keyboard is open: ensure input is visible and above keyboard
      chatInput.style.position = "fixed";
      chatInput.style.bottom = "0";
      chatInput.style.left = "0";
      chatInput.style.right = "0";
      chatInput.style.zIndex = "999";

      // Add padding for safe area
      const safePadding = parseInt(safeAreaBottom) || 0;
      chatInput.style.paddingBottom = `max(12px, calc(env(safe-area-inset-bottom) + ${safePadding}px))`;

      log("Input positioned above keyboard");
    } else {
      // Keyboard closed: return to normal flow
      chatInput.style.position = "relative";
      chatInput.style.bottom = "auto";
      chatInput.style.left = "auto";
      chatInput.style.right = "auto";
      chatInput.style.zIndex = "50";
      chatInput.style.paddingBottom = "";

      log("Input returned to normal position");
    }
  }

  // ── Scroll to Bottom ──────────────────────────────────────────────────
  function scrollToBottom() {
    if (!chatContainerElement) return;

    // Use RAF for smooth animation
    requestAnimationFrame(() => {
      chatContainerElement.scrollTop = chatContainerElement.scrollHeight;
      log(`Scrolled to bottom (${chatContainerElement.scrollHeight}px)`);
    });
  }

  // ── Setup Viewport Meta Tag ───────────────────────────────────────────
  function setupViewportMeta() {
    let viewport = document.querySelector('meta[name="viewport"]');

    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.head.appendChild(viewport);
    }

    // Ensure proper viewport settings
    const currentContent = viewport.getAttribute("content") || "";

    // Required settings for mobile keyboard handling
    const requiredSettings = {
      "width": "device-width",
      "initial-scale": "1",
      "viewport-fit": "cover",
      "user-scalable": "no",
      "maximum-scale": "1",
      "minimum-scale": "1",
    };

    // Parse existing settings
    const settings = {};
    currentContent.split(",").forEach((part) => {
      const [key, value] = part.trim().split("=");
      if (key) settings[key.trim()] = value ? value.trim() : true;
    });

    // Apply required settings
    Object.assign(settings, requiredSettings);

    // Rebuild viewport meta
    const newContent = Object.entries(settings)
      .map(([k, v]) => (v === true ? k : `${k}=${v}`))
      .join(", ");

    viewport.setAttribute("content", newContent);
    log("Viewport meta tag updated:", newContent);
  }

  // ── Add CSS Variables ─────────────────────────────────────────────────
  function addCSSVariables() {
    const root = document.documentElement;

    // Safe area CSS variables
    root.style.setProperty("--safe-area-top", "env(safe-area-inset-top)");
    root.style.setProperty("--safe-area-bottom", "env(safe-area-inset-bottom)");
    root.style.setProperty("--safe-area-left", "env(safe-area-inset-left)");
    root.style.setProperty("--safe-area-right", "env(safe-area-inset-right)");

    log("CSS variables set");
  }

  // ── Prevent Input Zoom on iOS ─────────────────────────────────────────
  function preventInputZoom() {
    // Set body font-size to 16px+ to prevent iOS auto-zoom on focus
    const html = document.documentElement;
    const currentSize = getComputedStyle(html).fontSize;
    const size = parseFloat(currentSize);

    if (size < 16) {
      html.style.fontSize = "16px";
      log("Set font-size to 16px to prevent iOS zoom");
    }
  }

  // ── Smooth Scrolling ──────────────────────────────────────────────────
  function enableSmoothScrolling() {
    // Check if browser supports smooth scroll
    if (CSS && CSS.supports && CSS.supports("scroll-behavior", "smooth")) {
      document.documentElement.style.scrollBehavior = "smooth";
      if (chatContainerElement) {
        chatContainerElement.style.scrollBehavior = "smooth";
      }
      log("Smooth scrolling enabled");
    }
  }

  // ── Main Setup ────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setupViewportMeta();
      addCSSVariables();
      preventInputZoom();
      enableSmoothScrolling();
      init();
    });
  } else {
    // DOM already loaded
    setupViewportMeta();
    addCSSVariables();
    preventInputZoom();
    enableSmoothScrolling();
    init();
  }

  // ── Public API ────────────────────────────────────────────────────────
  window.KeyboardHandler = {
    isOpen: () => keyboardOpen,
    scrollToBottom: scrollToBottom,
    adjustPosition: adjustInputPosition,
  };

  log("Keyboard handler ready");
})();
