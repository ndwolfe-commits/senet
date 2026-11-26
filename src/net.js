// Connection between the two phones: game messages plus the video call.
// Uses PeerJS (vendor/peerjs.min.js), which links the two browsers directly.
//
// Phones drop connections all the time (switching apps to send the link,
// locking the screen), so this file keeps trying until the link is back.

const PREFIX = "senet-nw-";
const OPEN_TIMEOUT = 8000; // how long the guest waits for a link before retrying
const RETRY = 2500;

export function createNet({ room, isHost, stream, onMessage, onPeerStream, onStatus }) {
  const hostId = PREFIX + room;
  let peer = null;
  let conn = null;
  let closed = false;
  let timer = null;
  let openTimer = null;
  let takenCount = 0;

  const later = (fn, ms = RETRY) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

  function wireCall(call) {
    if (!call) return;
    call.on("stream", (remote) => onPeerStream(remote));
  }

  function wireConn(c) {
    if (conn && conn !== c) try { conn.close(); } catch (e) { /* already gone */ }
    conn = c;
    c.on("open", () => {
      clearTimeout(openTimer);
      onStatus("connected");
      if (!isHost && stream) wireCall(peer.call(hostId, stream));
    });
    c.on("data", (msg) => {
      // If the guest has no camera or mic, the host starts the call instead.
      if (isHost && msg.t === "hello" && !msg.hasMedia && stream) wireCall(peer.call(c.peer, stream));
      onMessage(msg);
    });
    c.on("close", () => {
      if (conn !== c || closed) return;
      onStatus("lost");
      if (!isHost) later(join);
    });
  }

  function join() {
    if (closed || isHost) return;
    if (!peer || peer.destroyed) return start();
    if (peer.disconnected) { peer.reconnect(); return later(join); }
    onStatus("joining");
    const c = peer.connect(hostId, { reliable: true });
    wireConn(c);
    clearTimeout(openTimer);
    openTimer = setTimeout(() => {
      if (closed || c.open) return;
      onStatus("retrying");
      try { c.close(); } catch (e) { /* already gone */ }
      join();
    }, OPEN_TIMEOUT);
  }

  function start() {
    if (closed) return;
    if (peer && !peer.destroyed) peer.destroy();
    peer = isHost ? new Peer(hostId) : new Peer();
    const mine = peer;
    peer.on("open", () => {
      takenCount = 0;
      if (isHost) onStatus(conn && conn.open ? "connected" : "waiting");
      else join();
    });
    peer.on("connection", (c) => wireConn(c));
    peer.on("call", (call) => { call.answer(stream || undefined); wireCall(call); });
    peer.on("disconnected", () => { if (!closed && mine === peer && !mine.destroyed) mine.reconnect(); });
    peer.on("error", (err) => {
      if (closed || mine !== peer) return;
      if (!isHost && err.type === "peer-unavailable") {
        clearTimeout(openTimer);
        onStatus("nohost");
        return later(join, 3000);
      }
      if (isHost && err.type === "unavailable-id") {
        // Usually our own old connection that the server hasn't dropped yet.
        takenCount += 1;
        if (takenCount > 6) return onStatus("taken");
        return later(start, 3000);
      }
      onStatus("error", err.type);
      if (mine.destroyed) later(start);
    });
  }

  // Coming back to the page (after sending the link, say): make sure we're
  // still reachable.
  function wake() {
    if (closed || document.visibilityState !== "visible") return;
    if (!peer || peer.destroyed) return start();
    if (peer.disconnected) peer.reconnect();
    if (!isHost && !(conn && conn.open)) later(join, 500);
  }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);

  start();

  return {
    send(msg) { if (conn && conn.open) conn.send(msg); },
    close() {
      closed = true;
      clearTimeout(timer);
      clearTimeout(openTimer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      if (peer) peer.destroy();
    },
  };
}

export function newRoomCode() {
  const letters = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}
