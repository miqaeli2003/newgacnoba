/* ══════════════════════════════════════════════════════════════════════
   server-auth-patch.js  —  GAICANI Auth Extensions
   ────────────────────────────────────────────────────────────────────
   HOW TO INTEGRATE INTO server.js:
   ────────────────────────────────────────────────────────────────────
   Find the second  io.on("connection", (socket) => {  block in server.js
   (around line 2501, where socket._regUser is set up).
   Paste the three socket event handlers below INSIDE that block,
   after the existing handlers.

   No new Maps or top-level variables are needed — it uses the
   registeredUsers / saveAuthUsers / io  that already exist in server.js.
   ══════════════════════════════════════════════════════════════════════ */

  // ── Remove friend ─────────────────────────────────────────────────────────
  //
  // Client emits:  socket.emit("friend:remove", { friendUsername: "Ana" })
  // Server removes both directions, saves, and replies to both sockets.
  //
  socket.on("friend:remove", ({ friendUsername }) => {
    if (!socket._regUser || !friendUsername) return;
    const myLc     = socket._regUser.usernameLower;
    const targetLc = String(friendUsername).toLowerCase().trim();
    if (!targetLc || targetLc === myLc) return;

    const myUser     = registeredUsers.get(myLc);
    const targetUser = registeredUsers.get(targetLc);

    if (!myUser) return;

    // Remove from my friends list
    myUser.friends = (myUser.friends || []).filter(f => f !== targetLc);

    // Remove from their friends list (if they exist)
    if (targetUser) {
      targetUser.friends = (targetUser.friends || []).filter(f => f !== myLc);
    }

    saveAuthUsers();

    // Confirm to the removing user with their updated list
    socket.emit("friend:removed", { friends: myUser.friends });

    // Optionally notify the other party (they can handle this gracefully in the client)
    if (targetUser) {
      io.to(`user:${targetLc}`).emit("friend:removedByOther", {
        byUsername: socket._regUser.username,
      });
    }

    console.log(`[FRIEND] ${myLc} removed ${targetLc}`);
  });

  // ── Session-block a registered user ──────────────────────────────────────
  //
  // This is a soft, in-memory only block. It prevents the matchmaking queue
  // from pairing these two users together for the life of the session.
  // It does NOT persist to disk and is automatically cleared on reconnect.
  //
  // Client emits:  socket.emit("reg:sessionBlock", { targetUsername: "Bob" })
  //
  socket.on("reg:sessionBlock", ({ targetUsername }) => {
    if (!socket._regUser || !targetUsername) return;
    const targetLc = String(targetUsername).toLowerCase().trim();
    if (!targetLc || targetLc === socket._regUser.usernameLower) return;

    // Reuse the existing in-session blockedNames mechanism on the socket.
    // socket.blockedNames is already used by the matchmaking queue to skip pairs.
    if (!socket.blockedNames) socket.blockedNames = [];
    if (!socket.blockedNames.includes(targetLc)) {
      socket.blockedNames.push(targetLc);
    }

    // If they are currently matched, disconnect and prompt re-search
    if (socket.partner && socket.partner.userName &&
        socket.partner.userName.toLowerCase() === targetLc) {
      socket.partner.emit("partnerDisconnected", { name: socket.userName || "" });
      socket.partner.partner = null;
      socket.partner = null;
    }

    console.log(`[REG-BLOCK] ${socket._regUser.usernameLower} session-blocked ${targetLc}`);
    socket.emit("reg:sessionBlockAck", { targetUsername: targetLc });
  });

  // ── Session-unblock a registered user ────────────────────────────────────
  //
  // Client emits:  socket.emit("reg:sessionUnblock", { targetUsername: "Bob" })
  //
  socket.on("reg:sessionUnblock", ({ targetUsername }) => {
    if (!socket._regUser || !targetUsername) return;
    const targetLc = String(targetUsername).toLowerCase().trim();
    if (!socket.blockedNames) return;
    socket.blockedNames = socket.blockedNames.filter(n => n !== targetLc);
    console.log(`[REG-UNBLOCK] ${socket._regUser.usernameLower} session-unblocked ${targetLc}`);
  });

/* ══════════════════════════════════════════════════════════════════════
   OPTIONAL: also handle "friend:removedByOther" on the client side
   ────────────────────────────────────────────────────────────────────
   In auth-client.js, inside  bindSocketEvents()  add:

     s.on("friend:removedByOther", ({ byUsername }) => {
       if (authUser) {
         authUser.friends = authUser.friends.filter(
           f => f.toLowerCase() !== byUsername.toLowerCase()
         );
         renderFriendsList(authUser.friends);
         renderDashFriends(authUser.friends);
       }
       showToast(`ℹ️ ${esc(byUsername)}-მ შენი მეგობრობა გაიუქმა`);
     });

   This ensures the other party's UI reflects the removal immediately.
   ══════════════════════════════════════════════════════════════════════ */
