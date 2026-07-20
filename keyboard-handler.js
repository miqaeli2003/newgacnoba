/**
 * ═════════════════════════════════════════════════════════════════════════════
 * KEYBOARD HANDLER — Ultra-Optimized for ALL Phones (Strict 2px Gap)
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * ✅ FIXES:
 * ✓ Maintains a clean, strict 2px gap between keyboard/input & last message
 * ✓ Measures ACTUAL keyboard height dynamically
 * ✓ Works on ALL phone models (iOS, Android, notches, all keyboard sizes)
 * ✓ Real-time viewport monitoring with ResizeObserver
 * ✓ Prevents iOS auto-zoom on input focus
 * ✓ Handles orientation changes seamlessly
 * ✓ Optimized rendering with hardware acceleration
 * 
 * Usage: <script src="keyboard-handler.js"></script> before </body>
 * ═════════════════════════════════════════════════════════════════════════════
 */

(function () {
  "use strict";

  const DEBUG = false; // Set to true to see console logs

  // ────────────────────────────────────────────────────────────────────────────
  // STATE
  // ────────────────────────────────────────────────────────────────────────────
  let state = {
    keyboardOpen: false,
    keyboardHeight: 0,
    lastViewportHeight: window.innerHeight,
    inputHeight: 0,
    headerHeight: 0,
  };

  // ────────────────────────────────────────────────────────────────────────────
  // DOM CACHE
  // ────────────────────────────────────────────────────────────────────────────
  let dom = {
    chatContainer: null,
    chatInput: null,
    messageInput: null,
    header: null,
  };

  // ────────────────────────────────────────────────────────────────────────────
  // OBSERVERS
  // ────────────────────────────────────────────────────────────────────────────
  let observers = {
    resize: null,
  };

  function log(...args) {
    if (DEBUG) console.log("[KeyboardHandler]", ...args);
  }

  /**
   * Cache all DOM elements we need
   */
  function cacheDOM() {
    dom.chatContainer = document.querySelector(".chat-container");
    dom.chatInput = document.querySelector(".chat-input");
    dom.messageInput = document.getElementById("messageInput");
    dom.header = document.querySelector("header") || document.querySelector(".header");

    return !!(dom.chatContainer && dom.chatInput && dom.messageInput);
  }

  /**
   * Setup viewport meta tag for proper mobile behavior
   */
  function setupViewportMeta() {
    let viewport = document.querySelector('meta[name="viewport"]');

    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.head.appendChild(viewport);
    }

    viewport.setAttribute(
      "content",
      [
        "width=device-width",
        "initial-scale=1",
        "viewport-fit=cover",
        "interactive-widget=resizes-content",
        "user-scalable=no",
        "maximum-scale=1",
        "minimum-scale=1",
      ].join(", ")
    );

    log("✓ Viewport meta configured");
  }

  /**
   * Setup CSS variables for dynamic values
   */
  function setupCSSVariables() {
    const root = document.documentElement;

    root.style.setProperty("--viewport-height", `${window.innerHeight}px`);
    root.style.setProperty("--keyboard-height", "0px");
    root.style.setProperty("--safe-area-top", "env(safe-area-inset-top)");
    root.style.setProperty("--safe-area-bottom", "env(safe-area-inset-bottom)");
    root.style.setProperty("--safe-area-left", "env(safe-area-inset-left)");
    root.style.setProperty("--safe-area-right", "env(safe-area-inset-right)");

    log("✓ CSS variables initialized");
  }

  /**
   * Prevent iOS auto-zoom on input focus (CRITICAL!)
   */
  function preventIOSZoom() {
    const html = document.documentElement;
    const currentSize = parseFloat(getComputedStyle(html).fontSize);

    if (currentSize < 16) {
      html.style.fontSize = "16px";
      log("✓ iOS zoom prevention enabled");
    }
  }

  /**
   * Measure header and input heights using getBoundingClientRect for accuracy
   */
  function measureHeights() {
    if (dom.header) {
      const headerRect = dom.header.getBoundingClientRect();
      state.headerHeight = Math.ceil(headerRect.height);
    } else {
      state.headerHeight = 0;
    }

    if (dom.chatInput) {
      const inputRect = dom.chatInput.getBoundingClientRect();
      state.inputHeight = Math.ceil(inputRect.height);
    } else {
      state.inputHeight = 0;
    }

    log(`Heights: header=${state.headerHeight}px, input=${state.inputHeight}px`);
  }

  /**
   * Update CSS custom properties
   */
  function updateCSSVariables() {
    const root = document.documentElement;

    root.style.setProperty("--viewport-height", `${window.innerHeight}px`);
    root.style.setProperty("--keyboard-height", `${state.keyboardHeight}px`);
  }

  /**
   * Detect keyboard by measuring viewport height change
   * This works on ALL devices and keyboard types
   */
  function detectKeyboard() {
    const currentHeight = window.innerHeight;
    const heightDiff = state.lastViewportHeight - currentHeight;

    const MIN_THRESHOLD = 100;
    const isKeyboardOpen = heightDiff > MIN_THRESHOLD;

    if (isKeyboardOpen && !state.keyboardOpen) {
      state.keyboardOpen = true;
      state.keyboardHeight = heightDiff;

      log(`✓ Keyboard OPENED (height: ${heightDiff}px)`);
      onKeyboardOpen();
    } else if (!isKeyboardOpen && state.keyboardOpen) {
      state.keyboardOpen = false;
      state.keyboardHeight = 0;

      log("✓ Keyboard CLOSED");
      onKeyboardClose();
    } else if (isKeyboardOpen && state.keyboardOpen) {
      state.keyboardHeight = heightDiff;
      updateCSSVariables();
      adjustLayout();
      eliminateGap();
    }

    state.lastViewportHeight = currentHeight;
  }

  /**
   * Called when keyboard opens
   */
  function onKeyboardOpen() {
    document.body.classList.add("keyboard-open");
    updateCSSVariables();
    adjustLayout();

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom();
        setTimeout(() => eliminateGap(), 100);
      }, 50);
    });
  }

  /**
   * Called when keyboard closes
   */
  function onKeyboardClose() {
    document.body.classList.remove("keyboard-open");
    updateCSSVariables();
    restoreLayout();
  }

  /**
   * Adjust layout when keyboard is open
   */
  function adjustLayout() {
    if (!dom.chatContainer || !dom.chatInput) return;

    const root = document.documentElement;
    const safeAreaTop = parseInt(
      getComputedStyle(root).getPropertyValue("--safe-area-top") || "0"
    );
    const safeAreaBottom = parseInt(
      getComputedStyle(root).getPropertyValue("--safe-area-bottom") || "0"
    );

    const headerRect = dom.header ? dom.header.getBoundingClientRect() : { height: 0 };
    const inputRect = dom.chatInput.getBoundingClientRect();
    
    const headerHeight = headerRect.height || state.headerHeight;
    const inputHeight = inputRect.height || state.inputHeight;

    dom.chatInput.style.position = "fixed";
    dom.chatInput.style.bottom = "0";
    dom.chatInput.style.left = "0";
    dom.chatInput.style.right = "0";
    dom.chatInput.style.zIndex = "9999";
    dom.chatInput.style.transform = "translateZ(0)";
    dom.chatInput.style.paddingBottom = "max(8px, env(safe-area-inset-bottom))";
    dom.chatInput.style.width = "100%";
    dom.chatInput.style.boxSizing = "border-box";

    // Calculate exact available height accounting for all elements with a strict 2px gap
    const totalViewport = window.innerHeight;
    const topSpace = headerHeight + safeAreaTop;
    const bottomSpace = inputHeight + safeAreaBottom + 2; 
    
    const availableHeight = totalViewport - topSpace - bottomSpace;

    dom.chatContainer.style.position = "relative";
    dom.chatContainer.style.height = `${Math.max(0, availableHeight)}px`;
    dom.chatContainer.style.overflowY = "auto";
    dom.chatContainer.style.overflowX = "hidden";
    dom.chatContainer.style.WebkitOverflowScrolling = "touch";
    dom.chatContainer.style.willChange = "scroll-position";
    dom.chatContainer.style.flexShrink = "0";
    dom.chatContainer.style.paddingBottom = "0";
    dom.chatContainer.style.marginBottom = "0";

    log(`Layout adjusted: top=${topSpace}px, bottom=${bottomSpace}px, chat-height=${availableHeight}px`);
  }

  /**
   * Restore normal layout when keyboard closes
   */
  function restoreLayout() {
    if (!dom.chatContainer || !dom.chatInput) return;

    dom.chatInput.style.position = "relative";
    dom.chatInput.style.bottom = "auto";
    dom.chatInput.style.left = "auto";
    dom.chatInput.style.right = "auto";
    dom.chatInput.style.zIndex = "50";
    dom.chatInput.style.transform = "none";
    dom.chatInput.style.paddingBottom = "";

    dom.chatContainer.style.height = "auto";
    dom.chatContainer.style.willChange = "auto";
    dom.chatContainer.style.flexShrink = "1";

    log("Layout restored to normal");
  }

  /**
   * Detect and maintain exactly a 2px gap between chat and input on phones
   */
  function eliminateGap() {
    if (!dom.chatContainer || !dom.chatInput || !state.keyboardOpen) return;

    const containerRect = dom.chatContainer.getBoundingClientRect();
    const inputRect = dom.chatInput.getBoundingClientRect();

    // Calculate the current actual gap
    const currentGap = inputRect.top - containerRect.bottom;
    const targetGap = 2; // Keep exactly 2px of breathing room
    
    // Determine how far off we are from the target 2px
    const error = currentGap - targetGap;

    // Use a 0.5px tolerance threshold to prevent infinite layout jitter loops
    if (Math.abs(error) > 0.5) {
      const currentHeight = parseFloat(getComputedStyle(dom.chatContainer).height);
      const newHeight = currentHeight + error;

      dom.chatContainer.style.height = `${Math.max(0, newHeight)}px`;
      log(`Gap adjusted. Current: ${currentGap.toFixed(1)}px -> Target: ${targetGap}px (New height: ${newHeight.toFixed(1)}px)`);
    }
  }

  /**
   * Scroll chat to bottom
   */
  function scrollToBottom() {
    if (!dom.chatContainer) return;

    requestAnimationFrame(() => {
      dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
      log(`Scrolled to bottom (${dom.chatContainer.scrollHeight}px)`);
    });
  }

  /**
   * Handle input focus
   */
  function handleInputFocus() {
    log("Input focused");
  }

  /**
   * Handle input blur
   */
  function handleInputBlur() {
    log("Input blurred");
  }

  /**
   * Handle window resize
   */
  function handleWindowResize() {
    measureHeights();
    detectKeyboard();
    if (state.keyboardOpen) {
      eliminateGap();
    }
  }

  /**
   * Handle orientation change
   */
  function handleOrientationChange() {
    log("Orientation changed");
    state.lastViewportHeight = window.innerHeight;

    setTimeout(() => {
      measureHeights();
      detectKeyboard();
    }, 300);
  }

  /**
   * Setup all event listeners
   */
  function setupEventListeners() {
    dom.messageInput.addEventListener("focus", handleInputFocus, { passive: true });
    dom.messageInput.addEventListener("blur", handleInputBlur, { passive: true });

    window.addEventListener("resize", handleWindowResize, { passive: true });
    window.addEventListener("orientationchange", handleOrientationChange, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        "resize",
        () => {
          detectKeyboard();
          updateCSSVariables();
          if (state.keyboardOpen) {
            adjustLayout();
            eliminateGap();
          }
        },
        { passive: true }
      );
    }

    let lastTouchTime = 0;
    document.addEventListener(
      "touchstart",
      (e) => {
        const now = Date.now();
        if (now - lastTouchTime < 300) {
          e.preventDefault();
        }
        lastTouchTime = now;
      },
      { passive: true }
    );

    log("✓ Event listeners attached");
  }

  /**
   * Use ResizeObserver to watch element size changes
   */
  function setupResizeObserver() {
    if (!window.ResizeObserver) {
      log("ResizeObserver not supported, skipping");
      return;
    }

    observers.resize = new ResizeObserver(() => {
      measureHeights();
      if (state.keyboardOpen) {
        adjustLayout();
      }
    });

    if (dom.header) observers.resize.observe(dom.header);
    if (dom.chatInput) observers.resize.observe(dom.chatInput);

    log("✓ ResizeObserver active");
  }

  /**
   * Main initialization
   */
  function init() {
    log("Initializing keyboard handler...");

    if (!cacheDOM()) {
      log("Elements not ready, retrying in 100ms...");
      setTimeout(init, 100);
      return;
    }

    setupViewportMeta();
    setupCSSVariables();
    preventIOSZoom();
    measureHeights();
    setupEventListeners();
    setupResizeObserver();

    updateCSSVariables();

    log("✅ Keyboard handler ready (optimized for all phones)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.KeyboardHandler = {
    isOpen: () => state.keyboardOpen,
    getKeyboardHeight: () => state.keyboardHeight,
    scrollToBottom: scrollToBottom,
    refresh: () => {
      measureHeights();
      if (state.keyboardOpen) {
        adjustLayout();
      }
    },
  };

  log("✓ Script loaded");
})();
