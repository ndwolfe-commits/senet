// Fireworks over the whole screen for a few seconds. No images, just dots.
const COLOURS = ["#e3b341", "#f6ecd2", "#17847e", "#a8402f", "#ffd9a8", "#3fb3ab"];

export function fireworks(host, seconds = 5) {
  const canvas = document.createElement("canvas");
  canvas.className = "fireworks";
  host.appendChild(canvas);
  const scale = window.devicePixelRatio || 1;
  const w = host.clientWidth, h = host.clientHeight;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  let sparks = [];
  const start = performance.now();
  let lastBurst = 0;

  function burst() {
    const x = w * (0.15 + Math.random() * 0.7);
    const y = h * (0.12 + Math.random() * 0.45);
    const colour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    const count = 56;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 1.5 + Math.random() * 3.2;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, colour });
    }
  }

  function frame(now) {
    const elapsed = (now - start) / 1000;
    if (elapsed < seconds - 1.2 && now - lastBurst > 230) { burst(); lastBurst = now; }
    ctx.clearRect(0, 0, w, h);
    for (const s of sparks) {
      s.x += s.vx; s.y += s.vy; s.vy += 0.045; s.vx *= 0.985; s.vy *= 0.985; s.life -= 0.013;
      ctx.globalAlpha = Math.max(s.life, 0);
      ctx.fillStyle = s.colour;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    sparks = sparks.filter((s) => s.life > 0);
    if (elapsed < seconds || sparks.length) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
