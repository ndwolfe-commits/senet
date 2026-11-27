// ============================================================================
// SENET SCREEN
// ----------------------------------------------------------------------------
// Draws the game and handles taps. All game decisions are made by engine.js;
// this file only shows the state and passes actions on.
// ============================================================================

import { RULES, rulesSummary } from "./rules.js";
import { newGame, throwSticks, applyMove, explainTap, legalMoves } from "./engine.js";
import { createNet, newRoomCode } from "./net.js?v=18";
import { sound } from "./sound.js?v=18";
import { fireworks } from "./fireworks.js";
import { runChecks, insideAnotherApp, deviceLine } from "./check.js?v=18";

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
  selected: null, // the move being previewed: tap once to see it, again to make it
};
const root = $("#app");

const ICON = {
  mic: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  eye: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
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
  const last = lastGame();
  // An invite link for a game that isn't ours: offer to join it.
  const joining = app.room && !(last && last.room === app.room);
  const resumable = !joining && last && !last.over;
  const opponent = resumable ? last.names[last.me === "A" ? "B" : "A"] : "";
  const otherApp = insideAnotherApp();
  root.innerHTML = `
    <div class="home">
      <h1>SENET</h1>
      <p>${joining ? "You've been invited to a game." : "The game of passing, for two players."}</p>
      <label class="field">Your name
        <input id="name" maxlength="14" autocomplete="given-name" value="${esc(name)}" placeholder="Nathan">
      </label>
      ${joining ? '<button class="btn gold" data-act="guest">Join game</button>' : ""}
      ${resumable ? `<button class="btn gold" data-act="resume">Continue game with ${esc(opponent)}</button>` : ""}
      ${!joining ? `<button class="btn ${resumable ? "plain" : "gold"}" data-act="host">Play online: send a link</button>` : ""}
      <button class="btn plain" data-act="local">Two players on this phone</button>
      <div class="row">
        <button class="btn plain" data-act="film">How to play: 3-minute film</button>
        <button class="btn plain" data-act="check">Check my connection</button>
      </div>
      ${otherApp ? `<div class="warnbox">This page is open inside ${otherApp === "an app" ? "another app" : esc(otherApp)}, where the camera often doesn't work. Open it in ${/Android/.test(navigator.userAgent) ? "Chrome" : "Safari"} instead.
        <div class="row"><button class="btn gold" data-act="open-out">Open in ${/Android/.test(navigator.userAgent) ? "Chrome" : "Safari"}</button><button class="btn plain" data-act="copy-here">Copy link</button></div></div>` : ""}
      <p id="home-note">${esc(note) || "You'll be asked for your camera and microphone so you can see and hear each other."}</p>
      <p>Version ${VERSION}</p>
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
    <button class="btn gold" data-act="whatsapp">Send by WhatsApp</button>
    <div class="row">
      <button class="btn plain" data-act="share">Another way</button>
      <button class="btn plain" data-act="copy">Copy link</button>
    </div>
    <p id="lobby-note">Connecting…</p>`);
}

// --------------------------------------------------------------- joining ---

async function getMedia() {
  if (params.has("novideo")) return null;
  if (!navigator.mediaDevices) { app.mediaOff = "missing"; return null; }
  const video = { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } };
  app.mediaOff = "";
  try { return await navigator.mediaDevices.getUserMedia({ audio: true, video }); } catch (e) { /* try sound only */ }
  try { return await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { app.mediaOff = e && e.name === "NotAllowedError" ? "refused" : "missing"; return null; }
}

const VERSION = 18;

function connect() {
  if (app.net) app.net.close();
  app.net = createNet({
    room: app.room,
    me: app.me,
    getPing: () => ({ name: app.name, rev: app.game ? app.game.rev || 0 : -1 }),
    stream: app.stream,
    onMessage,
    onPeerStream(remote) { app.peerStream = remote; attachVideo(); },
    onStatus,
    onCallState,
  });
}

function onStatus(status) {
  const was = app.conn;
  app.conn = status;
  // Whenever the link comes up, put our copy of the game on the relay.
  if (status !== "offline" && was !== status && app.game && app.mode === "host") app.net.sendState(app.game);
  const note = $("#lobby-note");
  if (note) {
    note.textContent = status === "offline" ? "No connection yet. Trying…"
      : app.mode === "host" ? "Waiting for them to join…"
      : "Connected. Fetching the game…";
  }
  if (app.inGame) update();
}

