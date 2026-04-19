const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let waitingQueue = [];
const activeNames = new Set();

io.on("connection", (socket) => {
  socket.userName = "";
  socket.partner = null;
  socket.blocked = [];

  const updateCount = () => io.emit("onlineCount", io.engine.clientsCount);
  updateCount();

  socket.on("setName", (name) => {
    const n = (name || "").trim().substring(0, 15);
    if (!n || activeNames.has(n.toLowerCase())) return socket.emit("nameTaken");
    if (socket.userName) activeNames.delete(socket.userName.toLowerCase());
    socket.userName = n;
    activeNames.add(n.toLowerCase());
    socket.emit("nameAccepted", n);
  });

  socket.on("findPartner", () => {
    for (let i = 0; i < waitingQueue.length; i++) {
      const p = waitingQueue[i];
      if (p.id !== socket.id && !socket.blocked.includes(p.userName.toLowerCase())) {
        socket.partner = p; p.partner = socket;
        waitingQueue.splice(i, 1);
        socket.emit("partnerFound", { name: p.userName });
        p.emit("partnerFound", { name: socket.userName });
        return;
      }
    }
    if (!waitingQueue.includes(socket)) waitingQueue.push(socket);
    socket.emit("waiting");
  });

  socket.on("message", (data) => {
    if (socket.partner) socket.partner.emit("message", data);
  });

  socket.on("react", (data) => {
    if (socket.partner) socket.partner.emit("react", data);
  });

  socket.on("next", () => {
    if (socket.partner) {
      socket.partner.emit("partnerLeft");
      socket.partner.partner = null;
      socket.partner = null;
    }
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    socket.emit("findPartner");
  });

  socket.on("disconnect", () => {
    if (socket.userName) activeNames.delete(socket.userName.toLowerCase());
    if (socket.partner) {
      socket.partner.emit("partnerLeft");
      socket.partner.partner = null;
    }
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    updateCount();
  });
});

server.listen(3000, () => console.log("Server running on port 3000"));
