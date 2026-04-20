const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Tune ping/pong so stale connections are detected faster
  pingTimeout: 20000,
  pingInterval: 25000,
});

app.use(express.static(path.join(__dirname)));

let waitingQueue = [];
const activeUsernames = new Set();

// ── Validation constants ────────────────────────────────────────────────────
const NAME_MIN = 2;
const NAME_MAX = 20;
const MSG_MAX  = 2000;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Broadcast the current connected-client count to everyone. */
function updateOnlineCount() {
  io.emit("onlineCount", io.engine.clientsCount);
}

/** Remove disconnected / already-paired sockets from the waiting queue. */
function cleanQueue() {
  waitingQueue = waitingQueue.filter((s) => s.connected && !s.partner && s.userName);
}

// ── Socket handlers ─────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.userName          = "";
  socket.partner           = null;
  socket.blockedNames      = [];
  socket.recentPartnerIds  = new Set();

  updateOnlineCount();

  // ── Username Registration ────────────────────────────────────────────────
  socket.on("setName", (name) => {
    if (typeof name !== "string") return;
    const trimmed = name.trim();

    // Server-side validation (mirrors client rules)
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return;

    // No-op if name is unchanged (case-insensitive)
    if (socket.userName.toLowerCase() === trimmed.toLowerCase()) {
      socket.emit("nameAccepted", socket.userName);
      return;
    }

    if (activeUsernames.has(trimmed.toLowerCase())) {
      socket.emit("nameTaken");
      return;
    }

    if (socket.userName) {
      activeUsernames.delete(socket.userName.toLowerCase());
    }

    socket.userName = trimmed;
    activeUsernames.add(trimmed.toLowerCase());
    socket.emit("nameAccepted", trimmed);
  });

  // ── Matchmaking ──────────────────────────────────────────────────────────
  function tryFindPartner() {
    if (!socket.userName) return;

    cleanQueue();

    const idx = waitingQueue.findIndex(
      (s) =>
        s.id !== socket.id &&
        !socket.recentPartnerIds.has(s.id) &&
        !s.recentPartnerIds.has(socket.id) &&
        !socket.blockedNames.includes(s.userName.toLowerCase()) &&
        !s.blockedNames.includes(socket.userName.toLowerCase())
    );

    if (idx !== -1) {
      const partnerSocket = waitingQueue.splice(idx, 1)[0];
      // Also remove self from queue in case we slipped in
      waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);

      socket.partner        = partnerSocket;
      partnerSocket.partner = socket;

      socket.emit("partnerFound",        { name: partnerSocket.userName });
      partnerSocket.emit("partnerFound", { name: socket.userName });
    } else {
      if (!waitingQueue.some((s) => s.id === socket.id)) {
        waitingQueue.push(socket);
      }
      socket.emit("waitingForPartner");
    }
  }

  socket.on("findPartner", () => {
    if (!socket.userName || socket.partner) return;
    tryFindPartner();
  });

  // ── Messaging ────────────────────────────────────────────────────────────
  socket.on("message", (msg) => {
    if (!socket.partner) return;

    if (typeof msg === "string") {
      // Legacy plain-string path — truncate for safety
      const text = msg.slice(0, MSG_MAX);
      socket.partner.emit("message", { text });
    } else if (msg && typeof msg.text === "string") {
      const text = msg.text.slice(0, MSG_MAX);
      socket.partner.emit("message", { text, messageId: msg.messageId });
    }
  });

  // ── GIF ──────────────────────────────────────────────────────────────────
  socket.on("gif", (data) => {
    if (!socket.partner || typeof data?.url !== "string") return;
    socket.partner.emit("gif", { url: data.url, preview: data.preview });
  });

  // ── Reactions ────────────────────────────────────────────────────────────
  socket.on("react", ({ messageId, emoji }) => {
    if (socket.partner && messageId && emoji) {
      socket.partner.emit("reacted", { messageId, emoji });
    }
  });

  // ── Typing ───────────────────────────────────────────────────────────────
  socket.on("typing", (isTyping) => {
    if (socket.partner) {
      socket.partner.emit("partnerTyping", Boolean(isTyping));
    }
  });

  // ── Next ─────────────────────────────────────────────────────────────────
  socket.on("next", () => {
    if (!socket.userName) return;

    if (socket.partner) {
      const oldPartner   = socket.partner;
      const oldPartnerId = oldPartner.id;

      socket.partner    = null;
      oldPartner.partner = null;
      oldPartner.emit("partnerDisconnected", { name: socket.userName });

      // Prevent immediate re-match for 5 s
      socket.recentPartnerIds.add(oldPartnerId);
      oldPartner.recentPartnerIds.add(socket.id);

      setTimeout(() => {
        socket.recentPartnerIds.delete(oldPartnerId);
        if (oldPartner.connected) {
          oldPartner.recentPartnerIds.delete(socket.id);
        }
      }, 5000);
    }

    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    tryFindPartner();
  });

  // ── Block ────────────────────────────────────────────────────────────────
  socket.on("blockUser", () => {
    if (!socket.partner) return;

    const blockedName        = socket.partner.userName.toLowerCase();
    const blockedDisplayName = socket.partner.userName;

    if (!socket.blockedNames.includes(blockedName)) {
      socket.blockedNames.push(blockedName);
    }

    const oldPartner  = socket.partner;
    socket.partner    = null;
    oldPartner.partner = null;
    oldPartner.emit("partnerDisconnected", { name: socket.userName });

    socket.emit("userBlocked", { name: blockedDisplayName });

    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    tryFindPartner();
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

    if (socket.userName) {
      activeUsernames.delete(socket.userName.toLowerCase());
    }

    if (socket.partner) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName });
      socket.partner.partner = null;
    }

    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    updateOnlineCount();
  });
});

// ── Server start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
