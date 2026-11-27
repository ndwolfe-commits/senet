// ============================================================================
// CONNECTION CHECK
// ----------------------------------------------------------------------------
// Tests, one at a time, each thing a game with faces and voice needs, and
// reports each as "ok", "warn" or "bad" with one plain sentence.
// ============================================================================

import { RELAYS, loadIce, hasRelay } from "./net.js?v=19";

// Apps like Facebook, Instagram and some messengers open links in their own
// cut-down browser, which often can't use the camera.
export function insideAnotherApp() {
  const ua = navigator.userAgent || "";
  const m = ua.match(/FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|LinkedInApp|Twitter|TikTok|musical_ly|GSA\/|WhatsApp/i);
  if (m) return /^FB/i.test(m[0]) ? "Facebook" : /GSA/i.test(m[0]) ? "the Google app" : /Instagram|WhatsApp|Snapchat|TikTok/i.test(m[0]) ? m[0] : "an app";
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return "an app";
  return "";
}

export function deviceLine() {
  const ua = navigator.userAgent || "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Other";
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /Edg/.test(ua) ? "Edge" : /Safari/.test(ua) ? "Safari" : "Unknown browser";
  return `${os}, ${browser}`;
}

function gather(config, wanted, ms) {
  return new Promise((done) => {
    let pc;
    try { pc = new RTCPeerConnection(config); } catch (e) { return done(false); }
    let found = false;
    const finish = () => { try { pc.close(); } catch (e) { /* gone */ } done(found); };
    const timer = setTimeout(finish, ms);
    pc.onicecandidate = (e) => {
      if (e.candidate && e.candidate.candidate.includes(` typ ${wanted}`)) { found = true; clearTimeout(timer); finish(); }
      if (!e.candidate) { clearTimeout(timer); finish(); }
    };
    pc.createDataChannel("check");
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(finish);
  });
}

function relayReachable(ms) {
  return new Promise((done) => {
    let left = RELAYS.length, ok = false;
    const clients = RELAYS.map((url) => {
      const c = mqtt.connect(url, { clientId: `senet-check-${Math.random().toString(36).slice(2, 10)}`, connectTimeout: ms, reconnectPeriod: 0 });
      const end = (good) => { if (good) ok = true; left -= 1; try { c.end(true); } catch (e) { /* gone */ } if (ok || left <= 0) finish(); };
      c.on("connect", () => end(true));
      c.on("error", () => end(false));
      c.on("close", () => end(false));
      return c;
    });
    let finished = false;
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); clients.forEach((c) => { try { c.end(true); } catch (e) { /* gone */ } }); done(ok); };
    const timer = setTimeout(finish, ms + 500);
  });
}

// Runs every test. `tell(key, state, text)` is called as each one finishes.
export async function runChecks(tell) {
  const app = insideAnotherApp();
  tell("browser", app ? "warn" : "ok", app ? `Opened inside ${app === "an app" ? "another app" : app}. Open it in Safari or Chrome instead.` : deviceLine());

  // The network tests don't wait for the camera question to be answered.
  await Promise.all([devices(tell), network(tell)]);
}

async function devices(tell) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    tell("camera", "bad", "This browser can't use the camera. Use Safari or Chrome.");
    tell("mic", "bad", "This browser can't use the microphone.");
  } else {
    for (const [key, ask, word] of [["camera", { video: true }, "camera"], ["mic", { audio: true }, "microphone"]]) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(ask);
        s.getTracks().forEach((t) => t.stop());
        tell(key, "ok", "Working");
      } catch (e) {
        const why = e && e.name === "NotAllowedError" ? `Not allowed. Allow the ${word} for this page in your browser settings.`
          : e && e.name === "NotFoundError" ? `No ${word} found.`
          : e && e.name === "NotReadableError" ? `Another app is using the ${word}.` : `Couldn't start the ${word}.`;
        tell(key, "bad", why);
      }
    }
  }

}

async function network(tell) {
  tell("game", (await relayReachable(7000)) ? "ok" : "bad", "");
  if (typeof RTCPeerConnection === "undefined") {
    tell("direct", "bad", "This browser can't make video calls.");
    tell("relay", "bad", "");
    return;
  }
  const ice = await loadIce();
  const stunOnly = { iceServers: ice.iceServers.filter((s) => [].concat(s.urls).every((u) => u.startsWith("stun"))) };
  tell("direct", (await gather(stunOnly, "srflx", 6000)) ? "ok" : "warn", "");
  if (!hasRelay()) tell("relay", "warn", "Not set up yet. Faces work on most home WiFi, but not on every network.");
  else tell("relay", (await gather({ ...ice, iceTransportPolicy: "relay" }, "relay", 8000)) ? "ok" : "bad", "");
}
