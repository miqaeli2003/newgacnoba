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

  const updateCount = () => io.emit("onlineCount", io.engine.clientsCount);
  updateCount();

  socket.on("setName", (name) => {
    const n = (name || "").trim();
    if (!n || activeUsernames.has(n.toLowerCase())) return socket.emit("nameTaken");
    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    socket.userName = n;
    activeUsernames.add(n.toLowerCase());
    socket.emit("nameAccepted", n);
  });

  const tryMatch = () => {
    waitingQueue = waitingQueue.filter(s => s.connected && !s.partner && s.userName);
    const idx = waitingQueue.findIndex(s => 
      s.id !== socket.id && 
      !socket.blockedNames.includes(s.userName.toLowerCase()) &&
      !s.blockedNames.includes(socket.userName.toLowerCase())
    );

    if (idx !== -1) {
      const p = waitingQueue.splice(idx, 1)[0];
      socket.partner = p; p.partner = socket;
      socket.emit("partnerFound", { name: p.userName });
      p.emit("partnerFound", { name: socket.userName });
    } else {
      if (!waitingQueue.includes(socket)) waitingQueue.push(socket);
      socket.emit("waitingForPartner");
    }
  };

  socket.on("findPartner", tryMatch);

  socket.on("message", (data) => {
    if (socket.partner) socket.partner.emit("message", data);
  });

  socket.on("addReaction", (data) => {
    if (socket.partner) {
      socket.partner.emit("reactionAdded", data);
      socket.emit("reactionAdded", data);
    }
  });

  socket.on("next", () => {
    if (socket.partner) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName });
      socket.partner.partner = null;
      socket.partner = null;
    }
    tryMatch();
  });

  socket.on("blockUser", () => {
    if (!socket.partner) return;
    socket.blockedNames.push(socket.partner.userName.toLowerCase());
    const p = socket.partner;
    socket.partner = null; p.partner = null;
    p.emit("partnerDisconnected", { name: socket.userName });
    tryMatch();
  });

  socket.on("disconnect", () => {
    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    if (socket.partner) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName });
      socket.partner.partner = null;
    }
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    updateCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