function adopt(game) {
  const first = !app.inGame;
  app.selected = null;
  app.game = game;
  save();
  app.net.sendState(game); // keep our stored copy on the relay up to date too
  if (first) { if (app.mode === "guest" || app.game.phase !== "opening") showGame(); } else { react(); update(); }
}

function onMessage(msg, { stored }) {
  if (msg.t === "state" && msg.game) {
    const mine = app.game ? app.game.rev || 0 : -1;
    if ((msg.game.rev || 0) > mine) adopt(msg.game);
    return;
  }
  if (msg.t !== "ping" || stored) return;
  // They're behind us (they reloaded, say): send them the game again.
  if (app.game && typeof msg.rev === "number" && msg.rev < (app.game.rev || 0)) app.net.sendState(app.game);
  if (app.mode === "host") {
    // The guest is here: record their name, show the board, and send the game.
    const named = msg.name && app.game.names.B !== msg.name;
    if (named) app.game = { ...app.game, names: { ...app.game.names, B: msg.name }, rev: (app.game.rev || 0) + 1, fx: [] };
    if (named || !app.inGame) { save(); app.net.sendState(app.game); }
    if (!app.inGame) showGame(); else if (named) update();
  }
}

async function startHost(resume) {
  app.mode = "host";
  app.me = "A";
  app.name = myName("Player 1");
  if (!resume) app.room = newRoomCode();
  history.replaceState(null, "", `?room=${app.room}${params.has("novideo") ? "&novideo=1" : ""}`);
  app.game = (resume && savedGame(app.room)) || newGame({ A: app.name, B: "Player 2" });
  save();
  showLobby("<p>Getting your camera ready…</p>");
  app.stream = await getMedia();
  // Resuming a game that's already under way: go straight to the board.
  if (resume && app.game.phase !== "opening") showGame(); else showInvite();
  connect();
}

async function startGuest() {
  app.mode = "guest";
  app.me = "B";
  app.name = myName("Player 2");
  showLobby("<p>Getting your camera ready…</p>");
  app.stream = await getMedia();
  app.game = savedGame(app.room);
  if (app.game) showGame(); else showLobby('<p id="lobby-note">Joining the game…</p>');
  connect();
}

// Pick up the last online game, as whichever player we were.
function resumeLast() {
  const last = lastGame();
  if (!last) return showHome();
  app.room = last.room;
  if (last.me === "A") startHost(true); else startGuest();
}

function startLocal() {
  app.mode = "local";
  app.name = myName("Player 1");
  app.game = newGame({ A: app.name, B: "Player 2" });
  showGame();
}

// ------------------------------------------------------------------ game ---

