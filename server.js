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
  socket.userName = "";
  socket.partner = null;
  socket.blockedNames = [];

  function updateOnlineCount() {
    io.emit("onlineCount", io.engine.clientsCount);
  }
  updateOnlineCount();

  function tryFindPartner() {
    if (socket.partner) return;

    for (let i = 0; i < waitingQueue.length; i++) {
      const potentialPartner = waitingQueue[i];
      if (
        potentialPartner.id !== socket.id &&
        !socket.blockedNames.includes(potentialPartner.userName.toLowerCase()) &&
        !potentialPartner.blockedNames.includes(socket.userName.toLowerCase())
      ) {
        socket.partner = potentialPartner;
        potentialPartner.partner = socket;

        waitingQueue.splice(i, 1);
        waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);

        socket.emit("partnerFound", { name: potentialPartner.userName });
        potentialPartner.emit("partnerFound", { name: socket.userName });
        return;
      }
    }
    
    if (!waitingQueue.includes(socket)) {
      waitingQueue.push(socket);
    }
    socket.emit("waitingForPartner");
  }

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

  socket.on("findPartner", () => {
    tryFindPartner();
  });

  socket.on("next", () => {
    if (socket.partner) {
      const oldPartner = socket.partner;
      socket.partner = null;
      oldPartner.partner = null;
      oldPartner.emit("partnerDisconnected", { name: socket.userName });
      
      if (!waitingQueue.includes(oldPartner)) {
        waitingQueue.push(oldPartner);
      }
      // Re-evaluate queue for the old partner
      const tempQueue = [...waitingQueue];
      for(let s of tempQueue) {
         if(!s.partner) { /* emit logic handled inside their tryFindPartner normally, just trigger it */
             // It's easier to just let them sit in queue or trigger a global check
         }
      }
    }
    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    tryFindPartner();
  });

  // ── MESSAGING & REACTIONS ────────────────────────────────────
  socket.on("message", (msgObj) => {
    if (socket.partner) {
      socket.partner.emit("message", msgObj);
    }
  });

  socket.on("reactMessage", (data) => {
    if (socket.partner) {
      socket.partner.emit("reactMessage", data);
    }
  });

  // ── BLOCK & DISCONNECT ───────────────────────────────────────
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

  socket.on("disconnect", () => {
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
  console.log(`Server listening on port ${PORT}`);
});
