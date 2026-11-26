// ============================================================================
// SENET SCREEN
// ----------------------------------------------------------------------------
// Draws the game and handles taps. All game decisions are made by engine.js;
// this file only shows the state and passes actions on.
// ============================================================================

import { RULES, rulesSummary } from "./rules.js";
import { newGame, throwSticks, applyMove, explainTap } from "./engine.js";
import { createNet, newRoomCode } from "./net.js?v=2";
import { sound } from "./sound.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

const app = {
  mode: null, // "local" | "host" | "guest"
  me: "A",
  game: null,
  room: params.get("room"),
  net: null,
  stream: null,
  peerStream: null,
  conn: "",
  pieces: [],
  nextPieceId: 1,
  flash: null,
  flashTimer: null,
  inGame: false,
};
const root = $("#app");

const ICON = {
  mic: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  cam: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3v8l-6-3"/></svg>',
};
const SYMBOL = {
  15: '<svg aria-hidden="true" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><ellipse cx="12" cy="7" rx="4" ry="5"/><path d="M12 12v14M5 15h14"/></svg>',
  26: '<svg aria-hidden="true" viewBox="0 0 36 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v16M3 7h8M3 11h8M18 4v16M14 7h8M14 11h8M29 4v16M25 7h8M25 11h8"/><circle cx="7" cy="23" r="3"/><circle cx="18" cy="23" r="3"/><circle cx="29" cy="23" r="3"/></svg>',
  27: '<svg aria-hidden="true" viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3M2 14l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3M2 22l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3"/></svg>',
  28: '<svg aria-hidden="true" viewBox="0 0 36 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="6" r="3"/><path d="M7 10l-4 14h8z"/><circle cx="18" cy="6" r="3"/><path d="M18 10l-4 14h8z"/><circle cx="29" cy="6" r="3"/><path d="M29 10l-4 14h8z"/></svg>',
  29: '<svg aria-hidden="true" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="6" r="3"/><path d="M8 10l-4 14h8z"/><circle cx="20" cy="6" r="3"/><path d="M20 10l-4 14h8z"/></svg>',
};

// Where square n sits on the upright board: up the first column, down the
// middle, up the last.
function place(n) {
  if (n <= 10) return { col: 0, row: 10 - n };
  if (n <= 20) return { col: 1, row: n - 11 };
  return { col: 2, row: 30 - n };
}

// ------------------------------------------------------------------ home ---

function showHome(note = "") {
  app.inGame = false;
  const name = store.get("senet-name") || "";
  const resuming = app.room && store.get("senet-host-room") === app.room;
  const joining = app.room && !resuming;
  root.innerHTML = `
    <div class="home">
      <h1>SENET</h1>
      <p>${joining ? "You've been invited to a game." : "The game of passing, for two players."}</p>
      <label class="field">Your name
        <input id="name" maxlength="14" autocomplete="given-name" value="${esc(name)}" placeholder="Nathan">
      </label>
      ${joining ? '<button class="btn gold" data-act="guest">Join game</button>' : ""}
      ${resuming ? '<button class="btn gold" data-act="resume">Resume your game</button>' : ""}
      ${!joining ? `<button class="btn ${resuming ? "plain" : "gold"}" data-act="host">Start a game with someone</button>` : ""}
      <button class="btn plain" data-act="local">Two players, one phone</button>
      <p>${esc(note) || "You'll be asked for your camera and microphone so you can see and hear each other."}</p>
    </div>`;
}

function myName(fallback) {
  const input = $("#name");
  const name = ((input && input.value) || "").trim() || fallback;
  store.set("senet-name", name === fallback ? "" : name);
  return name;
}

function showLobby(html) {
  app.inGame = false;
  root.innerHTML = `<div class="home"><h1>SENET</h1>${html}</div>`;
}

function inviteLink() {
  return `${location.origin}${location.pathname}?room=${app.room}`;
}

function showInvite() {
  showLobby(`
    <p>Send this link to the other player. The game starts when they open it.</p>
    <div class="linkbox">${esc(inviteLink())}</div>
    <div class="row">
      <button class="btn gold" data-act="share">Send link</button>
      <button class="btn plain" data-act="copy">Copy</button>
    </div>
    <p id="lobby-note">Waiting for them to join. Keep this page open.</p>`);
}

// --------------------------------------------------------------- joining ---

async function getMedia() {
  if (params.has("novideo") || !navigator.mediaDevices) return null;
  const video = { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } };
  try { return await navigator.mediaDevices.getUserMedia({ audio: true, video }); } catch (e) { /* try sound only */ }
  try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return null; }
}

