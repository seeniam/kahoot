import { $, $$, esc, ic, icons, render, shape, SHAPE_NAMES, toast, countUp, fmtPts, ordinal, startClock, confetti, mountStage, wakeLock, vibrate } from './ui.js?v=3';
import { sound, bindSoundButton } from './sound.js?v=3';

const screen = $('#screen');
const pinPill = $('#pinPill');
const stage = mountStage();
const socket = io({ transports: ['websocket', 'polling'] });
const SESSION_KEY = 'pulso:player';

const state = {
  pin: null,
  me: null, // {playerId, token, nickname, avatar}
  score: 0,
  avatars: ['🩺', '💉', '🫀', '🧠', '💊', '🩹', '🧬', '🔬', '📚', '💡', '🦉', '🐙', '🦊', '🐼', '🐯', '🦄'],
  avatar: null,
  stopClock: null,
  phase: null,
};

bindSoundButton($('#soundBtn'), icons);
icons();

const NICK_A = ['Enfermeira', 'Enfermeiro', 'Doutora', 'Mestre', 'Plantonista', 'Residente', 'Tutora', 'Monitor'];
const NICK_B = ['Ágil', 'Atenta', 'Crítica', 'Veloz', 'Sábia', 'Zen', 'Estrela', 'Curiosa', 'Ninja', 'Brava'];
const randomNick = () => `${NICK_A[Math.floor(Math.random() * NICK_A.length)]} ${NICK_B[Math.floor(Math.random() * NICK_B.length)]}`.slice(0, 16);

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ pin: state.pin, token: state.me?.token }));
  } catch {}
}
function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function stopClock() {
  state.stopClock?.();
  state.stopClock = null;
}

function setScreen(html, { center = true } = {}) {
  stopClock();
  screen.className = `screen${center ? ' screen--center' : ''}`;
  // reinicia a animação de entrada
  void screen.offsetWidth;
  render(screen, html);
}

function scoreFoot() {
  if (!state.me) return '';
  return `<footer class="score-foot"><span class="me"><span aria-hidden="true">${esc(state.me.avatar)}</span>${esc(state.me.nickname)}</span><span class="score" aria-label="Sua pontuação">${fmtPts(state.score)}</span></footer>`;
}

// ---------- 1. PIN ----------
function showPin(prefill = '', error = '') {
  stage.mood(null);
  stage.ecg(true);
  pinPill.hidden = true;
  setScreen(`
    <h1 class="display">Entre no plantão.</h1>
    <p class="lead">Digite o PIN que aparece na tela da apresentação.</p>
    <form class="card join-card" id="pinForm" novalidate>
      <label class="sr-only" for="pin">PIN do jogo</label>
      <input class="field field--pin" id="pin" name="pin" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="PIN do jogo" value="${esc(prefill)}" autofocus />
      <p class="form-error" id="pinErr" role="alert">${esc(error)}</p>
      <button class="btn btn--block btn--big" type="submit">Entrar ${ic('log-in')}</button>
    </form>
    <a class="link-host" href="/host">${ic('presentation')} Sou o apresentador: criar uma sala</a>
  `);
  const input = $('#pin');
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  });
  input.dispatchEvent(new Event('input'));
  $('#pinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sound.unlock();
    const pin = input.value.replace(/\D/g, '');
    const err = $('#pinErr');
    if (pin.length !== 6) {
      err.textContent = 'O PIN tem 6 números.';
      return shakeField(input);
    }
    const btn = e.submitter || $('#pinForm button');
    btn.classList.add('loading');
    socket.emit('room:check', pin, (res) => {
      btn.classList.remove('loading');
      if (!res?.ok) {
        err.textContent = res?.error || 'Não foi possível entrar.';
        sound.play('wrong');
        return shakeField(input);
      }
      state.pin = pin;
      sound.play('tap');
      showNickname();
    });
  });
}

function shakeField(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  vibrate(120);
}