function showGame() {
  window.scrollTo(0, 0);
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
    <div class="top"><div class="carved">SENET <span class="ver">v${VERSION}</span></div><button data-act="rules">Rules</button></div>
    <div class="game">
      <div class="frame"><div class="board" id="board">${cells}</div></div>
      <div class="side">
        <div class="tile them"><div class="initial" id="them-initial"></div><video id="them-video" autoplay playsinline muted hidden></video><audio id="them-audio" playsinline></audio><div class="vstat" id="vstat"></div>
          <div class="tag"><i class="dot" id="them-dot"></i><span id="them-name"></span></div>
          <button class="hear" data-act="hear" hidden>Tap to hear them</button></div>
        <div class="card status"><div class="carved" id="headline"></div><div class="sub" id="sub"></div></div>
        <div class="card sticks" id="sticks"><div class="set">${'<div class="stick idle"></div>'.repeat(RULES.sticks.count)}</div><div class="val" id="val"></div></div>
        <button class="btn gold" id="throw" data-act="throw">Throw sticks</button>
        <div class="card off"><div><span id="off-me-label"></span><span id="off-me"></span></div><div><span id="off-them-label"></span><span id="off-them"></span></div></div>
        <div class="tile me"><div class="initial" id="me-initial"></div><video id="me-video" autoplay playsinline muted hidden></video>
          <div class="tag"><i class="dot" id="me-dot"></i><span id="me-name"></span></div>
          ${remote ? `<div class="av"><button data-act="mic" aria-label="Mute microphone">${ICON.mic}</button><button data-act="cam" aria-label="Turn camera off">${ICON.cam}</button><button data-act="selfview" aria-label="Hide my own picture from me">${ICON.eye}</button></div>` : ""}
        </div>
      </div>
    </div>`;
  attachVideo();
  if (app.call) onCallState(app.call);
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
      if (playing) playing.catch(() => {});
    }
    // You can hide your own picture from yourself; the other player still sees you.
    const show = hasPicture && !(vSel === "#me-video" && store.get("senet-hide-self") === "1");
    video.hidden = !show;
    $(iSel).hidden = !!show;
  }
  const eye = $('[data-act="selfview"]');
  if (eye) {
    const hidden = store.get("senet-hide-self") === "1";
    eye.classList.toggle("off", hidden);
    eye.setAttribute("aria-label", hidden ? "Show my own picture to me" : "Hide my own picture from me");
  }
  soundNote();
}

// Their picture plays silently in the video tile. Their voice plays through a
// separate audio element that carries only the sound, started by a tap,
// because phones refuse to start sound without one.
function wakeSound() {
  const remote = app.peerStream;
  const audio = $("#them-audio");
  if (!remote || !audio) return;
  const tracks = remote.getAudioTracks();
  if (!tracks.length) { app.sound = "none"; return soundNote(); }
  if (!audio.srcObject || audio.srcObject.getAudioTracks()[0] !== tracks[0]) {
    audio.srcObject = new MediaStream(tracks);
    tracks[0].onmute = soundNote;
    tracks[0].onunmute = soundNote;
    app.sound = "";
  }
  if (app.sound === "on" && !audio.paused) return;
  audio.muted = false;
  audio.volume = 1;
  const playing = audio.play();
  const ok = () => { app.sound = "on"; soundNote(); };
  if (playing) playing.then(ok).catch(() => { app.sound = "blocked"; soundNote(); });
  else ok();
}

const CALL_TEXT = {
  calling: "Starting video…",
  checking: "Connecting video…",
  connected: "",
  dropped: "Video dropped. Reconnecting…",
  failed: "Faces not connecting. Trying again…",
  blocked: "Faces can't connect on this network. The game still works.",
};

// One line on their tile saying where video and sound have got to.
function soundNote() {
  const el = $("#vstat");
  if (!el) return;
  let text = CALL_TEXT[app.call] || "";
  if (app.call === "connected") {
    const track = app.peerStream && app.peerStream.getAudioTracks()[0];
    if (!track || app.sound === "none") text = "Their microphone isn't on";
    else if (app.sound !== "on") text = "Tap anywhere to turn sound on";
    else if (track.muted || track.readyState === "ended") text = "No sound coming from their phone";
  }
  if (!text && app.mediaOff && app.mode !== "local") {
    text = app.mediaOff === "refused" ? "Your camera and mic are not allowed. Allow them in your browser settings, then reload." : "Your camera and mic aren't available in this browser.";
  }
  el.textContent = text;
}

function onCallState(state) {
  app.call = state;
  soundNote();
}

// Phones cut the camera and microphone when you leave the page (to send the
// link, say). On coming back, check them and start fresh ones if they died.
async function refreshMedia() {
  if (!app.inGame || app.mode === "local" || !app.stream || document.visibilityState !== "visible") return;
  await new Promise((done) => setTimeout(done, 1500));
  const dead = app.stream.getTracks().some((t) => t.readyState === "ended" || (t.kind === "audio" && t.muted));
  if (!dead) return;
  const fresh = await getMedia();
  if (!fresh) return;
  app.stream.getTracks().forEach((t) => t.stop());
  app.stream = fresh;
  app.net.replaceStream(fresh);
  document.querySelectorAll(".av button").forEach((b) => b.classList.remove("off"));
  attachVideo();
}
document.addEventListener("visibilitychange", refreshMedia);

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
    return [what, mine || local ? "Tap pieces to try them out." : `${turnName} is choosing a move.`];
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
  const remote = app.mode !== "local";
  const lost = remote && app.conn !== "connected";
  const lostText = app.conn === "offline" ? "No connection. Trying to get it back…"
    : `${g.names[op]} isn't on the game page right now. Waiting for them…`;
  const sel = app.selected;
  subEl.textContent = app.flash || (sel ? previewText(sel) : lost ? lostText : sub);
  subEl.classList.toggle("warn", !!app.flash || (lost && !sel));

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
  else if (app.selected) { btn.textContent = "Move"; btn.disabled = false; }
  else if (g.pending && canAct()) { btn.textContent = "Tap a piece"; btn.disabled = true; }
  else { btn.textContent = "Throw sticks"; btn.disabled = !canAct() || !!g.pending; }

  syncPieces();

  // Show the last move: a faint ring where the piece came from, and one soft
  // pulse on the piece where it landed.
  document.querySelectorAll(".cell.from").forEach((el) => el.classList.remove("from", "from-dark"));
  const lm = g.lastMove;
  if (lm && lm.from) {
    const moved = lm.to ? app.pieces.find((p) => p.sq === lm.to) : null;
    const cell = $(`.cell[data-n="${lm.from}"]`);
    if (cell && !g.board[lm.from]) {
      cell.classList.add("from");
      if (moved ? moved.side === "dark" : g.colour[g.turn] !== "dark") cell.classList.add("from-dark");
    }
    const key = `${g.rev || 0}:${lm.from}:${lm.to}`;
    if (moved && app.lastPulse !== key) {
      app.lastPulse = key;
      moved.el.classList.remove("landed"); void moved.el.offsetWidth; moved.el.classList.add("landed");
    }
  }

  document.querySelectorAll(".cell.target, .cell.target2").forEach((el) => el.classList.remove("target", "target2"));
  for (const p of app.pieces) p.el.classList.toggle("picked", !!sel && p.sq === sel.from);
  if (sel && sel.to !== "off") {
    $(`.cell[data-n="${sel.to}"]`).classList.add("target");
    if (sel.waters) $(`.cell[data-n="${sel.finalTo}"]`).classList.add("target2");
  }
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
  for (const name of ["move", "swap", "waters", "off"]) if (fx.includes(name)) sound[name]();
  if (fx.includes("win")) celebrate();
}

