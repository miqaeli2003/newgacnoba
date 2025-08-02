const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let users = [];
let waitingQueue = [];

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.userName = "";
  socket.partner = null;

  // Update online count helper
  function updateOnlineCount() {
    io.emit("onlineCount", io.engine.clientsCount);
  }
  updateOnlineCount();

  socket.on("setName", (name) => {
    socket.userName = name;
  });

  socket.on("findPartner", () => {
    if (socket.partner) return; // already connected

    // If waitingQueue has someone, pair them
    if (waitingQueue.length > 0) {
      const partnerSocket = waitingQueue.shift();
      if (partnerSocket.id === socket.id) return;

      // Pair both
      socket.partner = partnerSocket;
      partnerSocket.partner = socket;

      socket.emit("partnerFound", { name: partnerSocket.userName });
      partnerSocket.emit("partnerFound", { name: socket.userName });
    } else {
      // Add this socket to waiting queue
      waitingQueue.push(socket);
      socket.emit("waitingForPartner");
    }
  });

  socket.on("message", (msg) => {
    if (socket.partner) {
      socket.partner.emit("message", { text: msg });
    }
  });

  socket.on("next", () => {
    if (socket.partner) {
      socket.partner.emit("partnerDisconnected");
      socket.partner.partner = null;
      socket.partner = null;
    }
    // Remove from queue if waiting
    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    socket.emit("readyForNewPartner");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
    // Inform partner
    if (socket.partner) {
      socket.partner.emit("partnerDisconnected");
      socket.partner.partner = null;
    }
    // Remove from waiting queue if exists
    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    updateOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
