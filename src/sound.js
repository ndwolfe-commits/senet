// Small synthesised sounds and phone buzzes. No audio files needed.
let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, start, length, type = "sine", gain = 0.12, slideTo = null) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  const t = a.currentTime + start;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + length + 0.02);
}

const buzz = (pattern) => { if (navigator.vibrate) navigator.vibrate(pattern); };

export const sound = {
  throwSticks() { [0, 0.05, 0.1, 0.16].forEach((t, i) => tone(900 - i * 90, t, 0.05, "square", 0.05)); },
  move() { tone(220, 0, 0.09, "triangle", 0.16); },
  swap() { tone(220, 0, 0.08, "triangle", 0.16); tone(330, 0.09, 0.1, "triangle", 0.14); },
  waters() { tone(520, 0, 0.5, "sine", 0.12, 110); buzz(60); },
  off() { tone(523, 0, 0.1); tone(784, 0.1, 0.16); },
  nope() { tone(140, 0, 0.12, "sawtooth", 0.06); buzz(30); },
  // A long, wet raspberry for the loser.
  raspberry() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    const flutter = a.createOscillator();
    const depth = a.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 1.1);
    flutter.type = "square";
    flutter.frequency.setValueAtTime(28, t);
    flutter.frequency.linearRampToValueAtTime(17, t + 1.1);
    depth.gain.value = 0.09;
    g.gain.setValueAtTime(0.1, t);
    g.gain.setValueAtTime(0.1, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
    flutter.connect(depth).connect(g.gain);
    o.connect(g).connect(a.destination);
    o.start(t); flutter.start(t);
    o.stop(t + 1.2); flutter.stop(t + 1.2);
    buzz([80, 40, 80, 40, 200]);
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.13, 0.26));
    [0.9, 1.5, 2.1, 2.8].forEach((t) => tone(180, t, 0.35, "triangle", 0.14, 50)); // firework thumps
    buzz([40, 60, 40, 60, 120]);
  },
};