// The winner gets fireworks. The loser gets a raspberry.
function celebrate() {
  const g = app.game;
  const iWon = app.mode === "local" || g.winner === app.me;
  const banner = document.createElement("div");
  banner.className = `banner ${iWon ? "" : "lost"}`;
  if (iWon) {
    banner.innerHTML = `<div class="carved">${app.mode === "local" ? esc(g.names[g.winner]) + " wins!" : "You win!"}</div>`;
    fireworks(root);
    sound.win();
  } else {
    banner.innerHTML = `<div class="carved">Pfffffft!</div><div>${esc(g.names[g.winner])} wins.</div>`;
    sound.raspberry();
    cryingFace();
  }
  root.appendChild(banner);
  setTimeout(() => banner.remove(), 5200);
}

// The loser's own face (their live camera) bounces around the screen in tears.
function cryingFace(seconds = 8) {
  const box = document.createElement("div");
  box.className = "cry";
  const hasCamera = app.stream && app.stream.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
  box.innerHTML = `<div class="face">${hasCamera ? "<video autoplay playsinline muted></video>"
    : `<span class="carved">${esc((app.game.names[app.me][0] || "?").toUpperCase())}</span>`}</div>
    <i class="tear"></i><i class="tear right"></i><i class="tear late"></i><i class="tear right late"></i>`;
  root.appendChild(box);
  if (hasCamera) { const v = $("video", box); v.srcObject = app.stream; v.play().catch(() => {}); }
  const size = 124;
  let x = 30, y = 60, vx = 2.6, vy = 2.1;
  const start = performance.now();
  function step(now) {
    const w = root.clientWidth - size, h = root.clientHeight - size - 40;
    x += vx; y += vy;
    if (x < 0 || x > w) { vx = -vx; x = Math.max(0, Math.min(w, x)); }
    if (y < 0 || y > h) { vy = -vy; y = Math.max(0, Math.min(h, y)); }
    box.style.transform = `translate(${x}px, ${y}px)`;
    if ((now - start) / 1000 < seconds && box.isConnected) requestAnimationFrame(step); else box.remove();
  }
  requestAnimationFrame(step);
}

