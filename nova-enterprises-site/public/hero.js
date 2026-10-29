/* Placeholder hero motion. Replace draw() when the real animation is ready.
   The SVG fallback stays in the HTML for no-JS and reduced motion. */
(() => {
  'use strict';
  const slot = document.querySelector('[data-hero-slot]');
  if (!slot || typeof window.matchMedia !== 'function') return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  slot.appendChild(canvas);
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }

  let frame = 0;
  let running = false;
  let onScreen = false;
  let pageVisible = document.visibilityState !== 'hidden';

  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);

  const token = (name, fallback) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };

  const resize = () => {
    const rect = slot.getBoundingClientRect();
    const dpr = pixelRatio();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = now => {
    const width = slot.clientWidth;
    const height = slot.clientHeight;
    context.clearRect(0, 0, width, height);
    context.fillStyle = token('--c-surface', '#121821');
    context.fillRect(0, 0, width, height);
    const accent = token('--c-accent', '#F5A524');
    const current = token('--c-current', '#6FD394');
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.28;
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    const angle = (now / 1600) % (Math.PI * 2);
    context.fillStyle = current;
    context.beginPath();
    context.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 4, 0, Math.PI * 2);
    context.fill();
  };

  const stop = () => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const loop = now => {
    if (!running) return;
    if (!onScreen || !pageVisible || motion.matches) {
      stop();
      return;
    }
    draw(now);
    frame = requestAnimationFrame(loop);
  };

  const start = () => {
    if (running || !onScreen || !pageVisible || motion.matches) return;
    running = true;
    frame = requestAnimationFrame(loop);
  };

  const observer = new IntersectionObserver(entries => {
    onScreen = entries.some(entry => entry.isIntersecting);
    if (onScreen) start();
    else stop();
  });
  observer.observe(slot);

  document.addEventListener('visibilitychange', () => {
    pageVisible = document.visibilityState !== 'hidden';
    if (pageVisible) start();
    else stop();
  });

  const onResize = () => {
    resize();
    if (running) draw(performance.now());
  };
  if (typeof window.ResizeObserver === 'function') new ResizeObserver(onResize).observe(slot);
  else window.addEventListener('resize', onResize);
  resize();

  const haltForReducedMotion = () => {
    if (!motion.matches) return;
    stop();
    observer.disconnect();
    canvas.remove();
  };
  if (typeof motion.addEventListener === 'function') motion.addEventListener('change', haltForReducedMotion);
  else if (typeof motion.addListener === 'function') motion.addListener(haltForReducedMotion);
})();
