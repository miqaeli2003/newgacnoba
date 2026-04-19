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

  const updateOnlineCount = () => io.emit("onlineCount", io.engine.clientsCount);
  updateOnlineCount();

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
    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    socket.userName = trimmed;
    activeUsernames.add(trimmed.toLowerCase());
    socket.emit("nameAccepted", trimmed);
  });

  const tryFindPartner = () => {
    waitingQueue = waitingQueue.filter(s => s.connected && !s.partner && s.userName);
    const idx = waitingQueue.findIndex(s => 
      s.id !== socket.id && !socket.blockedNames.includes(s.userName.toLowerCase()) && 
      !s.blockedNames.includes(socket.userName.toLowerCase())
    );

    if (idx !== -1) {
      const partnerSocket = waitingQueue.splice(idx, 1)[0];
      waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
      socket.partner = partnerSocket;
      partnerSocket.partner = socket;
      socket.emit("partnerFound", { name: partnerSocket.userName });
      partnerSocket.emit("partnerFound", { name: socket.userName });
    } else {
      if (!waitingQueue.find(s => s.id === socket.id)) waitingQueue.push(socket);
      socket.emit("waitingForPartner");
    }
  };

  socket.on("findPartner", tryFindPartner);
  socket.on("message", (msg) => {
    if (socket.partner) socket.partner.emit("message", { text: msg });
  });

  socket.on("next", () => {
    if (socket.partner) {
      const oldPartner = socket.partner;
      socket.partner = null;
      oldPartner.partner = null;
      oldPartner.emit("partnerDisconnected", { name: socket.userName });
    }
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    tryFindPartner();
  });

  socket.on("blockUser", () => {
    if (!socket.partner) return;
    const blockedName = socket.partner.userName.toLowerCase();
    if (!socket.blockedNames.includes(blockedName)) socket.blockedNames.push(blockedName);
    const oldPartner = socket.partner;
    socket.partner = null;
    oldPartner.partner = null;
    oldPartner.emit("partnerDisconnected", { name: socket.userName });
    socket.emit("userBlocked", { name: oldPartner.userName });
    tryFindPartner();
  });

  socket.on("disconnect", () => {
    if (socket.userName) activeUsernames.delete(socket.userName.toLowerCase());
    if (socket.partner) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName });
      socket.partner.partner = null;
    }
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    updateOnlineCount();
  });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