// Every change is saved on this phone, so a crash or a closed app loses nothing.
function save() {
  if (app.mode === "local" || !app.room || !app.game) return;
  store.set("senet-game-" + app.room, JSON.stringify(app.game));
  store.set("senet-last", JSON.stringify({ room: app.room, me: app.me, names: app.game.names, over: app.game.phase === "over" }));
}

function lastGame() {
  try { return JSON.parse(store.get("senet-last")); } catch (e) { return null; }
}

function savedGame(room) {
  try { return JSON.parse(store.get("senet-game-" + room)); } catch (e) { return null; }
}

function commit(next) {
  if (next === app.game) return;
  next = { ...next, rev: (app.game.rev || 0) + 1 };
  app.selected = null;
  app.game = next;
  save();
  if (app.net) app.net.sendState(next);
  react();
  update();
}

// Tap any piece to see where it would go; tap others to compare. Nothing moves
// until you press the gold "Move" button (or tap the square it lands on).
function tapCell(n) {
  if (!canAct()) return setFlash(app.game.phase === "over" ? "The game is over." : "Wait for your turn.");
  const sel = app.selected;
  if (sel && (n === sel.to || n === sel.finalTo)) return commit(applyMove(app.game, sel.from));
  app.selected = null;
  if (sel && n === sel.from) return update(); // tapped the same piece: put it down
  const reason = explainTap(app.game, n);
  if (!reason) {
    app.selected = legalMoves(app.game).find((m) => m.from === n);
    app.flash = null;
    return update();
  }
  if (sel && !app.game.board[n]) return update(); // tapped an empty square: just cancel the preview
  sound.nope();
  const piece = app.pieces.find((p) => p.sq === n);
  if (piece) { piece.el.classList.remove("shake"); void piece.el.offsetWidth; piece.el.classList.add("shake"); }
  setFlash(reason);
}

function previewText(m) {
  if (m.to === "off") return "This piece would leave the board.";
  if (m.waters) return `Would fall in the Waters and go back to ${m.finalTo}.`;
  if (m.swap) return `Would swap places with the piece on ${m.to}.`;
  return `Would move ${m.dir < 0 ? "back " : ""}to ${m.to}.`;
}

function showRules() {
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.innerHTML = `<h2>Rules</h2><ol>${rulesSummary().map((line) => `<li>${esc(line)}</li>`).join("")}</ol>
    <button class="btn plain" data-act="film">Watch the 3-minute film</button>
    <button class="btn gold" data-act="close-rules">Back to the game</button>`;
  root.appendChild(sheet);
}

function showFilm() {
  const old = $(".sheet"); if (old) old.remove();
  const sheet = document.createElement("div");
  sheet.className = "sheet film";
  sheet.innerHTML = `<video src="film.mp4?v=${VERSION}" poster="film-poster.jpg" controls playsinline preload="metadata"></video>
    <button class="btn gold" data-act="close-rules">${app.inGame ? "Back to the game" : "Back"}</button>`;
  root.appendChild(sheet);
  const playing = $("video", sheet).play();
  if (playing) playing.catch(() => {});
}

