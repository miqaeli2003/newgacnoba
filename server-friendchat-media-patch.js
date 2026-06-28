// ══════════════════════════════════════════════════════════════════════════════
// server-friendchat-media-patch.js
//
// Add INSIDE io.on("connection", (socket) => { ... }) block, after the
// existing friendChat:join and friendChat:typing handlers.
//
// Adds: photo sending and GIF sending between friends.
// ══════════════════════════════════════════════════════════════════════════════

  // ── friendChat:photo — relay a photo (base64 dataUrl) to friend ───────────
  socket.on("friendChat:photo", ({ toUsername, dataUrl }) => {
    if (!socket._regUser || !toUsername || !dataUrl) return;

    const toLc   = String(toUsername).toLowerCase().trim();
    const myUser = registeredUsers.get(socket._regUser.usernameLower);

    // Security: must be friends
    if (!myUser || !(myUser.friends || []).includes(toLc)) return;

    // Relay to recipient's user room
    io.to(`user:${toLc}`).emit("friendChat:photo", {
      fromUsername: socket._regUser.username,
      dataUrl:      dataUrl,
      timestamp:    new Date().toISOString()
    });
  });

  // ── friendChat:gif — relay a GIF URL to friend ────────────────────────────
  socket.on("friendChat:gif", ({ toUsername, url }) => {
    if (!socket._regUser || !toUsername || !url) return;

    const toLc   = String(toUsername).toLowerCase().trim();
    const myUser = registeredUsers.get(socket._regUser.usernameLower);

    // Security: must be friends
    if (!myUser || !(myUser.friends || []).includes(toLc)) return;

    // Relay to recipient's user room
    io.to(`user:${toLc}`).emit("friendChat:gif", {
      fromUsername: socket._regUser.username,
      url:          url,
      timestamp:    new Date().toISOString()
    });
  });

// ══════════════════════════════════════════════════════════════════════════════
// NOTE: The game events (game:request, game:response, game:move etc.) from
// server-games-patch.js already work for friend chats too since they use
// socket.partner for random chats. For friend chats, the game invite/response
// flow needs the server to route by username instead of socket.partner.
//
// Add this ADDITIONAL handler inside io.on("connection", ...) to support
// friend-based game requests (alongside the existing random-chat game logic):
// ══════════════════════════════════════════════════════════════════════════════

  // ── game:request (friend chat version — sends invite to specific user) ────
  // The existing game:request in server-games-patch.js sends to socket.partner
  // (random chat partner). For friend chat, the client sends game:request
  // the same way BUT the server needs to know who the "partner" is.
  //
  // The simplest integration: when the socket is in a friendChat room,
  // treat the other person in that room as the game partner.
  //
  // The existing server-games-patch.js game events will work AS-IS because:
  //  - game:invite is sent to socket.partner
  //  - In friend-chat.html the socket joins a friendchat room via friendChat:join
  //  - The server sets socket.partner to the friend's socket when both are in room
  //
  // If your server-games-patch.js uses socket.partner directly, you may need
  // to set socket.partner when both users join the same friendchat room.
  // Add this inside the friendChat:join handler (in server-friendchat-patch.js):
  //
  //   // Find the friend's socket and set as partners
  //   for (const [, sock] of io.sockets.sockets) {
  //     if (sock._regUser?.usernameLower === friendLc &&
  //         sock._friendChatRoom === roomId) {
  //       socket.partner = sock;
  //       sock.partner   = socket;
  //       break;
  //     }
  //   }