// ---------- 2. Apelido + avatar ----------
function showNickname(error = '') {
  state.avatar ||= state.avatars[Math.floor(Math.random() * state.avatars.length)];
  setScreen(`
    <h1 class="display">Como vão te chamar?</h1>
    <p class="lead">Seu apelido aparece no ranking da turma.</p>
    <form class="card join-card" id="nickForm" novalidate>
      <p class="card-label">Escolha um avatar</p>
      <div class="avatar-grid" role="group" aria-label="Avatar">
        ${state.avatars.map((a) => `<button type="button" class="avatar-opt" data-av="${a}" aria-pressed="${a === state.avatar}" aria-label="Avatar ${a}">${a}</button>`).join('')}
      </div>
      <p class="card-label">Apelido</p>
      <div class="nick-row">
        <label class="sr-only" for="nick">Apelido</label>
        <input class="field" id="nick" maxlength="16" autocomplete="nickname" placeholder="Seu apelido" autofocus />
        <button type="button" class="dice" id="dice" aria-label="Sugerir apelido" title="Sugerir apelido">${ic('dices')}</button>
      </div>
      <p class="form-error" id="nickErr" role="alert">${esc(error)}</p>
      <button class="btn btn--block btn--big btn--gold" type="submit">Entrar na sala ${ic('sparkles')}</button>
    </form>
  `);
  $$('.avatar-opt').forEach((b) =>
    b.addEventListener('click', () => {
      state.avatar = b.dataset.av;
      $$('.avatar-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sound.play('tap');
    })
  );
  $('#dice').addEventListener('click', () => {
    $('#nick').value = randomNick();
    sound.play('tap');
  });
  $('#nickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = $('#nick').value.trim();
    const err = $('#nickErr');
    if (nickname.length < 2) {
      err.textContent = 'Use pelo menos 2 caracteres.';
      return shakeField($('#nick'));
    }
    const btn = $('#nickForm [type=submit]');
    btn.classList.add('loading');
    socket.emit('player:join', { pin: state.pin, nickname, avatar: state.avatar }, (res) => {
      btn.classList.remove('loading');
      if (!res?.ok) {
        err.textContent = res.error;
        sound.play('wrong');
        return shakeField($('#nick'));
      }
      state.me = res;
      state.score = 0;
      saveSession();
      wakeLock();
      sound.play('join');
      vibrate([40, 40, 40]);
      showLobby();
    });
  });
}

// ---------- 3. Lobby ----------
function showLobby() {
  stage.mood(null);
  pinPill.hidden = false;
  pinPill.textContent = `PIN ${state.pin}`;
  setScreen(`
    <div class="me-badge" aria-hidden="true">${esc(state.me.avatar)}</div>
    <h2 class="me-name">${esc(state.me.nickname)}</h2>
    <p class="lead">Você está dentro! Procure seu nome na tela.</p>
    <span class="heartbeat">${ic('heart-pulse')} Aguardando o apresentador começar</span>
    <button class="link-host" id="leave" type="button">${ic('log-out')} Sair da sala</button>
  `);
  $('#leave').addEventListener('click', () => {
    socket.emit('player:leave');
    clearSession();
    state.me = null;
    showPin();
  });
}

// ---------- fases do jogo ----------
function onPhase(p) {
  state.phase = p.phase;
  if (p.score != null) state.score = p.score;
  switch (p.phase) {
    case 'lobby':
      state.score = 0;
      return showLobby();
    case 'starting':
      return showStarting(p);
    case 'intro':
      return showIntro(p);
    case 'question':
      return p.answered ? showSent(null) : showQuestion(p);
    case 'result':
      return showResult(p);
    case 'leaderboard':
      return showRank(p);
    case 'podium':
      return showPodium(p);
  }
}

function showStarting(p) {
  stage.mood(null);
  stage.ecg(false);
  setScreen(`
    <h1 class="display">Prepare-se!</h1>
    <p class="lead">${p.total} perguntas. Acerto + rapidez = mais pontos.</p>
    <div class="countdown" aria-live="assertive"><b id="cd">3</b></div>
  `);
  let n = Math.max(1, Math.round((p.durationMs || 3000) / 1000) - 1);
  $('#cd').textContent = n;
  const t = setInterval(() => {
    n -= 1;
    const el = $('#cd');
    if (!el || n < 1) return clearInterval(t);
    el.textContent = n;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    vibrate(30);
  }, 1000);
  state.stopClock = () => clearInterval(t);
}

function showIntro(p) {
  stage.mood(null);
  stage.ecg(false);
  setScreen(`
    <div class="intro">
      <span class="intro-num">${ic(p.icon || 'help-circle')} Pergunta ${p.number} de ${p.total}</span>
      <h1>${esc(p.text)}</h1>
      <div class="timebar" aria-hidden="true"><i id="bar"></i></div>
    </div>
  `);
  const bar = $('#bar');
  state.stopClock = startClock(p.durationMs, { onFrame: (_, f) => (bar.style.transform = `scaleX(${f})`) });
}