function connect() {
  if (app.net) app.net.close();
  app.net = createNet({
    room: app.room,
    isHost: app.mode === "host",
    stream: app.stream,
    onMessage,
    onPeerStream(remote) { app.peerStream = remote; attachVideo(); },
    onStatus,
  });
}

const LOBBY_NOTE = {
  waiting: "Waiting for them to join. Keep this page open.",
  joining: "Joining the game…",
  retrying: "Still trying to reach the other phone…",
  nohost: "The other player's game page isn't open. Ask them to go back to it.",
  lost: "Connection lost. Trying again…",
  error: "Connection problem. Trying again…",
};

function onStatus(status) {
  app.conn = status;
  if (status === "connected" && app.mode === "guest") {
    app.net.send({ t: "hello", name: app.name, hasMedia: !!app.stream });
  }
  if (status === "connected" && app.mode === "host" && app.inGame) {
    app.net.send({ t: "state", game: { ...app.game, fx: [] } });
  }
  if (status === "taken") return showHome("This game is already open in another tab or phone.");
  const note = $("#lobby-note");
  if (note && LOBBY_NOTE[status]) note.textContent = LOBBY_NOTE[status];
  if (app.inGame) update();
}

function onMessage(msg) {
  if (msg.t === "hello" && app.mode === "host") {
    app.game = { ...app.game, names: { ...app.game.names, B: msg.name }, fx: [] };
    save();
    app.net.send({ t: "state", game: app.game });
    if (!app.inGame) showGame(); else update();
  } else if (msg.t === "state") {
    const first = !app.inGame;
    app.game = msg.game;
    save();
    if (first) showGame(); else { react(); update(); }
  }
}

async function startHost(resume) {
  app.mode = "host";
  app.me = "A";
  app.name = myName("Player 1");
  if (!resume) app.room = newRoomCode();
  store.set("senet-host-room", app.room);
  history.replaceState(null, "", `?room=${app.room}${params.has("novideo") ? "&novideo=1" : ""}`);
  let saved = null;
  if (resume) try { saved = JSON.parse(store.get("senet-game-" + app.room)); } catch (e) { saved = null; }
  app.game = saved || newGame({ A: app.name, B: "Player 2" });
  showLobby("<p>Getting your camera ready…</p>");
  app.stream = await getMedia();
  showInvite();
  connect();
}

async function startGuest() {
  app.mode = "guest";
  app.me = "B";
  app.name = myName("Player 2");
  showLobby("<p>Getting your camera ready…</p>");
  app.stream = await getMedia();
  showLobby('<p id="lobby-note">Joining the game…</p>');
  connect();
}

function startLocal() {
  app.mode = "local";
  app.name = myName("Player 1");
  app.game = newGame({ A: app.name, B: "Player 2" });
  showGame();
}

// ------------------------------------------------------------------ game ---

function showGame() {
  app.inGame = true;
  app.pieces = [];
  const remote = app.mode !== "local";
  let cells = "";
  for (let row = 0; row < 10; row++) {
    for (const n of [10 - row, 11 + row, 30 - row]) {
      const special = RULES.squareInfo[n];
      cells += `<button class="cell${n % 2 === 0 ? " red" : ""}${special ? " special" : ""}" data-n="${n}"
        aria-label="Square ${n}${special ? ", " + special.name : ""}"><span class="num">${n}</span>${SYMBOL[n] || ""}</button>`;
    }
  }
  root.innerHTML = `
    <div class="top"><div class="carved">SENET</div><button data-act="rules">Rules</button></div>
    <div class="game">
      <div class="frame"><div class="board" id="board">${cells}</div></div>
      <div class="side">
        <div class="tile them"><div class="initial" id="them-initial"></div><video id="them-video" autoplay playsinline hidden></video>
          <div class="tag"><i class="dot" id="them-dot"></i><span id="them-name"></span></div>
          <button class="hear" data-act="hear" hidden>Tap to hear them</button></div>
        <div class="card status"><div class="carved" id="headline"></div><div class="sub" id="sub"></div></div>
        <div class="card sticks" id="sticks"><div class="set">${'<div class="stick idle"></div>'.repeat(RULES.sticks.count)}</div><div class="val" id="val"></div></div>
        <button class="btn gold" id="throw" data-act="throw">Throw sticks</button>
        <div class="card off"><div><span id="off-me-label"></span><span id="off-me"></span></div><div><span id="off-them-label"></span><span id="off-them"></span></div></div>
        <div class="tile me"><div class="initial" id="me-initial"></div><video id="me-video" autoplay playsinline muted hidden></video>
          <div class="tag"><i class="dot" id="me-dot"></i><span id="me-name"></span></div>
          ${remote ? `<div class="av"><button data-act="mic" aria-label="Mute microphone">${ICON.mic}</button><button data-act="cam" aria-label="Turn camera off">${ICON.cam}</button></div>` : ""}
        </div>
      </div>
    </div>`;
  attachVideo();
  update();
}

