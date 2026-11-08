// Utilitários de interface compartilhados entre apresentador e jogador.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function icons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
}
export const ic = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;

// Formas das alternativas (triângulo, losango, círculo, quadrado)
const SHAPES = [
  '<path d="M16 3 L30 28 H2 Z"/>',
  '<path d="M16 1 L31 16 L16 31 L1 16 Z"/>',
  '<circle cx="16" cy="16" r="14"/>',
  '<rect x="3" y="3" width="26" height="26" rx="3"/>',
];
export const SHAPE_NAMES = ['Triângulo', 'Losango', 'Círculo', 'Quadrado'];
export const shape = (i) => `<svg class="shape" viewBox="0 0 32 32" aria-hidden="true">${SHAPES[i]}</svg>`;

export const LETTERS = 'ABCD';

/** Renderiza HTML numa tela e reidrata os ícones. */
export function render(root, html) {
  root.innerHTML = html;
  icons();
  const focusable = root.querySelector('[autofocus]');
  if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 60);
}

export function toast(msg, ms = 2600) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

export function countUp(el, to, { from = 0, dur = 1100 } = {}) {
  if (!el) return;
  const start = performance.now();
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = fmt(to);
    return;
  }
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const fmtPts = (n) => Number(n || 0).toLocaleString('pt-BR');
export const ordinal = (n) => `${n}º`;

/**
 * Cronômetro baseado em requestAnimationFrame.
 * onTick(segundosRestantes, fração) — onEnd()
 */
export function startClock(durationMs, { onFrame, onSecond, onEnd } = {}) {
  const end = performance.now() + durationMs;
  let lastSec = null;
  let raf;
  const loop = (now) => {
    const left = Math.max(0, end - now);
    const frac = durationMs ? left / durationMs : 0;
    onFrame?.(left, frac);
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      onSecond?.(sec);
    }
    if (left > 0) raf = requestAnimationFrame(loop);
    else onEnd?.();
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

export function ringMarkup(sec) {
  return `<div class="ring" role="timer" aria-live="off"><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44"/><circle class="prog" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg><b>${sec}</b></div>`;
}

// ---------- confete ----------
export function confetti({ duration = 4500, count = 180 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  const colors = ['#e8735a', '#1c7c84', '#f2be4b', '#33a99b', '#fbf7f0'];
  const parts = Array.from({ length: count }, (_, i) => ({
    x: (i % 2 ? 0.15 : 0.85) * canvas.width + (Math.random() - 0.5) * 100 * dpr,
    y: canvas.height * 0.75,
    vx: (i % 2 ? 1 : -1) * (Math.random() * 7 + 2) * dpr,
    vy: -(Math.random() * 16 + 11) * dpr,
    s: (Math.random() * 7 + 5) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[i % colors.length],
    k: i % 3,
  }));
  const start = performance.now();
  const tick = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.38 * dpr;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - t / duration);
      ctx.fillStyle = p.c;
      if (p.k === 0) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else if (p.k === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.s / 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.s / 2);
        ctx.lineTo(p.s / 2, p.s / 2);
        ctx.lineTo(-p.s / 2, p.s / 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

/** Linha de ECG do fundo; beat() faz um pico dourado. */
export function mountStage() {
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.innerHTML = `<svg class="ecg" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70 H180 L200 70 L215 55 L230 70 H300 L318 70 L330 92 L350 8 L372 110 L388 70 H470 L495 52 L525 70 H700 L720 70 L735 55 L750 70 H820 L838 70 L850 92 L870 8 L892 110 L908 70 H990 L1015 52 L1045 70 H1200"/></svg>`;
  document.body.prepend(stage);
  const ecg = stage.querySelector('.ecg');
  return {
    el: stage,
    mood(m) {
      if (m) stage.dataset.mood = m;
      else delete stage.dataset.mood;
    },
    beat() {
      ecg.classList.remove('beat');
      void ecg.getBoundingClientRect();
      ecg.classList.add('beat');
      clearTimeout(ecg._t);
      ecg._t = setTimeout(() => ecg.classList.remove('beat'), 900);
    },
    ecg(show) {
      ecg.style.display = show ? '' : 'none';
    },
  };
}

/** Anima reordenação de lista (técnica FLIP). */
export function flip(listEl, prevPositions) {
  for (const li of listEl.children) {
    const prev = prevPositions[li.dataset.id];
    if (prev == null) {
      li.animate([{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards', delay: 150 });
      continue;
    }
    const dy = prev - li.offsetTop;
    if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)', delay: 500, fill: 'backwards' });
  }
}

export function wakeLock() {
  let lock = null;
  const req = async () => {
    try {
      lock = await navigator.wakeLock?.request('screen');
    } catch {}
  };
  req();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') req();
  });
  return () => lock?.release();
}

export function vibrate(p) {
  try {
    navigator.vibrate?.(p);
  } catch {}
}
