const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let waitingQueue = [];
const activeUsernames = new Set();

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.userName = "";
  socket.partner = null;
  socket.blockedNames = [];

  function updateOnlineCount() {
    io.emit("onlineCount", io.engine.clientsCount);
  }
  updateOnlineCount();

  // ── Username Registration ──────────────────────────────────────────────────
  socket.on("setName", (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;

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

  // ── Matchmaking ────────────────────────────────────────────────────────────
  function tryFindPartner() {
    waitingQueue = waitingQueue.filter(
      (s) => s.connected && !s.partner && s.userName
    );

    const idx = waitingQueue.findIndex(
      (s) =>
        s.id !== socket.id &&
        s.connected &&
        !s.partner &&
        s.userName &&
        !socket.blockedNames.includes(s.userName.toLowerCase()) &&
        !s.blockedNames.includes(socket.userName.toLowerCase())
    );

    if (idx !== -1) {
      const partnerSocket = waitingQueue.splice(idx, 1)[0];
      waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);

      socket.partner = partnerSocket;
      partnerSocket.partner = socket;

      socket.emit("partnerFound", { name: partnerSocket.userName });
      partnerSocket.emit("partnerFound", { name: socket.userName });
    } else {
      if (!waitingQueue.find((s) => s.id === socket.id)) {
        waitingQueue.push(socket);
      }
      socket.emit("waitingForPartner");
    }
  }

  socket.on("findPartner", () => {
    if (socket.partner) return;
    tryFindPartner();
  });

  // ── Messaging (supports text, GIF, and reply-to) ───────────────────────────
  socket.on("message", (msg) => {
    if (!socket.partner || typeof msg !== "object" || msg === null) return;

    // Sanitize message fields before forwarding
    const safe = {};

    if (typeof msg.id === "string") {
      safe.id = msg.id.slice(0, 60);
    }

    if (typeof msg.text === "string" && msg.text.trim()) {
      safe.text = msg.text.slice(0, 2000);
    }

    if (typeof msg.gifUrl === "string" && msg.gifUrl.startsWith("https://")) {
      // Only allow Tenor GIF URLs
      if (msg.gifUrl.includes("tenor.com") || msg.gifUrl.includes("tenorapi.com")) {
        safe.gifUrl = msg.gifUrl.slice(0, 600);
      }
    }

    if (msg.replyTo && typeof msg.replyTo === "object") {
      const rt = {};
      if (typeof msg.replyTo.id === "string")     rt.id     = msg.replyTo.id.slice(0, 60);
      if (typeof msg.replyTo.text === "string")   rt.text   = msg.replyTo.text.slice(0, 200);
      if (typeof msg.replyTo.gifUrl === "string") rt.gifUrl = msg.replyTo.gifUrl.slice(0, 600);
      safe.replyTo = rt;
    }

    // Must have at least one content field
    if (!safe.text && !safe.gifUrl) return;

    socket.partner.emit("message", safe);
  });

  // ── Reactions ──────────────────────────────────────────────────────────────
  // When a user reacts to a message, forward the reaction to their partner.
  // messageId matches the ID on the partner's side (set by the original sender).
  socket.on("reaction", (data) => {
    if (!socket.partner || typeof data !== "object" || data === null) return;

    const safe = {
      messageId: typeof data.messageId === "string" ? data.messageId.slice(0, 60) : "",
      emoji:     data.emoji === null ? null
                   : (typeof data.emoji === "string" ? data.emoji.slice(0, 10) : null)
    };

    if (!safe.messageId) return;

    socket.partner.emit("reaction", safe);
  });

  // ── Next ───────────────────────────────────────────────────────────────────
  socket.on("next", () => {
    if (socket.partner) {
      const oldPartner = socket.partner;
      socket.partner = null;
      oldPartner.partner = null;
      oldPartner.emit("partnerDisconnected", { name: socket.userName });
    }

    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    tryFindPartner();
  });

  // ── Block ──────────────────────────────────────────────────────────────────
  socket.on("blockUser", () => {
    if (!socket.partner) return;

    const blockedName        = socket.partner.userName.toLowerCase();
    const blockedDisplayName = socket.partner.userName;

    if (!socket.blockedNames.includes(blockedName)) {
      socket.blockedNames.push(blockedName);
    }

    const oldPartner = socket.partner;
    socket.partner = null;
    oldPartner.partner = null;
    oldPartner.emit("partnerDisconnected", { name: socket.userName });

    socket.emit("userBlocked", { name: blockedDisplayName });

    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    tryFindPartner();
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