function showQuestion(p) {
  stage.mood(null);
  stage.ecg(false);
  const withText = Array.isArray(p.answers);
  const tiles = [0, 1, 2, 3]
    .map(
      (i) => `<button class="answer a${i}" style="--i:${i}" data-choice="${i}" aria-label="${SHAPE_NAMES[i]}${withText ? `: ${esc(p.answers[i])}` : ''}">${shape(i)}${withText ? `<span>${esc(p.answers[i])}</span>` : ''}</button>`
    )
    .join('');
  setScreen(
    `
    <div class="play-q">
      <div class="q-head"><span>${p.number} de ${p.total}</span><span id="secs" aria-live="off">${Math.ceil(p.durationMs / 1000)}s</span></div>
      <div class="timebar" id="tb" aria-hidden="true"><i id="bar"></i></div>
      ${withText ? `<h1 class="q-text">${esc(p.text)}</h1>` : '<div style="height:14px"></div>'}
      <div class="answers ${withText ? '' : 'answers--shapes'}">${tiles}</div>
    </div>`,
    { center: false }
  );
  const bar = $('#bar');
  const secs = $('#secs');
  state.stopClock = startClock(p.durationMs, {
    onFrame: (_, f) => (bar.style.transform = `scaleX(${f})`),
    onSecond: (s) => {
      secs.textContent = `${s}s`;
      if (s <= 5) $('#tb')?.classList.add('urgent');
    },
  });
  $$('.answer').forEach((b) =>
    b.addEventListener('click', () => {
      const choice = Number(b.dataset.choice);
      $$('.answer').forEach((x) => (x.disabled = true));
      sound.play('submit');
      vibrate(25);
      socket.emit('player:answer', { choice, number: p.number }, (res) => {
        if (res?.error) {
          toast(res.error);
          return;
        }
      });
      showSent(choice);
    })
  );
}

function showSent(choice) {
  setScreen(`
    ${choice != null ? `<div class="sent-shape a${choice}">${shape(choice)}</div>` : `<div class="sent-shape a1">${ic('check')}</div>`}
    <h1 class="display" style="margin-top:28px">Resposta enviada!</h1>
    <p class="lead">Será que você acertou? Aguarde os outros jogadores.</p>
    <span class="heartbeat">${ic('heart-pulse')} Batimentos acelerados…</span>
  `);
}

function showResult(p) {
  stage.ecg(false);
  const good = p.correct;
  stage.mood(good ? 'correct' : 'wrong');
  let title;
  if (good) title = ['Correto!', 'Mandou bem!', 'Na mosca!', 'Diagnóstico certeiro!'][p.number % 4];
  else if (!p.answered) title = 'O tempo acabou';
  else title = 'Não foi dessa vez';
  const rankText =
    p.rank === 1
      ? `Você está em <strong>1º lugar</strong>. Continue assim!`
      : `Você está em <strong>${ordinal(p.rank)} lugar</strong>${p.ahead ? `, ${fmtPts(p.ahead.gap)} pts atrás de <strong>${esc(p.ahead.nickname)}</strong>` : ''}.`;
  setScreen(`
    <div class="result-icon ${good ? '' : 'bad'}">${ic(good ? 'check' : !p.answered ? 'timer-off' : 'x')}</div>
    <h1 class="display" style="margin-top:22px">${title}</h1>
    ${
      good
        ? `<span class="points-chip">+<span id="pts">0</span></span>${p.streak >= 2 ? `<span class="streak">${ic('flame')} Sequência de ${p.streak} acertos${p.points.bonus ? ` · +${fmtPts(p.points.bonus)}` : ''}</span>` : ''}`
        : `<p class="lead">Resposta certa: <strong style="color:#fff">${esc(p.correctAnswer)}</strong></p>`
    }
    <p class="rank-line">${rankText}</p>
    ${p.explanation ? `<div class="explain">${ic('lightbulb')}<span>${esc(p.explanation)}</span></div>` : ''}
    ${scoreFoot()}
  `);
  if (good) {
    countUp($('#pts'), p.points.total, { dur: 900 });
    sound.play('correct');
    vibrate([30, 50, 30]);
  } else {
    sound.play('wrong');
    vibrate(200);
  }
}