function attachVideo() {
  if (!app.inGame) return;
  const pairs = [["#me-video", "#me-initial", app.stream], ["#them-video", "#them-initial", app.peerStream]];
  for (const [vSel, iSel, stream] of pairs) {
    const video = $(vSel);
    const hasPicture = stream && stream.getVideoTracks().length > 0;
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      const playing = video.play();
      if (playing && vSel === "#them-video") playing.catch(() => { $(".hear").hidden = false; });
    }
    video.hidden = !hasPicture;
    $(iSel).hidden = !!hasPicture;
  }
}

const them = () => (app.me === "A" ? "B" : "A");
const canAct = () => app.game.phase !== "over" && (app.mode === "local" || app.game.turn === app.me);

function headline() {
  const g = app.game;
  const local = app.mode === "local";
  const turnName = g.names[g.turn];
  if (g.phase === "over") return [local || g.winner !== app.me ? `${g.names[g.winner]} wins` : "You win", "Tap New game to play again."];
  const mine = !local && g.turn === app.me;
  const who = mine ? "Your turn" : `${turnName}'s turn`;
  if (g.phase === "opening") {
    return [who, `${mine ? "Throw" : "Throwing"} for the start. The first ${RULES.opening.throwNeeded} begins.`];
  }
  if (g.pending) {
    const what = g.pending.leftover ? `Leftover ${g.pending.value}` : `${mine ? "You threw" : "Threw"} ${g.pending.value}`;
    return [what, mine || local ? "Tap the piece to move." : `${turnName} is choosing a move.`];
  }
  return [who, mine || local ? "Throw the sticks." : g.log[g.log.length - 2] || ""];
}

function setFlash(text) {
  app.flash = text;
  clearTimeout(app.flashTimer);
  app.flashTimer = setTimeout(() => { app.flash = null; if (app.inGame) update(); }, 2600);
  update();
}

function dots(count, side) {
  return count ? `<i class="dot ${side === "dark" ? "dark" : ""}"></i>`.repeat(count) : "none";
}

function update() {
  const g = app.game;
  const me = app.me, op = them();
  const [head, sub] = headline();
  $("#headline").textContent = head;
  const subEl = $("#sub");
  const lost = app.mode !== "local" && app.conn !== "connected";
  subEl.textContent = app.flash || (lost ? "Connection lost. Trying to get it back…" : sub);
  subEl.classList.toggle("warn", !!app.flash || lost);

  for (const [who, key] of [[me, "me"], [op, "them"]]) {
    const side = g.colour[who];
    $(`#${key}-name`).textContent = g.names[who] + (app.mode !== "local" && who === me ? " (you)" : "");
    $(`#${key}-dot`).className = `dot ${side === "dark" ? "dark" : side ? "" : "none"}`;
    $(`#${key}-initial`).textContent = (g.names[who][0] || "?").toUpperCase();
    $(`#off-${key}-label`).textContent = `${g.names[who]} off`;
    $(`#off-${key}`).innerHTML = side ? dots(g.off[side], side) : "none";
  }

  const sticks = [...document.querySelectorAll(".stick")];
  const thrown = g.lastThrow && g.lastThrow.sticks && g.lastThrow.sticks.length === sticks.length;
  sticks.forEach((el, i) => { el.className = `stick ${thrown ? (g.lastThrow.sticks[i] ? "" : "dark") : "idle"}`; });
  $("#val").textContent = g.lastThrow ? g.lastThrow.value : "";

  const btn = $("#throw");
  if (g.phase === "over") { btn.textContent = "New game"; btn.disabled = false; }
  else { btn.textContent = "Throw sticks"; btn.disabled = !canAct() || !!g.pending; }

  document.querySelectorAll(".cell.last").forEach((el) => el.classList.remove("last"));
  if (g.lastMove) for (const n of [g.lastMove.from, g.lastMove.to]) {
    const cell = n && $(`.cell[data-n="${n}"]`);
    if (cell) cell.classList.add("last");
  }
  syncPieces();
}

