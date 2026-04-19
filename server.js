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

  // ── Messaging ──────────────────────────────────────────────────────────────
  // Support both old string format and new { text, messageId } format
  socket.on("message", (msg) => {
    if (!socket.partner) return;
    if (typeof msg === "string") {
      socket.partner.emit("message", { text: msg });
    } else {
      socket.partner.emit("message", { text: msg.text, messageId: msg.messageId });
    }
  });

  // ── Reactions ──────────────────────────────────────────────────────────────
  // Partner A reacts to a message sent by Partner B.
  // We forward to Partner B so they can display the reaction under their own message.
  socket.on("react", ({ messageId, emoji }) => {
    if (socket.partner) {
      socket.partner.emit("reacted", { messageId, emoji });
    }
  });

  // ── Gifts ──────────────────────────────────────────────────────────────────
  socket.on("gift", (data) => {
    if (socket.partner) {
      socket.partner.emit("gift", {
        id: data.id,
        emoji: data.emoji,
        name: data.name,
      });
    }
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

    const blockedName = socket.partner.userName.toLowerCase();
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