function showRank(p) {
  stage.mood(null);
  stage.ecg(true);
  const moved = p.prevRank - p.rank;
  setScreen(`
    <p class="lead" style="margin-top:0">Depois da pergunta ${p.number} de ${p.total}</p>
    <div class="big-rank">${ordinal(p.rank)}</div>
    <h2 class="me-name" style="margin-top:8px">de ${p.playerCount} jogadores</h2>
    ${moved > 0 ? `<span class="streak">${ic('trending-up')} Subiu ${moved} ${moved === 1 ? 'posição' : 'posições'}</span>` : ''}
    <p class="rank-line">${p.ahead ? `Faltam <strong>${fmtPts(p.ahead.gap)} pts</strong> para passar <strong>${esc(p.ahead.nickname)}</strong>.` : 'Ninguém na sua frente. Segure a liderança!'}</p>
    ${scoreFoot()}
  `);
}

function showPodium(p) {
  stage.mood(p.rank <= 3 ? 'correct' : null);
  stage.ecg(false);
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[p.rank];
  const msg =
    p.rank === 1 ? 'Você venceu o plantão!' : p.rank <= 3 ? 'No pódio! Que plantão!' : p.rank <= Math.ceil(p.playerCount / 2) ? 'Ótimo desempenho!' : 'Valeu a participação!';
  setScreen(`
    ${medal ? `<div class="medal" aria-hidden="true">${medal}</div>` : `<div class="me-badge" aria-hidden="true">${esc(state.me?.avatar || '🩺')}</div>`}
    <div class="big-rank" style="font-size:clamp(3rem,16vw,5.5rem);margin-top:10px">${ordinal(p.rank)} lugar</div>
    <h1 class="me-name" style="margin-top:6px">${msg}</h1>
    <div class="stats" style="margin-top:22px;width:100%;max-width:440px">
      <div class="stat"><b id="fs">0</b><span>pontos</span></div>
      <div class="stat"><b>${p.correctCount}/${p.total}</b><span>acertos</span></div>
      <div class="stat"><b>${p.bestStreak}</b><span>maior sequência</span></div>
    </div>
    <p class="rank-line top3">${p.top3.map((t) => `<span>${t.rank}º ${esc(t.avatar)} <strong>${esc(t.nickname)}</strong></span>`).join('')}</p>
    <a class="link-host" href="/">${ic('rotate-ccw')} Entrar em outro jogo</a>
  `);
  countUp($('#fs'), p.score, { dur: 1400 });
  if (p.rank <= 3) {
    setTimeout(() => {
      confetti();
      sound.play('fanfare');
    }, 300);
  } else sound.play('reveal');
}

function showEnded(text) {
  stage.mood(null);
  stage.ecg(true);
  pinPill.hidden = true;
  clearSession();
  state.me = null;
  setScreen(`
    <div class="result-icon bad">${ic('door-closed')}</div>
    <h1 class="display" style="margin-top:22px">${esc(text)}</h1>
    <a class="btn btn--gold btn--big" style="margin-top:28px" href="/">Entrar em outro jogo</a>
  `);
}

// ---------- socket ----------
socket.on('game:phase', onPhase);
socket.on('player:kicked', () => showEnded('Você foi removido da sala.'));
socket.on('room:closed', () => showEnded('O apresentador encerrou a sala.'));

let booted = false;
socket.on('connect', () => {
  const saved = loadSession();
  if (saved?.token && (state.me || !booted)) {
    socket.emit('player:resume', saved, (res) => {
      if (res?.ok) {
        state.pin = saved.pin;
        state.me = { ...res, token: saved.token };
        state.score = res.score || 0;
        pinPill.hidden = false;
        pinPill.textContent = `PIN ${state.pin}`;
        if (!booted || state.phase == null) onPhase(res.state?.phase ? res.state : { phase: 'lobby' });
        else if (res.state?.phase && res.state.phase !== state.phase) onPhase(res.state);
      } else if (!booted) {
        clearSession();
        boot();
      } else if (state.me) {
        showEnded('A sala não está mais disponível.');
      }
      booted = true;
    });
    return;
  }
  if (!booted) boot();
  booted = true;
});
socket.on('disconnect', () => {
  if (state.me) toast('Conexão perdida. Reconectando…', 4000);
});

function boot() {
  const pin = new URLSearchParams(location.search).get('pin')?.replace(/\D/g, '') || '';
  if (pin.length === 6) {
    socket.emit('room:check', pin, (res) => {
      if (res?.ok) {
        state.pin = pin;
        showNickname();
      } else showPin(pin, res?.error);
    });
  } else showPin();
}
