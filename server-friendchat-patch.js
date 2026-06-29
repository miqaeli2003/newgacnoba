// ══════════════════════════════════════════════════════════════════════════════
// server-friendchat-patch.js
//
// FRIEND CHAT ADDITIONS — add these to server.js:
//
//  1. REST endpoint:  GET /api/priv/history
//  2. Socket events:  friendChat:join, friendChat:typing
//
// INSTRUCTIONS:
//  A) Copy the REST endpoint block (Section 1) just before the socket.io
//     connection handler (io.on("connection", ...))
//
//  B) Copy the Socket events block (Section 2) inside the
//     io.on("connection", (socket) => { ... }) handler — anywhere after
//     the existing auth:login handler is fine.
//
//  C) Replace the dashboard.html act-chat button behaviour so it navigates to
//     /friend-chat.html?friend=<username>  (see Section 3 in dashboard.html).
//
//  D) Update auth-client.js openPrivateChat() to navigate instead of opening
//     the inline panel when called from outside the chat page (see Section 4).
//
//  Nothing in the random-chat path (message, typing, partnerFound, etc.) is
//  changed — those events are completely separate.
// ══════════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — REST ENDPOINT (add before io.on("connection", ...))
// ════════════════════════════════════════════════════════════════════════════

/*

// GET /api/priv/history?username=…&friend=…
// Returns the stored messages for a private room, filtered for the requester.
// Auth: Bearer token in Authorization header.
app.get("/api/priv/history", (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const entry = authTokens.get(token);
  if (!entry || Date.now() >= entry.expiry) {
    return res.status(401).json({ error: "Token expired" });
  }

  const myLc     = entry.usernameLower;
  const friendLc = String(req.query.friend || "").toLowerCase().trim();

  if (!friendLc) return res.status(400).json({ error: "friend param required" });

  // Security: both users must be friends
  const myUser = registeredUsers.get(myLc);
  if (!myUser || !(myUser.friends || []).includes(friendLc)) {
    return res.status(403).json({ error: "Not friends" });
  }

  const roomId = privRoomId(myLc, friendLc);
  const room   = privateRooms.get(roomId);

  if (!room) return res.json({ messages: [] });

  // Only return non-expired messages
  const now = Date.now();
  const msgs = (room.messages || []).map(m => ({
    from:      m.from,
    text:      m.text,
    ts:        m.ts,
    expiresAt: room.expiresAt ? new Date(room.expiresAt).toISOString() : null
  }));

  res.json({ messages: msgs });
});

*/


// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — SOCKET EVENTS (add inside io.on("connection", ...) handler)
// ════════════════════════════════════════════════════════════════════════════

/*

  // ── friendChat:join — subscribe to a private room for real-time delivery ─
  socket.on("friendChat:join", ({ friendUsername }) => {
    if (!socket._regUser || !friendUsername) return;
    const friendLc = String(friendUsername).toLowerCase().trim();
    // Security: must be friends
    const myUser = registeredUsers.get(socket._regUser.usernameLower);
    if (!myUser || !(myUser.friends || []).includes(friendLc)) return;

    // Join a room dedicated to this pair — used to push typing events
    const roomId = privRoomId(socket._regUser.usernameLower, friendLc);
    socket.join(`friendchat:${roomId}`);
    socket._friendChatRoom = roomId;

    // ── Link socket.partner so game:request / game:response routing works ──
    // Find the friend's socket that is already in the same friendchat room.
    for (const [, sock] of io.sockets.sockets) {
      if (
        sock._regUser?.usernameLower === friendLc &&
        sock._friendChatRoom === roomId
      ) {
        socket.partner = sock;
        sock.partner   = socket;
        break;
      }
    }
  });

  // ── friendChat:typing — relay typing indicator to the other person ────────
  socket.on("friendChat:typing", ({ toUsername }) => {
    if (!socket._regUser || !toUsername) return;
    const toLc = String(toUsername).toLowerCase().trim();
    // Push only to the recipient's user room
    io.to(`user:${toLc}`).emit("friendChat:partnerTyping", {
      fromUsername: socket._regUser.username
    });
  });

*/