// Keep one element per piece so pieces slide between squares.
function syncPieces() {
  const board = $("#board");
  const g = app.game;
  for (const side of ["light", "dark"]) {
    const want = [];
    for (let n = 1; n <= RULES.squares; n++) if (g.board[n] === side) want.push(n);
    const mine = app.pieces.filter((p) => p.side === side);
    const lost = mine.filter((p) => !want.includes(p.sq));
    const gained = want.filter((n) => !mine.some((p) => p.sq === n));
    lost.forEach((p, i) => {
      if (i < gained.length) { p.sq = gained[i]; return; }
      p.el.classList.add("gone");
      setTimeout(() => p.el.remove(), 350);
      app.pieces = app.pieces.filter((q) => q !== p);
    });
    gained.slice(lost.length).forEach((n) => {
      const el = document.createElement("div");
      el.className = `piece ${side}`;
      el.innerHTML = "<i></i>";
      board.appendChild(el);
      app.pieces.push({ id: app.nextPieceId++, side, sq: n, el });
    });
  }
  for (const p of app.pieces) {
    const { col, row } = place(p.sq);
    p.el.style.left = `calc((100% + 3px) / 3 * ${col})`;
    p.el.style.top = `calc((100% + 3px) / 10 * ${row})`;
  }
}

// Sounds and animation for whatever just happened.
function react() {
  const fx = app.game.fx || [];
  if (fx.includes("throw")) {
    sound.throwSticks();
    const el = $("#sticks");
    if (el) { el.classList.remove("toss"); void el.offsetWidth; el.classList.add("toss"); }
  }
  for (const name of ["move", "swap", "waters", "off", "win"]) if (fx.includes(name)) sound[name]();
}

function save() {
  if (app.mode === "host") store.set("senet-game-" + app.room, JSON.stringify(app.game));
}

function commit(next) {
  if (next === app.game) return;
  app.game = next;
  save();
  if (app.net) app.net.send({ t: "state", game: next });
  react();
  update();
}

function tapCell(n) {
  if (!canAct()) return setFlash(app.game.phase === "over" ? "The game is over." : "Wait for your turn.");
  const reason = explainTap(app.game, n);
  if (!reason) return commit(applyMove(app.game, n));
  sound.nope();
  const piece = app.pieces.find((p) => p.sq === n);
  if (piece) { piece.el.classList.remove("shake"); void piece.el.offsetWidth; piece.el.classList.add("shake"); }
  setFlash(reason);
}

function showRules() {
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.innerHTML = `<h2>Rules</h2><ol>${rulesSummary().map((line) => `<li>${esc(line)}</li>`).join("")}</ol>
    <button class="btn gold" data-act="close-rules">Back to the game</button>`;
  root.appendChild(sheet);
}

function toggleTrack(kind, button) {
  if (!app.stream) return setFlash("Camera and microphone are off for this game.");
  const tracks = kind === "mic" ? app.stream.getAudioTracks() : app.stream.getVideoTracks();
  if (!tracks.length) return;
  const on = !tracks[0].enabled;
  tracks.forEach((t) => { t.enabled = on; });
  button.classList.toggle("off", !on);
  button.setAttribute("aria-label", kind === "mic" ? (on ? "Mute microphone" : "Unmute microphone") : (on ? "Turn camera off" : "Turn camera on"));
}

const actions = {
  host: () => startHost(false),
  resume: () => startHost(true),
  guest: startGuest,
  local: startLocal,
  rules: showRules,
  "close-rules": () => $(".sheet").remove(),
  hear: (button) => { $("#them-video").play(); button.hidden = true; },
  mic: (button) => toggleTrack("mic", button),
  cam: (button) => toggleTrack("cam", button),
  share: async () => {
    const data = { title: "Senet", text: "Play Senet with me", url: inviteLink() };
    if (navigator.share) { try { await navigator.share(data); } catch (e) { /* cancelled */ } }
    else actions.copy();
  },
  copy: async () => {
    try { await navigator.clipboard.writeText(inviteLink()); $("#lobby-note").textContent = "Link copied. Waiting for them to join…"; }
    catch (e) { $("#lobby-note").textContent = "Couldn't copy. Press and hold the link to copy it."; }
  },
  throw: () => {
    const g = app.game;
    if (g.phase === "over") return commit(newGame(g.names));
    if (!canAct()) return setFlash("Wait for your turn.");
    commit(throwSticks(g));
  },
};

root.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (cell) return tapCell(Number(cell.dataset.n));
  const button = event.target.closest("[data-act]");
  if (button && actions[button.dataset.act]) actions[button.dataset.act](button);
});

showHome();
