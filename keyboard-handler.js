/**
 * ═════════════════════════════════════════════════════════════════════════════
 * KEYBOARD HANDLER — Context-Aware & Optimized for Multi-Input Systems
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * ✅ FIXES:
 * ✓ Prevents layout breaking when typing names, passwords, or searching GIFs
 * ✓ Natively handles Main Chat, Private Chat, GIF Picker, and Entry Modals
 * ✓ Guarantees a strict 2px gap between the messages and the active keyboard input row
 * ✓ Uses VisualViewport API to completely eliminate rendering overlap bugs on iOS & Android
 * ✓ Prevents iOS auto-zoom on input focus
 * 
 * Usage: Replace the contents of keyboard-handler.js completely.
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
   * Cache critical DOM elements dynamically
   */
  function cacheDOM() {
    dom.chatContainer = document.querySelector(".chat-container");
    dom.chatInput = document.querySelector(".chat-input");
    dom.header = document.querySelector(".top-bar") || document.querySelector("header") || document.querySelector(".header");

    return !!(dom.chatContainer && dom.chatInput);
  }

  /**
   * Setup viewport meta tag for proper mobile scaling bounds
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
  }

  /**
   * Prevent iOS auto-zoom on input elements (Forces minimum font rendering safety)
   */
  function preventIOSZoom() {
    const inputs = document.querySelectorAll("input, textarea");
    inputs.forEach(el => {
      const currentSize = parseFloat(getComputedStyle(el).fontSize);
      if (currentSize < 16) {
        el.style.fontSize = "16px";
      }
    });
  }

  /**
   * Update internal measurements safely
   */
  function measureHeights() {
    if (dom.header) {
      state.headerHeight = Math.ceil(dom.header.getBoundingClientRect().height);
    }
    if (dom.chatInput) {
      state.inputHeight = Math.ceil(dom.chatInput.getBoundingClientRect().height);
    }
  }

  /**
   * Detect keyboard presence reliably using visual viewport bounds
   */
  function detectKeyboard() {
    const isIOSKeyboard = window.visualViewport && (window.innerHeight - window.visualViewport.height > 100);
    const isAndroidKeyboard = (state.lastViewportHeight - window.innerHeight > 100);
    
    const isKeyboardOpen = isIOSKeyboard || isAndroidKeyboard;

    if (isKeyboardOpen && !state.keyboardOpen) {
      state.keyboardOpen = true;
      document.body.classList.add("keyboard-open");
      log("✓ Keyboard OPENED");
      adjustLayout();
      setTimeout(scrollToBottom, 50);
    } else if (!isKeyboardOpen && state.keyboardOpen) {
      state.keyboardOpen = false;
      document.body.classList.remove("keyboard-open");
      log("✓ Keyboard CLOSED");
      restoreLayout();
    } else if (state.keyboardOpen) {
      adjustLayout();
    }

    if (!isKeyboardOpen) {
      state.lastViewportHeight = window.innerHeight;
    }
  }

  /**
   * Core Context Engine: Adjusts layouts only for the specific input focused
   */
  function adjustLayout() {
    const activeEl = document.activeElement;
    if (!activeEl) return;

    // Standard baseline definitions
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const bottomOffset = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0;
    const GAP = 2; // Exact strict 2px spacing specification

    // ── CONTEXT 1: MAIN CHAT BOX ──
    if (activeEl.id === "messageInput") {
      if (!dom.chatContainer || !dom.chatInput) return;

      const headerHeight = dom.header ? dom.header.getBoundingClientRect().height : state.headerHeight;
      const inputHeight = dom.chatInput.getBoundingClientRect().height || state.inputHeight;

      dom.chatInput.style.position = "fixed";
      dom.chatInput.style.bottom = `${bottomOffset}px`;
      dom.chatInput.style.left = "0";
      dom.chatInput.style.right = "0";
      dom.chatInput.style.zIndex = "9999";
      dom.chatInput.style.transform = "translateZ(0)";
      dom.chatInput.style.width = "100%";

      const availableHeight = viewportHeight - headerHeight - inputHeight - GAP;
      dom.chatContainer.style.position = "relative";
      dom.chatContainer.style.height = `${Math.max(0, availableHeight)}px`;
      dom.chatContainer.style.marginBottom = `${GAP}px`;
      dom.chatContainer.style.overflowY = "auto";
      dom.chatContainer.style.flexShrink = "0";
      return;
    }

    // ── CONTEXT 2: PRIVATE CHAT BOX ──
    if (activeEl.id === "priv-input") {
      const privPanel = document.getElementById("priv-panel");
      const privMessages = document.getElementById("priv-messages");
      const privInputRow = document.querySelector(".pc-input-row");
      const privHeader = document.querySelector(".pc-header");

      if (!privMessages || !privInputRow) return;

      // Ensure main chat styles are cleared out of the way
      resetMainChatStyles();

      privInputRow.style.position = "fixed";
      privInputRow.style.bottom = `${bottomOffset}px`;
      privInputRow.style.left = "0";
      privInputRow.style.right = "0";
      privInputRow.style.zIndex = "9999";

      const headerHeight = privHeader ? privHeader.getBoundingClientRect().height : 45;
      const inputHeight = privInputRow.getBoundingClientRect().height;

      const availableHeight = viewportHeight - headerHeight - inputHeight - GAP;
      privMessages.style.height = `${Math.max(0, availableHeight)}px`;
      privMessages.style.marginBottom = `${GAP}px`;
      privMessages.style.overflowY = "auto";
      return;
    }

    // ── CONTEXT 3: GIF PICKER PANEL ──
    if (activeEl.id === "gifSearch") {
      const gifPicker = document.getElementById("gifPicker");
      const gifResults = document.getElementById("gifResults");
      const gifHeader = document.querySelector(".gif-picker-header");

      if (!gifPicker || !gifResults || !gifHeader) return;

      resetMainChatStyles();

      gifPicker.style.position = "fixed";
      gifPicker.style.bottom = `${bottomOffset}px`;
      gifPicker.style.zIndex = "9999";

      const headerHeight = gifHeader.getBoundingClientRect().height;
      const availableHeight = viewportHeight - headerHeight - GAP;
      gifResults.style.height = `${Math.max(0, availableHeight)}px`;
      gifResults.style.marginBottom = `${GAP}px`;
      return;
    }

    // ── CONTEXT 4: NAME/AUTH MODALS ──
    if (activeEl.id === "nameInput" || activeEl.id === "bioInput" || 
        activeEl.id.startsWith("login-") || activeEl.id.startsWith("signup-")) {
      
      // Completely step away from chat views so modal interface operates safely
      resetMainChatStyles();

      const modalContent = activeEl.closest(".modal-content") || activeEl.closest(".bio-popup-content");
      if (modalContent && modalContent.parentElement) {
        modalContent.parentElement.style.overflowY = "auto";
        modalContent.parentElement.style.zIndex = "10000";
      }
    }
  }

  /**
   * Safe Reset utility specialized for Main Chat components
   */
  function resetMainChatStyles() {
    if (dom.chatInput) {
      dom.chatInput.style.position = "";
      dom.chatInput.style.bottom = "";
      dom.chatInput.style.left = "";
      dom.chatInput.style.right = "";
      dom.chatInput.style.zIndex = "";
      dom.chatInput.style.transform = "";
      dom.chatInput.style.width = "";
    }
    if (dom.chatContainer) {
      dom.chatContainer.style.height = "";
      dom.chatContainer.style.marginBottom = "";
      dom.chatContainer.style.position = "";
      dom.chatContainer.style.overflowY = "";
      dom.chatContainer.style.flexShrink = "";
    }
  }

  /**
   * Reset function to return ALL view components back to standard stylesheet norms
   */
  function restoreLayout() {
    resetMainChatStyles();

    // Reset Private Chat Components
    const privMessages = document.getElementById("priv-messages");
    const privInputRow = document.querySelector(".pc-input-row");
    if (privInputRow) {
      privInputRow.style.position = "";
      privInputRow.style.bottom = "";
      privInputRow.style.left = "";
      privInputRow.style.right = "";
      privInputRow.style.zIndex = "";
    }
    if (privMessages) {
      privMessages.style.height = "";
      privMessages.style.marginBottom = "";
    }

    // Reset GIF Components
    const gifPicker = document.getElementById("gifPicker");
    const gifResults = document.getElementById("gifResults");
    if (gifPicker) {
      gifPicker.style.position = "";
      gifPicker.style.bottom = "";
      gifPicker.style.zIndex = "";
    }
    if (gifResults) {
      gifResults.style.height = "";
      gifResults.style.marginBottom = "";
    }
  }

  /**
   * Scroll chat view down
   */
  function scrollToBottom() {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.id === "priv-input") {
      const privMessages = document.getElementById("priv-messages");
      if (privMessages) privMessages.scrollTop = privMessages.scrollHeight;
    } else if (dom.chatContainer) {
      dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
    }
  }

  /**
   * Global event routing structure via event delegation hooks
   */
  function setupEventListeners() {
    // Listens cleanly across all inputs/textareas dynamically
    document.addEventListener("focusin", (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") {
        preventIOSZoom();
        setTimeout(() => {
          detectKeyboard();
          if (state.keyboardOpen) adjustLayout();
        }, 60);
      }
    }, { passive: true });

    document.addEventListener("focusout", (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") {
        setTimeout(() => {
          if (!document.activeElement || (document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA")) {
            detectKeyboard();
          }
        }, 60);
      }
    }, { passive: true });

    window.addEventListener("resize", () => {
      measureHeights();
      detectKeyboard();
    }, { passive: true });

    window.addEventListener("orientationchange", () => {
      state.lastViewportHeight = window.innerHeight;
      setTimeout(() => {
        measureHeights();
        detectKeyboard();
      }, 300);
    }, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        detectKeyboard();
        if (state.keyboardOpen) {
          adjustLayout();
        }
      }, { passive: true });
    }
  }

  /**
   * Use ResizeObserver to track layout changes smoothly
   */
  function setupResizeObserver() {
    if (!window.ResizeObserver) return;

    observers.resize = new ResizeObserver(() => {
      measureHeights();
      if (state.keyboardOpen) adjustLayout();
    });

    if (dom.header) observers.resize.observe(dom.header);
    if (dom.chatInput) observers.resize.observe(dom.chatInput);
  }

  /**
   * Initialization Sequence
   */
  function init() {
    if (!cacheDOM()) {
      setTimeout(init, 100);
      return;
    }

    setupViewportMeta();
    preventIOSZoom();
    measureHeights();
    setupEventListeners();
    setupResizeObserver();

    log("✅ Advanced Context Keyboard Handler Ready.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Public Interface exposure
  window.KeyboardHandler = {
    isOpen: () => state.keyboardOpen,
    scrollToBottom: scrollToBottom,
    refresh: () => {
      measureHeights();
      if (state.keyboardOpen) adjustLayout();
    },
  };
})();
