const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let waitingQueue = [];

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.userName = "";
  socket.partner = null;

  function updateOnlineCount() {
    io.emit("onlineCount", io.engine.clientsCount);
  }
  updateOnlineCount();

  socket.on("setName", (name) => {
    socket.userName = name;
  });

  socket.on("findPartner", () => {
    if (socket.partner) return;

    waitingQueue = waitingQueue.filter(
      (s) => s.connected && !s.partner && s.userName
    );

    const partnerIndex = waitingQueue.findIndex(
      (s) => s.id !== socket.id && s.connected && !s.partner && s.userName
    );

    if (partnerIndex !== -1) {
      const partnerSocket = waitingQueue.splice(partnerIndex, 1)[0];
      waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);

      socket.partner = partnerSocket;
      partnerSocket.partner = socket;

      socket.emit("partnerFound", { name: partnerSocket.userName });
      partnerSocket.emit("partnerFound", { name: socket.userName });
    } else {
      if (!waitingQueue.includes(socket)) {
        waitingQueue.push(socket);
      }
      socket.emit("waitingForPartner");
    }
  });

  socket.on("message", (msg) => {
    if (socket.partner) {
      socket.partner.emit("message", { text: msg });
    }
  });

  socket.on("next", () => {
    // Inform current partner they were disconnected, but do NOT clear their chat
    if (socket.partner) {
      const oldPartner = socket.partner;

      // Disconnect both
      socket.partner = null;

      oldPartner.partner = null;
      oldPartner.emit("partnerDisconnected", { name: socket.userName });

      // Put old partner back in queue to find new partner only when THEY press next
      if (oldPartner.connected && !waitingQueue.includes(oldPartner)) {
        // Do NOT push oldPartner automatically here!
        // This is important: old partner stays where they are until they press next.
        // So **DO NOT** add oldPartner back here.
        // They stay disconnected until their next press.
      }
    }

    // Remove self from queue and add self again for new partner search
    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    if (!waitingQueue.includes(socket)) {
      waitingQueue.push(socket);
    }

    // Try find partner for self
    waitingQueue = waitingQueue.filter(
      (s) => s.connected && !s.partner && s.userName
    );

    const partnerIndex = waitingQueue.findIndex(
      (s) => s.id !== socket.id && s.connected && !s.partner && s.userName
    );

    if (partnerIndex !== -1) {
      const partnerSocket = waitingQueue.splice(partnerIndex, 1)[0];
      waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);

      socket.partner = partnerSocket;
      partnerSocket.partner = socket;

      socket.emit("partnerFound", { name: partnerSocket.userName });
      partnerSocket.emit("partnerFound", { name: socket.userName });
    } else {
      socket.emit("waitingForPartner");
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

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
