// Connection between the two phones: game messages plus the video call.
// Uses PeerJS (vendor/peerjs.min.js), which links the two browsers directly.

const PREFIX = "senet-nw-";

export function createNet({ room, isHost, stream, onMessage, onPeerStream, onStatus }) {
  const hostId = PREFIX + room;
  const peer = isHost ? new Peer(hostId) : new Peer();
  let conn = null;
  let retry = null;
  let closed = false;

  function wireCall(call) {
    if (!call) return;
    call.on("stream", (remote) => onPeerStream(remote));
  }

  function wireConn(c) {
    if (conn && conn !== c) try { conn.close(); } catch (e) { /* already gone */ }
    conn = c;
    c.on("open", () => {
      onStatus("connected");
      if (!isHost && stream) wireCall(peer.call(hostId, stream));
    });
    c.on("data", (msg) => {
      // If the guest has no camera or mic, the host starts the call instead.
      if (isHost && msg.t === "hello" && !msg.hasMedia && stream) wireCall(peer.call(c.peer, stream));
      onMessage(msg);
    });
    c.on("close", () => { if (conn === c && !closed) onStatus("lost"); });
  }

  function join() {
    if (closed) return;
    wireConn(peer.connect(hostId, { reliable: true }));
  }

  peer.on("open", () => {
    onStatus(isHost ? "waiting" : "joining");
    if (!isHost) join();
  });
  peer.on("connection", (c) => wireConn(c));
  peer.on("call", (call) => { call.answer(stream || undefined); wireCall(call); });
  peer.on("disconnected", () => { if (!closed) peer.reconnect(); });
  peer.on("error", (err) => {
    if (!isHost && err.type === "peer-unavailable") {
      onStatus("nohost");
      clearTimeout(retry);
      retry = setTimeout(join, 3000);
    } else if (isHost && err.type === "unavailable-id") {
      onStatus("taken");
    } else {
      onStatus("error", err.type);
    }
  });

  return {
    send(msg) { if (conn && conn.open) conn.send(msg); },
    close() { closed = true; clearTimeout(retry); peer.destroy(); },
  };
}

export function newRoomCode() {
  const letters = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}
