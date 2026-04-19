const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let waitingQueue = [];
const activeUsernames = new Set(); // tracks currently used usernames (lowercase)

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.userName = "";
  socket.partner = null;
  socket.blockedNames = []; // usernames this socket has blocked (lowercase, session-only)

  function updateOnlineCount() {
    io.emit("onlineCount", io.engine.clientsCount);
  }
  updateOnlineCount();

  // ── Username Registration ──────────────────────────────────────────────────
  socket.on("setName", (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;

    // Allow re-registering the exact same name (e.g. "Change Name" no-op)
    if (socket.userName.toLowerCase() === trimmed.toLowerCase()) {
      socket.emit("nameAccepted", socket.userName);
      return;
    }

    // Reject if taken by someone else
    if (activeUsernames.has(trimmed.toLowerCase())) {
      socket.emit("nameTaken");
      return;
    }

    // Release the old username slot
    if (socket.userName) {
      activeUsernames.delete(socket.userName.toLowerCase());
    }

    socket.userName = trimmed;
    activeUsernames.add(trimmed.toLowerCase());
    socket.emit("nameAccepted", trimmed);
  });

  // ── Matchmaking helper ─────────────────────────────────────────────────────
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
      // Also remove self from queue
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
  socket.on("message", (msg) => {
    if (socket.partner) {
      socket.partner.emit("message", { text: msg });
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

    // Immediately search for a new partner
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
