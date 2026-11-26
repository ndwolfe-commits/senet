// ============================================================================
// LINK BETWEEN THE TWO PHONES
// ----------------------------------------------------------------------------
// Game moves go through a public message relay (MQTT). A relay works on any
// network, and it keeps the latest game state, so a player who switches apps
// or reloads picks the game straight back up.
//
// Video and sound go phone to phone (PeerJS). That is best effort: if the two
// networks block a direct link, the game still works without the picture.
// ============================================================================

const RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const PING_EVERY = 4000;
const SEEN_FOR = 11000; // the other player counts as present this long after their last message
const CALL_RETRY = 12000;
const CALL_TRIES = 6;

// Servers that help two phones find a route to each other for video.
const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
    { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
  ],
};

export function createNet({ room, me, getPing, stream, onMessage, onPeerStream, onStatus, onCallState = () => {} }) {
  const other = me === "A" ? "B" : "A";
  const topicOut = `senet-nw/${room}/${me}`;
  const topicIn = `senet-nw/${room}/${other}`;
  const tag = Math.random().toString(36).slice(2, 8);
  const seenIds = new Set();
  let lastSeen = 0;
  let closed = false;
  let lastStatus = "";
  let peerHasMedia = false;

  // ---------------------------------------------------------- game relay ---
  const clients = RELAYS.map((url, i) => {
    const c = mqtt.connect(url, {
      clientId: `senet-${room}-${me}-${tag}-${i}`,
      keepalive: 20, reconnectPeriod: 2000, connectTimeout: 8000, clean: true,
    });
    c.on("connect", () => { c.subscribe(topicIn, { qos: 1 }); ping(); report(); });
    c.on("close", report);
    c.on("error", () => {});
    c.on("message", (topic, payload, packet) => {
      let msg;
      try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
      if (!msg || seenIds.has(msg.id)) return;
      seenIds.add(msg.id);
      if (seenIds.size > 500) seenIds.delete(seenIds.values().next().value);
      if (!packet.retain) { // a stored message doesn't prove they're here now
        lastSeen = Date.now();
        if (msg.t === "ping") peerHasMedia = !!msg.hasMedia;
        report();
        maybeCall();
      }
      onMessage(msg, { stored: !!packet.retain });
    });
    return c;
  });

  function publish(msg, retain) {
    const body = JSON.stringify({ ...msg, id: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
    for (const c of clients) if (c.connected) c.publish(topicOut, body, { qos: 1, retain: !!retain });
  }
  function ping() { publish({ t: "ping", hasMedia: !!stream, ...getPing() }); }

  function report() {
    if (closed) return;
    const link = clients.some((c) => c.connected);
    const peer = Date.now() - lastSeen < SEEN_FOR;
    const status = !link ? "offline" : peer ? "connected" : "alone";
    if (status !== lastStatus) { lastStatus = status; onStatus(status); }
  }

  const pingTimer = setInterval(() => { ping(); report(); }, PING_EVERY);

  function wake() {
    if (closed || document.visibilityState !== "visible") return;
    for (const c of clients) if (!c.connected) c.reconnect();
    ping();
    if (peer && peer.disconnected && !peer.destroyed) peer.reconnect();
  }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);

  // -------------------------------------------------------- video and sound ---
  const myPeerId = `senet-nw-${room}-${me}`;
  const otherPeerId = `senet-nw-${room}-${other}`;
  let peer = null;
  let gotRemote = false;
  let callTries = 0;
  let callTimer = null;
  let peerTimer = null;

  // Follow one call and report, in plain steps, how far it got:
  // "calling" -> "checking" -> "connected", or "failed".
  function wireCall(call) {
    if (!call) return;
    onCallState("calling");
    call.on("stream", (remote) => onPeerStream(remote));
    call.on("close", () => { gotRemote = false; });
    call.on("error", () => onCallState("failed"));
    const watch = () => {
      const pc = call.peerConnection;
      if (!pc) return setTimeout(watch, 300);
      const report = () => {
        const state = pc.iceConnectionState;
        if (state === "connected" || state === "completed") { gotRemote = true; callTries = 0; onCallState("connected"); }
        else if (state === "failed") { gotRemote = false; onCallState("failed"); try { call.close(); } catch (e) { /* gone */ } maybeCall(); }
        else if (state === "disconnected") { onCallState("dropped"); }
        else onCallState("checking");
      };
      pc.addEventListener("iceconnectionstatechange", report);
      report();
    };
    watch();
  }

  function startPeer() {
    if (closed || typeof Peer === "undefined") return;
    if (peer && !peer.destroyed) peer.destroy();
    peer = new Peer(myPeerId, { config: ICE });
    const mine = peer;
    peer.on("open", maybeCall);
    peer.on("call", (call) => { call.answer(stream || undefined); wireCall(call); });
    peer.on("disconnected", () => { if (!closed && mine === peer && !mine.destroyed) mine.reconnect(); });
    peer.on("error", () => {
      if (closed || mine !== peer) return;
      if (mine.destroyed) { clearTimeout(peerTimer); peerTimer = setTimeout(startPeer, 3000); }
    });
  }

  // Who rings whom: the guest rings if they have a camera or mic; if not, the host does.
  function iAmCaller() {
    if (!stream) return false;
    return me === "B" || !peerHasMedia;
  }

  function maybeCall() {
    if (closed || gotRemote || !peer || !peer.open || !iAmCaller()) return;
    if (Date.now() - lastSeen > SEEN_FOR || callTimer || callTries >= CALL_TRIES) return;
    callTries += 1;
    wireCall(peer.call(otherPeerId, stream));
    callTimer = setTimeout(() => { callTimer = null; maybeCall(); }, CALL_RETRY);
  }

  startPeer(); // even without a camera we can still receive theirs

  return {
    // Send the game. It is stored by the relay so the other phone gets it even if it's asleep.
    sendState(game) { publish({ t: "state", game }, true); },
    close() {
      closed = true;
      clearInterval(pingTimer);
      clearTimeout(callTimer);
      clearTimeout(peerTimer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      for (const c of clients) c.end(true);
      if (peer) peer.destroy();
    },
  };
}

export function newRoomCode() {
  const letters = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}
