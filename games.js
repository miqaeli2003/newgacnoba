/* ══════════════════════════════════════════════════════════════════
   games.js — Mini-Games for GAICANI Chat
   Games: Tic Tac Toe, Rock Paper Scissors, Math Duel (1v1),
          Checkers, Chess (1v1), Blackjack (vs PC)
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  function waitForSocket(cb) {
    if (window.socket) return cb(window.socket);
    let tries = 0;
    const iv = setInterval(() => {
      if (window.socket || ++tries > 100) {
        clearInterval(iv);
        if (window.socket) cb(window.socket);
        else console.warn('[games] socket never appeared on window');
      }
    }, 100);
  }

  waitForSocket(function (socket) {

    // ────────────────────────────────────────────────────────────
    // Constants
    // ────────────────────────────────────────────────────────────
    const GAME_NAMES = {
      ttt:       '❌⭕  Tic Tac Toe',
      rps:       '✊✋✌️  Rock Paper Scissors',
      math:      '🔢  Math Duel',
      checkers:  '🔴⚫  Checkers',
      chess:     '♟️  Chess',
      blackjack: '🃏  Blackjack',
    };
    const LOCAL_GAMES = new Set(['blackjack']); // no partner needed
    const RPS_EMOJI   = { rock: '✊', paper: '✋', scissors: '✌️' };
    const RPS_LABELS  = { rock: 'ჭა', paper: 'ქაღალდი', scissors: 'მაკრატელი' };
    const CHESS_UNI   = {
      white: { king:'♔', queen:'♕', rook:'♖', bishop:'♗', knight:'♘', pawn:'♙' },
      black: { king:'♚', queen:'♛', rook:'♜', bishop:'♝', knight:'♞', pawn:'♟' },
    };

    // ────────────────────────────────────────────────────────────
    // State
    // ────────────────────────────────────────────────────────────
    let currentGame   = null;
    let rpsChosen     = false;
    let hasPartner    = false;
    let chessState    = null;
    let checkersState = null;

    // ────────────────────────────────────────────────────────────
    // DOM helpers
    // ────────────────────────────────────────────────────────────
    const el  = (id)  => document.getElementById(id);
    const qs  = (sel) => document.querySelector(sel);
    const qsa = (sel) => document.querySelectorAll(sel);

    // ────────────────────────────────────────────────────────────
    // 1.  Inject 🎮 button into top-bar
    // ────────────────────────────────────────────────────────────
    function injectGameButton() {
      const rightSide = qs('.right-side');
      if (!rightSide || el('gameBtn')) return;

      const btn = document.createElement('button');
      btn.id        = 'gameBtn';
      btn.className = 'game-btn';
      btn.title     = 'Play Games';
      btn.innerHTML =
        '<span class="btn-icon game-btn-icon">🎮</span>' +
        '<span class="btn-label">თამაში</span>';

      const anchor = el('changeNameBtn');
      rightSide.insertBefore(btn, anchor);
      btn.addEventListener('click', toggleGameMenu);
    }

    // ────────────────────────────────────────────────────────────
    // 2.  Game Menu popup
    // ────────────────────────────────────────────────────────────
    function createGameMenu() {
      if (el('gameMenu')) return;
      const menu = document.createElement('div');
      menu.id        = 'gameMenu';
      menu.className = 'game-menu';
      menu.style.display = 'none';
      menu.innerHTML = `
        <div class="game-menu-header">
          <span class="game-menu-title">🎮 მინი თამაშები</span>
          <button class="game-menu-close" id="gameMenuClose">✕</button>
        </div>
        <div class="game-menu-section-label">👥 1v1 — პარტნიორთან</div>
        <div class="game-menu-list">
          <button class="game-menu-item" data-game="ttt">
            <span class="game-menu-icon">❌⭕</span>
            <div class="game-menu-info"><strong>Tic Tac Toe</strong><small>3×3 ბადე · 3 ზედიზედ</small></div>
          </button>
          <button class="game-menu-item" data-game="rps">
            <span class="game-menu-icon">✊✌️</span>
            <div class="game-menu-info"><strong>Rock Paper Scissors</strong><small>ერთდროული არჩევანი</small></div>
          </button>
          <button class="game-menu-item" data-game="math">
            <span class="game-menu-icon">🔢</span>
            <div class="game-menu-info"><strong>Math Duel</strong><small>პირველი სწორი პასუხი იგებს</small></div>
          </button>
          <button class="game-menu-item" data-game="checkers">
            <span class="game-menu-icon">🔴⚫</span>
            <div class="game-menu-info"><strong>Checkers (დამა)</strong><small>კლასიკური · სავალდებულო ხტომა</small></div>
          </button>
          <button class="game-menu-item" data-game="chess">
            <span class="game-menu-icon">♟️</span>
            <div class="game-menu-info"><strong>Chess (ჭადრაკი)</strong><small>სრული წესები · როქი · შახ-მატი</small></div>
          </button>
        </div>
        <div class="game-menu-section-label">🤖 vs კომპიუტერი</div>
        <div class="game-menu-list">
          <button class="game-menu-item" data-game="blackjack">
            <span class="game-menu-icon">🃏</span>
            <div class="game-menu-info"><strong>Blackjack (21)</strong><small>დილერის წინააღმდეგ · ₾1000 chip</small></div>
          </button>
        </div>`;
      document.body.appendChild(menu);

      el('gameMenuClose').addEventListener('click', () => { menu.style.display = 'none'; });

      qsa('.game-menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const gameType = btn.dataset.game;
          menu.style.display = 'none';
          if (LOCAL_GAMES.has(gameType)) {
            startLocalGame(gameType);
          } else if (!hasPartner) {
            appendSystemMessage('🎮 1v1 თამაშისთვის საჭიროა პარტნიორი.');
          } else {
            requestGame(gameType);
          }
        });
      });

      document.addEventListener('click', e => {
        const _btn = el('gameBtn');
        if (menu.style.display !== 'none' && !menu.contains(e.target) && !(_btn && _btn.contains(e.target)))
          menu.style.display = 'none';
      });
    }

    function toggleGameMenu() {
      const menu = el('gameMenu');
      if (!menu) return;
      menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }

    // ────────────────────────────────────────────────────────────
    // 3.  Game overlay window
    // ────────────────────────────────────────────────────────────
    function createGameOverlay() {
      if (el('gameOverlay')) return;
      const overlay = document.createElement('div');
      overlay.id        = 'gameOverlay';
      overlay.className = 'game-overlay';
      overlay.style.display = 'none';
      overlay.innerHTML = `
        <div class="game-window" id="gameWindow">
          <div class="game-window-header">
            <span id="gameTitle" class="game-title"></span>
            <button id="gameCloseBtn" class="game-close-btn" title="დახურვა">✕</button>
          </div>
          <div id="gameContent" class="game-content"></div>
          <div id="gameResult" class="game-result" style="display:none">
            <div id="gameResultEmoji"  class="game-result-emoji"></div>
            <div id="gameResultText"   class="game-result-text"></div>
            <div class="game-result-actions">
              <button id="gameRematchBtn" class="game-rematch-btn">🔄 ხელახლა</button>
              <button id="gameExitBtn"    class="game-exit-btn">✕ დახურვა</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      el('gameCloseBtn').addEventListener('click',  closeGame);
      el('gameExitBtn') .addEventListener('click',  closeGame);
      el('gameRematchBtn').addEventListener('click', () => {
        if (!currentGame) return;
        if (LOCAL_GAMES.has(currentGame.type)) {
          const t = currentGame.type;
          closeGame();
          startLocalGame(t);
          return;
        }
        const rematchType     = currentGame.type;
        const rematchOpponent = currentGame.opponentId;
        closeGame();
        socket.emit('game:rematch', { gameType: rematchType, toId: rematchOpponent });
      });
    }

    function showOverlay() { el('gameOverlay').style.display = 'flex'; }
    function hideOverlay() { el('gameOverlay').style.display = 'none'; }

    function closeGame() {
      hideOverlay();
      currentGame   = null;
      chessState    = null;
      checkersState = null;
      const result  = el('gameResult');
      if (result) result.style.display = 'none';
      const content = el('gameContent');
      if (content) content.innerHTML = '';
      const gw = el('gameWindow');
      if (gw) { gw.classList.remove('game-window--wide'); gw.classList.remove('game-window--bj'); }
    }

    // ────────────────────────────────────────────────────────────
    // 4.  Request / Invite flow
    // ────────────────────────────────────────────────────────────
    function requestGame(gameType) {
      socket.emit('game:request', { gameType });
      appendSystemMessage(`⏳ თამაშის მოთხოვნა გაიგზავნა: ${GAME_NAMES[gameType]}...`);
    }

    function startLocalGame(gameType) {
      currentGame = { type: gameType, role: null, opponentId: null, gameId: null };
      el('gameTitle').textContent = GAME_NAMES[gameType];
      el('gameResult').style.display = 'none';
      el('gameContent').innerHTML = '';
      const gw = el('gameWindow');
      if (gw) { gw.classList.remove('game-window--wide'); gw.classList.remove('game-window--bj'); }
      if (gameType === 'blackjack') {
        if (gw) gw.classList.add('game-window--bj');
        renderBlackjack();
      }
      showOverlay();
    }

    socket.on('game:invite', ({ gameType, fromId, isRematch }) => {
      const prefix = isRematch ? '🔄 ხელახლა' : '🎮 მოთხოვნა';
      showInviteBar(gameType, fromId, prefix);
      const btn = el('gameBtn');
      if (btn) btn.classList.add('game-btn--pulse');
    });

    function showInviteBar(gameType, fromId, prefix) {
      const existing = el('gameInviteBar');
      if (existing) existing.remove();

      const bar = document.createElement('div');
      bar.id        = 'gameInviteBar';
      bar.className = 'game-invite-bar';
      bar.innerHTML = `
        <span class="game-invite-text">${prefix}: <strong>${GAME_NAMES[gameType]}</strong></span>
        <div class="game-invite-actions">
          <button class="game-invite-accept"  id="gameAcceptBtn">✅ მიღება</button>
          <button class="game-invite-decline" id="gameDeclineBtn">❌ უარყოფა</button>
        </div>`;

      const chatInput = qs('.chat-input');
      if (chatInput) chatInput.prepend(bar);
      else document.body.appendChild(bar);

      let _inviteExpired = false;
      el('gameAcceptBtn').addEventListener('click', () => {
        if (_inviteExpired) return;
        _inviteExpired = true;
        bar.remove();
        clearGameBtnPulse();
        socket.emit('game:response', { accepted: true, gameType, toId: fromId });
      });
      el('gameDeclineBtn').addEventListener('click', () => {
        if (_inviteExpired) return;
        _inviteExpired = true;
        bar.remove();
        clearGameBtnPulse();
        socket.emit('game:response', { accepted: false, gameType, toId: fromId });
      });

      setTimeout(() => {
        if (el('gameInviteBar') && !_inviteExpired) {
          _inviteExpired = true;
          el('gameInviteBar').remove();
          clearGameBtnPulse();
          socket.emit('game:response', { accepted: false, gameType, toId: fromId });
        }
      }, 30000);
    }

    function clearGameBtnPulse() {
      const btn = el('gameBtn');
      if (btn) btn.classList.remove('game-btn--pulse');
    }

    socket.on('game:declined', () => {
      appendSystemMessage('❌ თამაშის მოთხოვნა უარყოფილ იქნა.');
    });

    // ────────────────────────────────────────────────────────────
    // 5.  Game Start dispatcher
    // ────────────────────────────────────────────────────────────
    socket.on('game:start', ({ gameId, gameType, role, opponentId, state }) => {
      currentGame = { gameId, type: gameType, role, opponentId };

      el('gameTitle').textContent = GAME_NAMES[gameType];
      el('gameResult').style.display = 'none';
      el('gameContent').innerHTML = '';

      const gw = el('gameWindow');
      if (gw) { gw.classList.remove('game-window--wide'); gw.classList.remove('game-window--bj'); }

      if      (gameType === 'ttt')      renderTTT(state, role);
      else if (gameType === 'rps')      renderRPS();
      else if (gameType === 'math')     renderMath(state);
      else if (gameType === 'chess')    renderChess(role);
      else if (gameType === 'checkers') renderCheckers(role);

      showOverlay();
    });

    // ────────────────────────────────────────────────────────────
    // 6.  TIC TAC TOE
    // ────────────────────────────────────────────────────────────
    function renderTTT(state, role) {
      const myTurn = state.currentTurnSocketId === socket.id;
      el('gameContent').innerHTML = `
        <div class="ttt-status" id="tttStatus">
          ${myTurn ? '🟢 შენი რიგია <strong>(' + role + ')</strong>' : '⏳ მოწინააღმდეგის რიგია...'}
        </div>
        <div class="ttt-board" id="tttBoard">
          ${Array(9).fill(null).map((_, i) => `
            <button class="ttt-cell" data-index="${i}" ${(!myTurn || state.board[i]) ? 'disabled' : ''}>${state.board[i] || ''}</button>
          `).join('')}
        </div>
        <div class="ttt-role-badge">შენ ხარ: <strong class="ttt-role-symbol">${role}</strong></div>`;

      qsa('.ttt-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          socket.emit('game:move', { index: parseInt(cell.dataset.index) });
        });
      });
    }

    function updateTTT({ board, currentTurnSocketId, winnerSocketId, winLine, draw }) {
      if (!currentGame || currentGame.type !== 'ttt') return;

      const cells  = qsa('.ttt-cell');
      const myTurn = !winnerSocketId && !draw && currentTurnSocketId === socket.id;

      board.forEach((val, i) => {
        if (!cells[i]) return;
        cells[i].textContent = val || '';
        cells[i].dataset.val = val || '';
        cells[i].disabled    = !myTurn || !!val;
        cells[i].className   = 'ttt-cell' + (val ? ' ttt-cell--' + val.toLowerCase() : '');
      });

      if (winLine) winLine.forEach(i => cells[i] && cells[i].classList.add('ttt-cell--winner'));

      const status = el('tttStatus');
      if (winnerSocketId || draw) {
        cells.forEach(c => (c.disabled = true));
        if (status) status.textContent = '';
        const won = winnerSocketId === socket.id;
        showResult(draw ? '🤝' : won ? '🏆' : '😔',
                   draw ? 'ფრე!' : won ? 'გაიმარჯვე!' : 'წააგე!');
      } else if (status) {
        status.innerHTML = myTurn
          ? '🟢 შენი რიგია <strong>(' + currentGame.role + ')</strong>'
          : '⏳ მოწინააღმდეგის რიგია...';
      }
    }

    // ────────────────────────────────────────────────────────────
    // 7.  ROCK PAPER SCISSORS
    // ────────────────────────────────────────────────────────────
    function renderRPS() {
      rpsChosen = false;
      el('gameContent').innerHTML = `
        <div class="rps-status" id="rpsStatus">🎯 აირჩიე!</div>
        <div class="rps-choices" id="rpsChoices">
          <button class="rps-btn" data-choice="rock"><span class="rps-emoji">✊</span><span class="rps-label">ჭა</span></button>
          <button class="rps-btn" data-choice="paper"><span class="rps-emoji">✋</span><span class="rps-label">ქაღალდი</span></button>
          <button class="rps-btn" data-choice="scissors"><span class="rps-emoji">✌️</span><span class="rps-label">მაკრატელი</span></button>
        </div>
        <div class="rps-opponent-status" id="rpsOpponentStatus"></div>
        <div class="rps-reveal" id="rpsReveal" style="display:none"></div>`;

      qsa('.rps-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (rpsChosen) return;
          rpsChosen = true;
          const choice = btn.dataset.choice;
          qsa('.rps-btn').forEach(b => {
            b.disabled = true;
            b.classList.toggle('rps-btn--selected', b === btn);
          });
          el('rpsStatus').textContent = `✅ შენ: ${RPS_EMOJI[choice]} ${RPS_LABELS[choice]}`;
          el('rpsOpponentStatus').textContent = '⏳ ელოდება მოწინააღმდეგეს...';
          socket.emit('game:move', { choice });
        });
      });
    }

    function updateRPS({ opponentChose, choices, winnerSocketId, draw }) {
      if (!currentGame || currentGame.type !== 'rps') return;

      if (opponentChose && !choices) {
        const os = el('rpsOpponentStatus');
        if (os) os.textContent = '✅ მოწინააღმდეგემ აირჩია! — ელოდება შენ...';
        return;
      }

      if (choices) {
        const os = el('rpsOpponentStatus');
        if (os) os.textContent = '';

        const myChoice    = choices[socket.id];
        const theirId     = Object.keys(choices).find(id => id !== socket.id);
        const theirChoice = choices[theirId];

        const reveal = el('rpsReveal');
        if (reveal) {
          reveal.style.display = 'flex';
          reveal.innerHTML = `
            <div class="rps-reveal-item"><div class="rps-reveal-emoji">${RPS_EMOJI[myChoice]}</div><div class="rps-reveal-name">შენ</div></div>
            <div class="rps-reveal-vs">VS</div>
            <div class="rps-reveal-item"><div class="rps-reveal-emoji">${RPS_EMOJI[theirChoice]}</div><div class="rps-reveal-name">ისინი</div></div>`;
        }

        const won = winnerSocketId === socket.id;
        showResult(draw ? '🤝' : won ? '🏆' : '😔', draw ? 'ფრე!' : won ? 'გაიმარჯვე!' : 'წააგე!');
      }
    }

    // ────────────────────────────────────────────────────────────
    // 8.  MATH DUEL
    // ────────────────────────────────────────────────────────────
    function renderMath(state) {
      el('gameContent').innerHTML = `
        <div class="math-status" id="mathStatus">🔢 პირველი სწორი პასუხი იგებს!</div>
        <div class="math-question" id="mathQuestion">${state.question.display} = ?</div>
        <div class="math-input-row">
          <input type="number" id="mathAnswer" class="math-input" placeholder="შეიყვანე პასუხი..." autocomplete="off" inputmode="numeric" />
          <button id="mathSubmit" class="math-submit-btn">✅</button>
        </div>
        <div class="math-feedback" id="mathFeedback"></div>`;

      const input  = el('mathAnswer');
      const submit = el('mathSubmit');

      function tryAnswer() {
        const val = input.value.trim();
        if (!val) return;
        socket.emit('game:move', { answer: parseInt(val, 10) });
        input.value = '';
        input.focus();
      }

      submit.addEventListener('click', tryAnswer);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') tryAnswer(); });
      setTimeout(() => { if (input) input.focus(); }, 300);
    }

    function updateMath({ wrong, winnerSocketId, answer, question }) {
      if (!currentGame || currentGame.type !== 'math') return;

      if (wrong) {
        const fb = el('mathFeedback');
        if (fb) {
          fb.textContent = '❌ არასწორია! სცადე ხელახლა.';
          fb.className   = 'math-feedback math-feedback--wrong';
          setTimeout(() => { if (fb) { fb.textContent = ''; fb.className = 'math-feedback'; } }, 1500);
        }
        return;
      }

      if (winnerSocketId !== undefined) {
        const status = el('mathStatus');
        if (status && question) status.textContent = `✅ სწორი პასუხი: ${question.display} = ${answer}`;
        const inp = el('mathAnswer');
        const sub = el('mathSubmit');
        if (inp) inp.disabled = true;
        if (sub) sub.disabled = true;
        const won = winnerSocketId === socket.id;
        showResult(won ? '🏆' : '😔', won ? 'გაიმარჯვე! პირველი სწორი!' : 'წააგე! მოწინააღმდეგე სწრაფი იყო.');
      }
    }

    // ════════════════════════════════════════════════════════════
    //  ♟️  CHESS ENGINE
    // ════════════════════════════════════════════════════════════

    function newChessBoard() {
      const mk = (col, type) => ({ color: col, type });
      const B = 'black', W = 'white';
      return [
        [mk(B,'rook'),mk(B,'knight'),mk(B,'bishop'),mk(B,'queen'),mk(B,'king'),mk(B,'bishop'),mk(B,'knight'),mk(B,'rook')],
        [mk(B,'pawn'),mk(B,'pawn'),mk(B,'pawn'),mk(B,'pawn'),mk(B,'pawn'),mk(B,'pawn'),mk(B,'pawn'),mk(B,'pawn')],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [mk(W,'pawn'),mk(W,'pawn'),mk(W,'pawn'),mk(W,'pawn'),mk(W,'pawn'),mk(W,'pawn'),mk(W,'pawn'),mk(W,'pawn')],
        [mk(W,'rook'),mk(W,'knight'),mk(W,'bishop'),mk(W,'queen'),mk(W,'king'),mk(W,'bishop'),mk(W,'knight'),mk(W,'rook')],
      ];
    }

    function chessClone(board) {
      return board.map(row => row.map(p => p ? { ...p } : null));
    }

    function chessOOB(r, c) { return r < 0 || r > 7 || c < 0 || c > 7; }

    function chessSlide(board, r, c, dirs) {
      const color = board[r][c].color;
      const moves = [];
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (!chessOOB(nr, nc)) {
          if (!board[nr][nc]) { moves.push({ r: nr, c: nc }); }
          else { if (board[nr][nc].color !== color) moves.push({ r: nr, c: nc }); break; }
          nr += dr; nc += dc;
        }
      }
      return moves;
    }

    function chessRaw(board, r, c, cr, ept) {
      const p = board[r][c];
      if (!p) return [];
      const col = p.color, opp = col === 'white' ? 'black' : 'white';
      const moves = [];

      if (p.type === 'rook')   return chessSlide(board, r, c, [[0,1],[0,-1],[1,0],[-1,0]]);
      if (p.type === 'bishop') return chessSlide(board, r, c, [[1,1],[1,-1],[-1,1],[-1,-1]]);
      if (p.type === 'queen')  return chessSlide(board, r, c, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]);

      if (p.type === 'knight') {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const nr = r+dr, nc = c+dc;
          if (!chessOOB(nr,nc) && (!board[nr][nc] || board[nr][nc].color !== col))
            moves.push({ r: nr, c: nc });
        }
        return moves;
      }

      if (p.type === 'pawn') {
        const dir = col === 'white' ? -1 : 1;
        const sr  = col === 'white' ? 6 : 1;
        if (!chessOOB(r+dir,c) && !board[r+dir][c]) {
          moves.push({ r: r+dir, c });
          if (r === sr && !board[r+2*dir][c]) moves.push({ r: r+2*dir, c });
        }
        for (const dc of [-1, 1]) {
          const nr = r+dir, nc = c+dc;
          if (!chessOOB(nr,nc)) {
            if (board[nr][nc] && board[nr][nc].color === opp) moves.push({ r: nr, c: nc });
            if (ept && ept.r === nr && ept.c === nc) moves.push({ r: nr, c: nc, enPassant: true });
          }
        }
        return moves;
      }

      if (p.type === 'king') {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const nr = r+dr, nc = c+dc;
          if (!chessOOB(nr,nc) && (!board[nr][nc] || board[nr][nc].color !== col))
            moves.push({ r: nr, c: nc });
        }
        if (cr) {
          const rights = cr[col];
          const bk = col === 'white' ? 7 : 0;
          if (r === bk && c === 4 && !chessInCheck(board, col)) {
            if (rights.kingSide && !board[bk][5] && !board[bk][6] && board[bk][7] && board[bk][7].color === col) {
              const b2 = chessApply(board, r, c, bk, 5);
              if (!chessInCheck(b2, col)) moves.push({ r: bk, c: 6, castle: 'kingSide' });
            }
            if (rights.queenSide && !board[bk][3] && !board[bk][2] && !board[bk][1] && board[bk][0] && board[bk][0].color === col) {
              const b2 = chessApply(board, r, c, bk, 3);
              if (!chessInCheck(b2, col)) moves.push({ r: bk, c: 2, castle: 'queenSide' });
            }
          }
        }
        return moves;
      }
      return moves;
    }

    function chessApply(board, fr, fc, tr, tc, opts) {
      const nb = chessClone(board);
      const piece = { ...nb[fr][fc] };
      nb[tr][tc] = piece;
      nb[fr][fc] = null;
      if (piece.type === 'pawn' && (tr === 0 || tr === 7))
        nb[tr][tc] = { color: piece.color, type: 'queen' };
      if (opts && opts.enPassant) {
        const capR = piece.color === 'white' ? tr + 1 : tr - 1;
        nb[capR][tc] = null;
      }
      if (opts && opts.castle) {
        const bk = piece.color === 'white' ? 7 : 0;
        if (opts.castle === 'kingSide') { nb[bk][5] = nb[bk][7]; nb[bk][7] = null; }
        else                             { nb[bk][3] = nb[bk][0]; nb[bk][0] = null; }
      }
      return nb;
    }

    function chessFindKing(board, col) {
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          if (board[r][c] && board[r][c].color === col && board[r][c].type === 'king')
            return { r, c };
      return null;
    }

    function chessAttacksSquare(board, r, c, byColor) {
      for (let pr = 0; pr < 8; pr++)
        for (let pc = 0; pc < 8; pc++) {
          const p = board[pr][pc];
          if (!p || p.color !== byColor) continue;
          if (chessRaw(board, pr, pc, null, null).some(m => m.r === r && m.c === c)) return true;
        }
      return false;
    }

    function chessInCheck(board, col) {
      const king = chessFindKing(board, col);
      if (!king) return false;
      return chessAttacksSquare(board, king.r, king.c, col === 'white' ? 'black' : 'white');
    }

    function chessLegal(board, r, c, cr, ept) {
      const p = board[r][c];
      if (!p) return [];
      return chessRaw(board, r, c, cr, ept).filter(mv => {
        const nb = chessApply(board, r, c, mv.r, mv.c, mv);
        return !chessInCheck(nb, p.color);
      });
    }

    function chessHasLegal(board, col, cr, ept) {
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          if (board[r][c] && board[r][c].color === col)
            if (chessLegal(board, r, c, cr, ept).length > 0) return true;
      return false;
    }

    // ────────────────────────────────────────────────────────────
    // 9.  CHESS RENDERING
    // ────────────────────────────────────────────────────────────
    function renderChess(role) {
      const myColor = role === 'X' ? 'white' : 'black';
      chessState = {
        board: newChessBoard(),
        turn: 'white',
        myColor,
        selected: null,
        validMoves: [],
        cr: { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } },
        ept: null,
        gameOver: false,
        lastMove: null,
        inCheck: false,
      };
      const gw = el('gameWindow');
      if (gw) gw.classList.add('game-window--wide');

      el('gameContent').innerHTML = `
        <div class="chess-info-row">
          <div class="chess-status" id="chessStatus"></div>
          <div class="chess-color-badge">შენ: <strong>${myColor === 'white' ? '⬜ თეთრი' : '⬛ შავი'}</strong></div>
        </div>
        <div class="chess-board-wrap"><div class="chess-board" id="chessBoard"></div></div>`;

      drawChessBoard();
      updateChessStatus();
    }

    function drawChessBoard() {
      const boardEl = el('chessBoard');
      if (!boardEl || !chessState) return;
      boardEl.innerHTML = '';
      const { board, myColor, selected, validMoves, lastMove } = chessState;
      const flip = myColor === 'black';
      const validSet = new Set(validMoves.map(m => `${m.r},${m.c}`));

      for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
          const ar = flip ? 7 - dr : dr;
          const ac = flip ? 7 - dc : dc;
          const piece = board[ar][ac];
          const light = (ar + ac) % 2 === 0;
          const isSel  = selected && selected.r === ar && selected.c === ac;
          const isVal  = validSet.has(`${ar},${ac}`);
          const isLM   = lastMove && ((lastMove.fr===ar&&lastMove.fc===ac)||(lastMove.tr===ar&&lastMove.tc===ac));
          const isCap  = isVal && !!piece;

          const cell = document.createElement('div');
          cell.className = ['chess-cell',
            light ? 'chess-cell--light' : 'chess-cell--dark',
            isSel  ? 'chess-cell--sel'  : '',
            isLM   ? 'chess-cell--lm'   : '',
            isCap  ? 'chess-cell--cap'  : '',
          ].filter(Boolean).join(' ');
          cell.dataset.r = ar; cell.dataset.c = ac;

          if (piece) {
            const sp = document.createElement('span');
            sp.className   = `chess-piece chess-piece--${piece.color}`;
            sp.textContent = CHESS_UNI[piece.color][piece.type];
            cell.appendChild(sp);
          }
          if (isVal && !piece) {
            const dot = document.createElement('div');
            dot.className = 'chess-dot';
            cell.appendChild(dot);
          }

          cell.addEventListener('click', () => onChessClick(ar, ac));
          boardEl.appendChild(cell);
        }
      }
    }

    function onChessClick(r, c) {
      if (!chessState || chessState.gameOver) return;
      const { board, turn, myColor, selected, validMoves, cr, ept } = chessState;
      if (turn !== myColor) return;

      const validSet = new Set(validMoves.map(m => `${m.r},${m.c}`));

      if (validSet.has(`${r},${c}`)) {
        const mv = validMoves.find(m => m.r === r && m.c === c);
        doChessMove(selected.r, selected.c, r, c, mv);
        return;
      }

      const piece = board[r][c];
      if (piece && piece.color === myColor) {
        chessState.selected   = { r, c };
        chessState.validMoves = chessLegal(board, r, c, cr, ept);
        drawChessBoard();
        return;
      }

      chessState.selected   = null;
      chessState.validMoves = [];
      drawChessBoard();
    }

    function doChessMove(fr, fc, tr, tc, mv) {
      if (!chessState) return;
      const { board, myColor, cr, ept } = chessState;
      const piece = board[fr][fc];
      const newBoard = chessApply(board, fr, fc, tr, tc, mv);

      // Update castling rights
      const newCR = JSON.parse(JSON.stringify(cr));
      if (piece.type === 'king') { newCR[piece.color].kingSide = false; newCR[piece.color].queenSide = false; }
      if (piece.type === 'rook') {
        const bk = piece.color === 'white' ? 7 : 0;
        if (fr === bk && fc === 0) newCR[piece.color].queenSide = false;
        if (fr === bk && fc === 7) newCR[piece.color].kingSide  = false;
      }
      const opp = piece.color === 'white' ? 'black' : 'white';
      const oppBk = opp === 'white' ? 7 : 0;
      if (tr === oppBk && tc === 0) newCR[opp].queenSide = false;
      if (tr === oppBk && tc === 7) newCR[opp].kingSide  = false;

      // En passant target
      let newEpt = null;
      if (piece.type === 'pawn' && Math.abs(tr - fr) === 2)
        newEpt = { r: (fr + tr) / 2, c: fc };

      const nextTurn = piece.color === 'white' ? 'black' : 'white';
      const inChk  = chessInCheck(newBoard, nextTurn);
      const hasLgl = chessHasLegal(newBoard, nextTurn, newCR, newEpt);

      let gameOver = false;
      if (!hasLgl) gameOver = inChk
        ? { result: 'checkmate', winner: myColor }
        : { result: 'stalemate', winner: null };

      chessState = { ...chessState, board: newBoard, turn: nextTurn, selected: null, validMoves: [],
        cr: newCR, ept: newEpt, gameOver, lastMove: {fr,fc,tr,tc}, inCheck: inChk };

      drawChessBoard();
      updateChessStatus();
      if (gameOver) resolveChessOver(gameOver);

      socket.emit('game:move', { board: newBoard, turn: nextTurn, cr: newCR, ept: newEpt,
        gameOver, lastMove: {fr,fc,tr,tc}, inCheck: inChk });
    }

    function updateChessNet(data) {
      if (!currentGame || currentGame.type !== 'chess' || !chessState) return;
      chessState = { ...chessState, board: data.board, turn: data.turn, cr: data.cr,
        ept: data.ept, gameOver: data.gameOver, lastMove: data.lastMove,
        selected: null, validMoves: [], inCheck: data.inCheck };
      drawChessBoard();
      updateChessStatus();
      if (data.gameOver) resolveChessOver(data.gameOver);
    }

    function updateChessStatus() {
      const st = el('chessStatus');
      if (!st || !chessState) return;
      const { turn, myColor, gameOver, inCheck } = chessState;
      if (gameOver) { st.textContent = ''; return; }
      if (turn === myColor) {
        st.innerHTML   = inCheck ? '⚠️ შახი! <strong>შენი ვა!</strong>' : '🟢 <strong>შენი ვა!</strong>';
        st.className   = 'chess-status chess-status--mine';
      } else {
        st.innerHTML   = inCheck ? '⚠️ მოწინააღმდეგეს შახი! ⏳' : '⏳ მოწინააღმდეგის ვა...';
        st.className   = 'chess-status chess-status--wait';
      }
    }

    function resolveChessOver(go) {
      if (!chessState) return;
      if (go.result === 'stalemate') return showResult('🤝', 'ფრე! (Stalemate)');
      const won = go.winner === chessState.myColor;
      showResult(won ? '🏆' : '😔', won ? 'შახ-მატი! გაიმარჯვე!' : 'შახ-მატი! წააგე!');
    }

    // ════════════════════════════════════════════════════════════
    //  🔴⚫  CHECKERS ENGINE
    // ════════════════════════════════════════════════════════════
    // Pieces: 'r'=red, 'b'=black, 'R'=red-king, 'B'=black-king

    function newCheckersBoard() {
      const bd = Array.from({length:8}, () => Array(8).fill(null));
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++)
          if ((r+c)%2===1) bd[r][c]='b';
      for (let r = 5; r < 8; r++)
        for (let c = 0; c < 8; c++)
          if ((r+c)%2===1) bd[r][c]='r';
      return bd;
    }

    function chkColor(p) { return p ? p.toLowerCase() : null; }
    function chkKing(p)  { return p === 'R' || p === 'B'; }

    function chkMovesFor(bd, r, c) {
      const p = bd[r][c];
      if (!p) return { simple: [], jumps: [] };
      const col = chkColor(p);
      const opp = col === 'r' ? 'b' : 'r';
      const fwdDirs = col === 'r' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
      const allDirs = chkKing(p) ? [[-1,-1],[-1,1],[1,-1],[1,1]] : fwdDirs;
      const simple = [], jumps = [];
      for (const [dr, dc] of allDirs) {
        const nr = r+dr, nc = c+dc;
        if (nr<0||nr>7||nc<0||nc>7) continue;
        if (!bd[nr][nc]) {
          simple.push({ r: nr, c: nc });
        } else if (chkColor(bd[nr][nc]) === opp) {
          const jr = r+2*dr, jc = c+2*dc;
          if (jr>=0&&jr<=7&&jc>=0&&jc<=7&&!bd[jr][jc])
            jumps.push({ r: jr, c: jc, cap: { r: nr, c: nc } });
        }
      }
      return { simple, jumps };
    }

    function chkAllMoves(bd, col) {
      const pieces = [];
      let anyJump = false;
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          if (chkColor(bd[r][c]) !== col) continue;
          const { simple, jumps } = chkMovesFor(bd, r, c);
          if (jumps.length) anyJump = true;
          pieces.push({ r, c, simple, jumps });
        }
      return anyJump
        ? pieces.filter(p => p.jumps.length > 0).map(p => ({ r:p.r, c:p.c, moves: p.jumps }))
        : pieces.filter(p => p.simple.length > 0).map(p => ({ r:p.r, c:p.c, moves: p.simple }));
    }

    function chkApply(bd, fr, fc, tr, tc, cap) {
      const nb = bd.map(row => [...row]);
      const p  = nb[fr][fc];
      nb[fr][fc] = null;
      if (cap) nb[cap.r][cap.c] = null;
      // King promotion
      const promoted = (p==='r'&&tr===0) ? 'R' : (p==='b'&&tr===7) ? 'B' : p;
      nb[tr][tc] = promoted;
      return { board: nb, promoted: promoted !== p };
    }

    // ────────────────────────────────────────────────────────────
    // 10. CHECKERS RENDERING
    // ────────────────────────────────────────────────────────────
    function renderCheckers(role) {
      // role 'X' = red (goes first), 'O' = black
      const myColor = role === 'X' ? 'r' : 'b';
      checkersState = {
        board: newCheckersBoard(),
        turn: 'r',
        myColor,
        selected: null,
        validDests: [],
        movesForSelected: [],
        multiJump: null, // piece locked for multi-jump {r,c}
        gameOver: false,
      };
      const gw = el('gameWindow');
      if (gw) gw.classList.add('game-window--wide');

      el('gameContent').innerHTML = `
        <div class="chess-info-row">
          <div class="chess-status" id="ckStatus"></div>
          <div class="chess-color-badge">შენ: <strong>${myColor==='r'?'🔴 წითელი':'⚫ შავი'}</strong></div>
        </div>
        <div class="chess-board-wrap"><div class="checkers-board" id="checkersBoard"></div></div>`;

      drawCheckersBoard();
      updateCheckersStatus();
    }

    function drawCheckersBoard() {
      const boardEl = el('checkersBoard');
      if (!boardEl || !checkersState) return;
      boardEl.innerHTML = '';
      const { board, myColor, selected, validDests, multiJump } = checkersState;
      const flip = myColor === 'b';
      const destSet = new Set(validDests.map(m => `${m.r},${m.c}`));

      for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
          const ar = flip ? 7-dr : dr;
          const ac = flip ? 7-dc : dc;
          const p  = board[ar][ac];
          const dark = (ar+ac)%2===1;
          const isSel = selected && selected.r===ar && selected.c===ac;
          const isDst = destSet.has(`${ar},${ac}`);
          const isLocked = multiJump && multiJump.r===ar && multiJump.c===ac;

          const cell = document.createElement('div');
          cell.className = ['ck-cell',
            dark ? 'ck-cell--dark' : 'ck-cell--light',
            isSel  ? 'ck-cell--sel' : '',
            isDst  ? 'ck-cell--dst' : '',
            isLocked ? 'ck-cell--locked' : '',
          ].filter(Boolean).join(' ');
          cell.dataset.r = ar; cell.dataset.c = ac;

          if (p) {
            const pc = document.createElement('div');
            pc.className = `ck-piece ck-piece--${chkColor(p)}${chkKing(p)?' ck-piece--king':''}`;
            if (chkKing(p)) pc.innerHTML = '<span class="ck-crown">♛</span>';
            cell.appendChild(pc);
          } else if (isDst) {
            const dot = document.createElement('div');
            dot.className = 'ck-dot';
            cell.appendChild(dot);
          }

          cell.addEventListener('click', () => onCkClick(ar, ac));
          boardEl.appendChild(cell);
        }
      }
    }

    function onCkClick(r, c) {
      if (!checkersState || checkersState.gameOver) return;
      const { board, turn, myColor, selected, validDests, movesForSelected, multiJump } = checkersState;
      if (turn !== myColor) return;

      const destSet = new Set(validDests.map(m => `${m.r},${m.c}`));

      // Destination click
      if (destSet.has(`${r},${c}`)) {
        const mv = movesForSelected.find(m => m.r===r && m.c===c);
        doCkMove(selected.r, selected.c, r, c, mv && mv.cap ? mv.cap : null);
        return;
      }

      // Multi-jump in progress: only the locked piece can be clicked
      if (multiJump) {
        if (multiJump.r===r && multiJump.c===c) {
          // Re-show its jumps
          const { jumps } = chkMovesFor(board, r, c);
          checkersState.selected   = { r, c };
          checkersState.validDests = jumps;
          checkersState.movesForSelected = jumps;
          drawCheckersBoard();
        }
        return;
      }

      // Select a friendly piece
      const p = board[r][c];
      if (p && chkColor(p) === myColor) {
        const allMoves = chkAllMoves(board, myColor);
        const entry    = allMoves.find(e => e.r===r && e.c===c);
        if (entry) {
          checkersState.selected   = { r, c };
          checkersState.validDests = entry.moves;
          checkersState.movesForSelected = entry.moves;
          drawCheckersBoard();
        }
        return;
      }

      checkersState.selected   = null;
      checkersState.validDests = [];
      checkersState.movesForSelected = [];
      drawCheckersBoard();
    }

    function doCkMove(fr, fc, tr, tc, cap) {
      if (!checkersState) return;
      const { board, myColor } = checkersState;
      const { board: newBoard, promoted } = chkApply(board, fr, fc, tr, tc, cap);

      // Check multi-jump: if this was a capture and piece can jump again (and wasn't promoted)
      let multiJump = null;
      if (cap && !promoted) {
        const { jumps } = chkMovesFor(newBoard, tr, tc);
        if (jumps.length > 0) multiJump = { r: tr, c: tc };
      }

      const nextTurn = multiJump ? myColor : (myColor === 'r' ? 'b' : 'r');

      // Check win: opponent has no pieces left
      const oppCol = myColor === 'r' ? 'b' : 'r';
      let oppHas = false;
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          if (chkColor(newBoard[r][c]) === oppCol) { oppHas = true; break; }

      // Also check if opponent has no legal moves
      const oppMoves = chkAllMoves(newBoard, oppCol);
      const gameOver = (!oppHas || (nextTurn === oppCol && oppMoves.length === 0))
        ? { winner: myColor } : false;

      checkersState = {
        ...checkersState, board: newBoard, turn: nextTurn,
        selected: multiJump || null,
        validDests: [],
        movesForSelected: [],
        multiJump,
        gameOver,
      };

      if (multiJump) {
        const { jumps } = chkMovesFor(newBoard, tr, tc);
        checkersState.validDests = jumps;
        checkersState.movesForSelected = jumps;
      }

      drawCheckersBoard();
      updateCheckersStatus();

      if (gameOver) {
        showResult('🏆', 'გაიმარჯვე!');
        socket.emit('game:move', { board: newBoard, turn: nextTurn, gameOver, multiJump: false });
        return;
      }

      socket.emit('game:move', {
        board: newBoard, turn: nextTurn, gameOver: false,
        multiJump: multiJump ? { r: tr, c: tc } : null,
      });
    }

    function updateCheckersNet(data) {
      if (!currentGame || currentGame.type !== 'checkers' || !checkersState) return;
      checkersState = {
        ...checkersState, board: data.board, turn: data.turn,
        selected: null, validDests: [], movesForSelected: [],
        multiJump: null, gameOver: data.gameOver,
      };
      drawCheckersBoard();
      updateCheckersStatus();
      if (data.gameOver) showResult('😔', 'წააგე!');
    }

    function updateCheckersStatus() {
      const st = el('ckStatus');
      if (!st || !checkersState) return;
      const { turn, myColor, gameOver, multiJump } = checkersState;
      if (gameOver) { st.textContent=''; return; }
      if (multiJump) { st.innerHTML='🔗 <strong>გააგრძელე ხტომა!</strong>'; st.className='chess-status chess-status--mine'; return; }
      if (turn === myColor) { st.innerHTML='🟢 <strong>შენი ვა!</strong>'; st.className='chess-status chess-status--mine'; }
      else { st.textContent='⏳ მოწინააღმდეგის ვა...'; st.className='chess-status chess-status--wait'; }
    }

    // ════════════════════════════════════════════════════════════
    //  🃏  BLACKJACK (vs PC — fully local)
    // ════════════════════════════════════════════════════════════

    let bjState = null;

    function bjNewDeck() {
      const suits  = ['♠','♥','♦','♣'];
      const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
      const deck   = [];
      for (const s of suits) for (const v of values) deck.push({ suit: s, value: v });
      for (let i = deck.length-1; i > 0; i--) {
        const j = Math.floor(Math.random()*(i+1));
        [deck[i],deck[j]] = [deck[j],deck[i]];
      }
      return deck;
    }

    function bjCardVal(card) {
      if (['J','Q','K'].includes(card.value)) return 10;
      if (card.value === 'A') return 11;
      return parseInt(card.value);
    }

    function bjHandVal(hand) {
      let val = hand.reduce((s, c) => s + bjCardVal(c), 0);
      let aces = hand.filter(c => c.value === 'A').length;
      while (val > 21 && aces > 0) { val -= 10; aces--; }
      return val;
    }

    function bjCardHTML(card, hidden) {
      if (hidden) return '<div class="bj-card bj-card--hidden">🂠</div>';
      const red = card.suit === '♥' || card.suit === '♦';
      return `<div class="bj-card${red?' bj-card--red':''}">${card.value}<span class="bj-suit">${card.suit}</span></div>`;
    }

    function bjRender() {
      const { deck, player, dealer, phase, chips, bet, message } = bjState;
      const pVal = bjHandVal(player);
      const dVal = phase === 'done' ? bjHandVal(dealer) : bjHandVal([dealer[0]]);

      el('gameContent').innerHTML = `
        <div class="bj-chips">💰 Chips: <strong>${chips}</strong>  |  Bet: <strong>${bet}</strong></div>
        <div class="bj-area">
          <div class="bj-label">Dealer ${phase==='done'?`(${bjHandVal(dealer)})`:''}</div>
          <div class="bj-hand" id="bjDealer">
            ${dealer.map((c,i)=>bjCardHTML(c, phase!=='done'&&i>0)).join('')}
          </div>
          <div class="bj-label">შენ (${pVal})</div>
          <div class="bj-hand" id="bjPlayer">
            ${player.map(c=>bjCardHTML(c,false)).join('')}
          </div>
        </div>
        ${message ? `<div class="bj-message">${message}</div>` : ''}
        <div class="bj-actions" id="bjActions"></div>
        <div class="bj-bet-row" id="bjBetRow" style="display:none">
          <span>Bet:</span>
          <button class="bj-bet-btn" data-amt="25">25</button>
          <button class="bj-bet-btn" data-amt="50">50</button>
          <button class="bj-bet-btn" data-amt="100">100</button>
          <button class="bj-bet-btn" data-amt="250">250</button>
        </div>`;

      const actEl = el('bjActions');
      const betEl = el('bjBetRow');

      if (phase === 'bet') {
        betEl.style.display = 'flex';
        qsa('.bj-bet-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const amt = parseInt(btn.dataset.amt);
            if (amt > bjState.chips) return;
            bjState.bet   = amt;
            bjState.chips -= amt;
            bjDeal();
          });
        });
      } else if (phase === 'play') {
        actEl.innerHTML = `
          <button class="bj-action-btn bj-hit"    id="bjHit">Hit</button>
          <button class="bj-action-btn bj-stand"  id="bjStand">Stand</button>
          ${bjState.chips >= bjState.bet ? '<button class="bj-action-btn bj-double" id="bjDouble">Double</button>' : ''}`;
        el('bjHit')  .addEventListener('click', bjHit);
        el('bjStand').addEventListener('click', bjStand);
        const dbl = el('bjDouble');
        if (dbl) dbl.addEventListener('click', bjDouble);
      } else if (phase === 'done') {
        actEl.innerHTML = bjState.chips > 0
          ? '<button class="bj-action-btn bj-deal" id="bjNext">შემდეგი რაუნდი</button>'
          : '<div class="bj-bust">Game Over — chips ამოიწურა!</div>';
        const nx = el('bjNext');
        if (nx) nx.addEventListener('click', bjNewRound);
      }
    }

    function bjDeal() {
      const { deck } = bjState;
      bjState.player = [deck.pop(), deck.pop()];
      bjState.dealer = [deck.pop(), deck.pop()];
      bjState.phase  = 'play';
      bjState.message = '';
      const pVal = bjHandVal(bjState.player);
      if (pVal === 21) { bjState.phase='done'; bjResolve(); }
      else bjRender();
    }

    function bjHit() {
      bjState.player.push(bjState.deck.pop());
      const v = bjHandVal(bjState.player);
      if (v > 21) { bjState.phase='done'; bjState.message=''; bjResolve(); }
      else bjRender();
    }

    function bjStand() {
      // Dealer draws to 17
      while (bjHandVal(bjState.dealer) < 17) bjState.dealer.push(bjState.deck.pop());
      bjState.phase = 'done';
      bjResolve();
    }

    function bjDouble() {
      bjState.chips -= bjState.bet;
      bjState.bet   *= 2;
      bjState.player.push(bjState.deck.pop());
      bjStand();
    }

    function bjResolve() {
      const pv = bjHandVal(bjState.player);
      const dv = bjHandVal(bjState.dealer);
      const pBJ = pv === 21 && bjState.player.length === 2;
      let msg = '';
      if (pv > 21) {
        msg = '💥 Bust! წააგე.';
      } else if (dv > 21 || pv > dv) {
        const win = pBJ ? Math.floor(bjState.bet * 1.5) : bjState.bet;
        bjState.chips += bjState.bet + win;
        msg = pBJ ? `🎰 Blackjack! +${win}` : `🏆 გაიმარჯვე! +${win}`;
      } else if (pv === dv) {
        bjState.chips += bjState.bet; // push
        msg = '🤝 Push! ბეტი დაბრუნდა.';
      } else {
        msg = `😔 დილერი ${dv}. წააგე!`;
      }
      bjState.message = msg;
      bjRender();
    }

    function bjNewRound() {
      if (bjState.chips < 25) bjState.chips = 1000; // refill
      bjState.deck    = bjNewDeck();
      bjState.player  = [];
      bjState.dealer  = [];
      bjState.phase   = 'bet';
      bjState.bet     = 0;
      bjState.message = '';
      bjRender();
    }

    function renderBlackjack() {
      bjState = {
        deck:    bjNewDeck(),
        player:  [],
        dealer:  [],
        phase:   'bet',
        chips:   1000,
        bet:     0,
        message: '',
      };
      bjRender();
    }

    // ────────────────────────────────────────────────────────────
    // 11. Unified socket update handler
    // ────────────────────────────────────────────────────────────
    socket.on('game:update', data => {
      if (!currentGame) return;
      if      (currentGame.type === 'ttt')      updateTTT(data);
      else if (currentGame.type === 'rps')      updateRPS(data);
      else if (currentGame.type === 'math')     updateMath(data);
      else if (currentGame.type === 'chess')    updateChessNet(data);
      else if (currentGame.type === 'checkers') updateCheckersNet(data);
    });

    socket.on('game:partnerLeft', () => {
      appendSystemMessage('🎮 მოწინააღმდეგე გათიშა — თამაში გაუქმდა.');
      closeGame();
    });

    // ────────────────────────────────────────────────────────────
    // 12. Result overlay
    // ────────────────────────────────────────────────────────────
    function showResult(emoji, text) {
      const result = el('gameResult');
      el('gameResultEmoji').textContent = emoji;
      el('gameResultText').textContent  = text;
      result.className = 'game-result ' + (
        text.includes('გაიმარჯვე') ? 'game-result--win'  :
        text.includes('ფრე')        ? 'game-result--draw' : 'game-result--lose'
      );
      result.style.display = 'flex';
    }

    // ────────────────────────────────────────────────────────────
    // 13. Enable / disable game button
    // ────────────────────────────────────────────────────────────
    function setGameBtnEnabled(on) {
      hasPartner = on;
      // Button itself stays always visible; partner state tracked via hasPartner
    }

    function onPartnerConnected() { setGameBtnEnabled(true); }
    function onPartnerGone() {
      setGameBtnEnabled(false);
      clearGameBtnPulse();
      const bar = el('gameInviteBar');
      if (bar) bar.remove();
      if (currentGame && !LOCAL_GAMES.has(currentGame.type)) closeGame();
    }

    socket.on('partnerFound',       onPartnerConnected);
    socket.on('partnerRestored',    onPartnerConnected);
    socket.on('partnerReconnected', onPartnerConnected);
    socket.on('partnerDisconnected', onPartnerGone);
    socket.on('youWereBlocked',      onPartnerGone);
    socket.on('queuePosition',      () => setGameBtnEnabled(false));
    socket.on('partnerReconnecting', () => {
      setGameBtnEnabled(false);
      clearGameBtnPulse();
      const bar = el('gameInviteBar');
      if (bar) bar.remove();
    });

    // ────────────────────────────────────────────────────────────
    // 14. Utility
    // ────────────────────────────────────────────────────────────
    function appendSystemMessage(text) {
      const chat = el('chat');
      if (!chat) return;
      const div = document.createElement('div');
      div.className   = 'system-message';
      div.textContent = text;
      chat.appendChild(div);
      chat.scrollTop  = chat.scrollHeight;
    }

    // ────────────────────────────────────────────────────────────
    // Init
    // ────────────────────────────────────────────────────────────
    function init() {
      injectGameButton();
      createGameMenu();
      createGameOverlay();
    }

    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', init);
    else
      init();
  });

})();
