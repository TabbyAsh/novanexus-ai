// Nova Nexus · Hybrid hero: B's star matrix (lattice) with A's white-gold nova at its heart.
// ES module, one canvas. API: init(el, opts?) -> {destroy} | null; destroy(el).
// Mounts over the static fallback only if motion is allowed and el is visible; pauses offscreen/hidden; DPR <= 2.
const MQ = matchMedia('(prefers-reduced-motion: reduce)');
const inst = new WeakMap();
export function init(el, opts = {}) {
  if (!el || inst.has(el) || MQ.matches) return null;
  const cv = document.createElement('canvas'); cv.className = 'hero-canvas'; cv.setAttribute('aria-hidden', 'true');
  const cx = cv.getContext('2d'); if (!cx) return null;
  let w = 0, h = 0, dpr = 1, raf = 0, visible = false, mounted = false, t = 0, nodes = [], pulses = [], NX = 0, NY = 0, NR = 1;
  const LINK = 150;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2); w = el.clientWidth; h = el.clientHeight; cv.width = w * dpr; cv.height = h * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = w >= 900; NX = w * (opts.cx ?? (wide ? 0.74 : 0.78)); NY = wide ? h * (opts.cy ?? 0.45) : (opts.cyPx ?? 110); NR = Math.max(w, h) * 0.6;
    const N = opts.nodes ?? Math.min(wide ? 90 : 40, Math.round(w * h / 11000));
    nodes = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .14, vy: (Math.random() - .5) * .14, e: 0 }));
  }
  const near = (x, y) => Math.max(0, 1 - Math.hypot(x - NX, y - NY) / NR); // 1 at nova, 0 far
  function frame() {
    t++; cx.clearRect(0, 0, w, h);
    const pulse = 1 + Math.sin(t * 0.02) * 0.05, R = Math.min(w, h) * 0.5 * pulse;
    const g = cx.createRadialGradient(NX, NY, 0, NX, NY, R);
    g.addColorStop(0, 'rgba(255,246,227,.95)'); g.addColorStop(.07, 'rgba(255,213,138,.6)'); g.addColorStop(.35, 'rgba(143,184,255,.12)'); g.addColorStop(1, 'rgba(4,6,11,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; n.e *= 0.97; n.k = near(n.x, n.y); }
    cx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
      if (d < LINK * LINK) {
        const k = 1 - Math.sqrt(d) / LINK, m = (a.k + b.k) / 2;
        cx.strokeStyle = m > .45 ? `rgba(255,224,170,${k * (.25 + m * .5)})` : `rgba(143,184,255,${k * (.32 + m * .4) + (a.e + b.e) * .2})`;
        cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
        if (pulses.length < 14 && Math.random() < 0.0006) pulses.push(a.k < b.k ? { a, b, p: 0 } : { a: b, b: a, p: 0 }); // flow toward the nova
      }
    }
    pulses = pulses.filter(q => { q.p += 0.012; const x = q.a.x + (q.b.x - q.a.x) * q.p, y = q.a.y + (q.b.y - q.a.y) * q.p;
      cx.fillStyle = 'rgba(255,230,176,.95)'; cx.beginPath(); cx.arc(x, y, 2, 0, 6.283); cx.fill(); if (q.p >= 1) { q.b.e = 1; return false; } return true; });
    for (const n of nodes) { const r = 1.5 + n.e * 2.5 + n.k * 1.2; cx.fillStyle = n.e > .05 || n.k > .6 ? `rgba(255,236,190,${.6 + n.e * .4})` : 'rgba(201,216,255,.75)'; cx.beginPath(); cx.arc(n.x, n.y, r, 0, 6.283); cx.fill(); }
    cx.fillStyle = '#FFF6E3'; cx.beginPath(); cx.arc(NX, NY, 4, 0, 6.283); cx.fill();
    raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0;
  }
  const play = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !mounted) { el.appendChild(cv); mounted = true; size(); el.classList.add('hero-live'); } play(); });
  const ro = new ResizeObserver(() => mounted && size());
  const vis = () => play(); const mq = () => MQ.matches && destroy(el);
  io.observe(el); ro.observe(el); document.addEventListener('visibilitychange', vis); MQ.addEventListener('change', mq);
  const api = { destroy() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', vis); MQ.removeEventListener('change', mq); cv.remove(); el.classList.remove('hero-live'); inst.delete(el); } };
  inst.set(el, api); return api;
}
export function destroy(el) { inst.get(el)?.destroy(); }