const CHECKS = [["browser", "Browser"], ["camera", "Camera"], ["mic", "Microphone"], ["game", "Game link"], ["direct", "Faces: direct path"], ["relay", "Faces: relay for difficult networks"]];
const MARK = { ok: "✓", warn: "!", bad: "✕", wait: "…" };
function showCheck() {
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.innerHTML = `<h2>Connection check</h2>
    <div class="checks">${CHECKS.map(([key, label]) => `<div class="check wait" data-check="${key}"><b>${MARK.wait}</b><div><span>${label}</span><small></small></div></div>`).join("")}</div>
    <p id="check-sum">Testing… this takes about 20 seconds.</p>
    <div class="row"><button class="btn plain" data-act="copy-check">Copy results</button><button class="btn gold" data-act="close-rules">Back</button></div>`;
  root.appendChild(sheet);
  const got = {};
  runChecks((key, state, text) => {
    got[key] = { state, text };
    const row = $(`[data-check="${key}"]`, sheet);
    if (!row) return;
    row.className = `check ${state}`;
    $("b", row).textContent = MARK[state];
    $("small", row).textContent = text;
  }).then(() => {
    const bad = (k) => got[k] && got[k].state === "bad";
    const sum = $("#check-sum", sheet);
    if (!sum) return;
    sum.textContent = bad("game") ? "The game itself can't connect from here. Try another network."
      : bad("camera") || bad("mic") ? "You can play, but the other player won't see or hear you until the camera and microphone are allowed."
      : got.browser.state === "warn" ? "Open this page in Safari or Chrome for faces and voice."
      : got.direct.state !== "ok" && got.relay.state !== "ok" ? "You can play, but this network will probably block faces and voice."
      : got.relay.state !== "ok" ? "Ready to play. Faces and voice should work on this network, but may not if the other player's network is strict."
      : "Everything works.";
    app.checkText = `Senet v${VERSION} check (${deviceLine()})\n` + CHECKS.map(([key, label]) => `${MARK[got[key].state]} ${label}${got[key].text ? ": " + got[key].text : ""}`).join("\n") + `\n${sum.textContent}`;
  });
}

async function copyText(text, where, done) {
  try { await navigator.clipboard.writeText(text); if (where) where.textContent = done; }
  catch (e) { if (where) where.textContent = "Couldn't copy. Press and hold the text to copy it."; }
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
  resume: resumeLast,
  guest: startGuest,
  local: startLocal,
  rules: showRules,
  "close-rules": () => { const v = $(".sheet video"); if (v) v.pause(); $(".sheet").remove(); },
  film: showFilm,
  check: showCheck,
  "copy-check": () => copyText(app.checkText || "Still testing.", $("#check-sum"), "Results copied. Paste them into a message."),
  "copy-here": () => copyText(location.href, $("#home-note"), "Link copied. Paste it into Safari or Chrome."),
  // Hand the page over to the phone's real browser.
  "open-out": () => {
    const rest = location.host + location.pathname + location.search;
    location.href = /Android/.test(navigator.userAgent) ? `intent://${rest}#Intent;scheme=https;package=com.android.chrome;end` : `x-safari-https://${rest}`;
  },
  hear: () => wakeSound(),
  selfview: () => {
    const hidden = store.get("senet-hide-self") === "1";
    store.set("senet-hide-self", hidden ? "0" : "1");
    attachVideo();
    setFlash(hidden ? "You can see your own picture again." : "Your picture is hidden from you. They can still see you.");
  },
  mic: (button) => toggleTrack("mic", button),
  cam: (button) => toggleTrack("cam", button),
  // Opens WhatsApp itself with the message ready, so it sends straight away.
  whatsapp: () => { location.href = `whatsapp://send?text=${encodeURIComponent("Play Senet with me: " + inviteLink())}`; },
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
    if (app.selected) return commit(applyMove(g, app.selected.from));
    commit(throwSticks(g));
  },
};

root.addEventListener("click", (event) => {
  wakeSound();
  const cell = event.target.closest(".cell");
  if (cell) return tapCell(Number(cell.dataset.n));
  const button = event.target.closest("[data-act]");
  if (button && actions[button.dataset.act]) actions[button.dataset.act](button);
});

// iPhones can leave the page pushed down after the keyboard closes or the
// phone is turned. Put it back whenever that could have happened.
const settle = () => setTimeout(() => window.scrollTo(0, 0), 60);
root.addEventListener("focusout", settle);
window.addEventListener("orientationchange", settle);
window.addEventListener("resize", settle);
document.addEventListener("visibilitychange", settle);

// Phones hold on to old copies of the page for a while. On opening, ask the
// server which version is current and, if this copy is older, load the new one.
async function checkForUpdate() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    const latest = (await res.json()).version;
    if (latest > VERSION && params.get("fresh") !== String(latest) && !app.inGame) {
      const next = new URLSearchParams(location.search);
      next.set("fresh", latest);
      location.replace(`${location.pathname}?${next}`);
    }
  } catch (e) { /* offline: carry on with this copy */ }
}

window.__senet = { app, celebrate }; // for testing from the browser console

showHome();
checkForUpdate();
