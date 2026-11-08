import { $, $$, esc, ic, icons, render, shape, toast, countUp, fmtPts, ordinal, startClock, ringMarkup, confetti, mountStage, flip, wakeLock } from './ui.js?v=4';
import { sound, bindSoundButton } from './sound.js?v=4';

const screen = $('#screen');
const pinPill = $('#pinPill');
const progressPill = $('#progressPill');
const menuBtn = $('#menuBtn');
const stage = mountStage();
const socket = io({ transports: ['websocket', 'polling'] });
const SESSION_KEY = 'pulso:host';
const SETTINGS_KEY = 'pulso:settings';

const state = {
  quiz: null,
  settings: null,
  room: null, // {pin, hostToken, joinUrl, qr}
  players: [],
  locked: false,
  stopClock: null,
  phase: 'setup',
  last: null,
  rowPositions: {},
};

bindSoundButton($('#soundBtn'), icons);
icons();

// ---------- tela cheia e menu ----------
$('#fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  $('#fsBtn').innerHTML = ic(document.fullscreenElement ? 'minimize' : 'maximize');
  icons();
});

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  let menu = $('.menu');
  if (menu) return closeMenu();
  menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  const inGame = !['lobby', 'podium'].includes(state.phase);
  menu.innerHTML = `
    ${inGame ? `<button role="menuitem" data-act="skip">${ic('skip-forward')} Pular para o resultado</button>` : ''}
    <button role="menuitem" data-act="copy">${ic('link')} Copiar link de entrada</button>
    <button role="menuitem" class="danger" data-act="end">${ic('power')} Encerrar sala</button>`;
  document.body.append(menu);
  menuBtn.setAttribute('aria-expanded', 'true');
  icons();
  menu.addEventListener('click', (ev) => {
    const act = ev.target.closest('button')?.dataset.act;
    closeMenu();
    if (act === 'skip') socket.emit('host:skip');
    if (act === 'copy') copyLink();
    if (act === 'end' && confirm('Encerrar a sala? Todos os jogadores serão desconectados.')) endRoom();
  });
});
document.addEventListener('click', () => closeMenu());
function closeMenu() {
  $('.menu')?.remove();
  menuBtn.setAttribute('aria-expanded', 'false');
}

function copyLink() {
  navigator.clipboard?.writeText(state.room.joinUrl).then(
    () => toast('Link copiado'),
    () => toast(state.room.joinUrl)
  );
}

function endRoom() {
  socket.emit('host:end');
  clearSession();
  state.room = null;
  sound.music(null);
  location.href = '/host';
}

// ---------- sessão ----------
function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ pin: state.room.pin, hostToken: state.room.hostToken }));
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
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {}
}
function loadSettings(defaults) {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s && Array.isArray(s.questions) && s.questions.length === defaults.questions.length) return { ...defaults, ...s };
  } catch {}
  return structuredClone(defaults);
}

function stopClock() {
  state.stopClock?.();
  state.stopClock = null;
}
function setScreen(html, cls = '') {
  stopClock();
  closeMenu();
  screen.className = `screen ${cls}`;
  void screen.offsetWidth;
  render(screen, html);
}

// ---------- 1. Configuração ----------
const POINTS_LABEL = { standard: 'Padrão', double: 'Em dobro', none: 'Sem pontos' };

function chipGroup(name, options, current, fmt = (v) => v) {
  return `<div class="chips" role="group" data-name="${name}">${options
    .map((v) => `<button type="button" class="chip" data-value="${v}" aria-pressed="${String(v) === String(current)}">${fmt(v)}</button>`)
    .join('')}</div>`;
}
function toggle(name, label, hint, checked) {
  return `<label class="setting toggle-row"><span class="setting-label">${label}<small>${hint}</small></span><span class="switch"><input type="checkbox" data-name="${name}" ${checked ? 'checked' : ''}/><span></span></span></label>`;
}

function showSetup() {
  quizReady.then(renderSetup);
}

function renderSetup() {
  state.phase = 'setup';
  stage.mood(null);
  stage.ecg(true);
  pinPill.hidden = true;
  progressPill.hidden = true;
  menuBtn.hidden = true;
  const s = state.settings;
  const q = state.quiz;
  const enabledCount = s.questions.filter((x) => x.enabled).length;
  setScreen(
    `
    <div class="setup">
      <section class="setup-hero">
        <h1>${esc(q.title)}</h1>
        <p>${esc(q.subtitle)}. Ajuste as regras, abra a sala e projete o PIN para a turma entrar pelo celular.</p>
        <div class="facts">
          <span class="pill">${ic('list-checks')} <span id="qCount">${enabledCount}</span> perguntas</span>
          <span class="pill">${ic('timer')} <span id="tCount">${s.timeLimit}</span> s por pergunta</span>
          <span class="pill">${ic('smartphone')} Sem cadastro</span>
        </div>
      </section>

      <section class="panel" aria-labelledby="rulesTitle">
        <h2 id="rulesTitle">${ic('sliders-horizontal')} Regras da partida</h2>
        <p class="panel-sub">Valem para todas as perguntas, exceto quando você define um tempo próprio na lista.</p>
        <div class="setting"><span class="setting-label">Tempo para responder<small>Padrão de 20 segundos</small></span>${chipGroup('timeLimit', q.timeOptions, s.timeLimit, (v) => `${v}s`)}</div>
        <div class="setting"><span class="setting-label">Tempo de leitura<small>A pergunta aparece antes das alternativas</small></span>${chipGroup('readTime', q.readOptions, s.readTime, (v) => (v ? `${v}s` : 'Sem'))}</div>
        <div class="setting"><span class="setting-label">Pontuação</span>${chipGroup('points', ['standard', 'double', 'none'], s.points, (v) => POINTS_LABEL[v])}</div>
        ${toggle('speedBonus', 'Bônus de velocidade', 'Quem responde mais rápido ganha até 1.000 pts', s.speedBonus)}
        ${toggle('streakBonus', 'Bônus de sequência', '+100 pts por acerto seguido (até +500)', s.streakBonus)}
        ${toggle('shuffleQuestions', 'Embaralhar perguntas', 'Ordem diferente a cada partida', s.shuffleQuestions)}
        ${toggle('shuffleAnswers', 'Embaralhar alternativas', 'Muda a posição da resposta certa', s.shuffleAnswers)}
        ${toggle('showQuestionOnDevices', 'Pergunta no celular', 'Desligado: o celular mostra só as formas coloridas', s.showQuestionOnDevices)}
        ${toggle('showExplanation', 'Mostrar explicação', 'Comentário com base nos slides após cada pergunta', s.showExplanation)}
        ${toggle('autoAdvance', 'Avançar sozinho', 'Passa do resultado ao ranking e à próxima pergunta sem clicar', s.autoAdvance)}
        <div class="setting" id="delayRow" ${s.autoAdvance ? '' : 'hidden'}><span class="setting-label">Tempo em cada tela</span>${chipGroup('autoAdvanceDelay', [4, 6, 8, 10, 15], s.autoAdvanceDelay, (v) => `${v}s`)}</div>
        <div class="setting"><span class="setting-label">Limite de jogadores</span>${chipGroup('maxPlayers', [10, 30, 60, 100, 200], s.maxPlayers)}</div>
      </section>

      <section class="panel" aria-labelledby="qTitle">
        <h2 id="qTitle">${ic('book-open-check')} Perguntas</h2>
        <p class="panel-sub">Desligue as que não quer usar ou dê mais tempo a uma pergunta específica.</p>
        <ol class="qlist">
          ${q.questions
            .map((item, i) => {
              const cfg = s.questions[i];
              return `<li class="qitem ${cfg.enabled ? '' : 'off'}" data-i="${i}">
                <span class="qnum" title="${esc(item.topic)}">${ic(item.icon)}</span>
                <span class="qtitle">${i + 1}. ${esc(item.text)}</span>
                <span class="qmeta">
                  <span>${esc(item.topic)}</span>
                  <label>Tempo <select data-q="${i}" aria-label="Tempo da pergunta ${i + 1}">
                    <option value="">Padrão</option>
                    ${q.timeOptions.map((t) => `<option value="${t}" ${cfg.timeLimit === t ? 'selected' : ''}>${t}s</option>`).join('')}
                  </select></label>
                  <span class="switch" title="Usar esta pergunta"><input type="checkbox" data-qon="${i}" ${cfg.enabled ? 'checked' : ''} aria-label="Usar pergunta ${i + 1}"/><span></span></span>
                </span>
              </li>`;
            })
            .join('')}
        </ol>
      </section>
    </div>
    <div class="setup-cta"><button class="btn btn--gold btn--big" id="create">${ic('door-open')} Abrir sala</button></div>
  `
  );
  $('#create').addEventListener('click', createRoom);
}

function onSetupClick(e) {
  if (state.phase !== 'setup') return;
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const group = chip.parentElement;
  const name = group.dataset.name;
  const raw = chip.dataset.value;
  state.settings[name] = isNaN(Number(raw)) ? raw : Number(raw);
  $$('.chip', group).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  if (name === 'timeLimit') $('#tCount').textContent = raw;
  sound.play('tap');
  saveSettings();
}
function onSetupChange(e) {
  if (state.phase !== 'setup') return;
  const t = e.target;
  if (t.dataset.name) {
    state.settings[t.dataset.name] = t.checked;
    if (t.dataset.name === 'autoAdvance') $('#delayRow').hidden = !t.checked;
  } else if (t.dataset.qon != null) {
    const i = Number(t.dataset.qon);
    const enabled = state.settings.questions.filter((q) => q.enabled).length;
    if (!t.checked && enabled <= 1) {
      t.checked = true;
      return toast('Deixe pelo menos uma pergunta ativa.');
    }
    state.settings.questions[i].enabled = t.checked;
    t.closest('.qitem').classList.toggle('off', !t.checked);
    $('#qCount').textContent = state.settings.questions.filter((q) => q.enabled).length;
  } else if (t.dataset.q != null) {
    state.settings.questions[Number(t.dataset.q)].timeLimit = t.value ? Number(t.value) : null;
  }
  sound.play('tap');
  saveSettings();
}

function createRoom() {
  sound.unlock();
  const btn = $('#create');
  btn.classList.add('loading');
  socket.emit('host:create', { settings: state.settings }, (res) => {
    btn.classList.remove('loading');
    if (!res?.ok) return toast('Não foi possível abrir a sala. Tente de novo.');
    state.room = res;
    state.settings = res.settings;
    saveSession();
    wakeLock();
    sound.play('whoosh');
    showLobby();
  });
}

// ---------- 2. Lobby ----------
function showLobby() {
  state.phase = 'lobby';
  stage.mood(null);
  stage.ecg(true);
  pinPill.hidden = true;
  progressPill.hidden = true;
  menuBtn.hidden = false;
  const url = state.room.joinUrl.replace(/^https?:\/\//, '').replace(/\/\?pin=\d+$/, '');
  setScreen(
    `
    <div class="lobby">
      <section class="join-banner">
        <div class="join-steps">
          Entre em <strong>${esc(url)}</strong><br/>ou aponte a câmera para o QR code.
        </div>
        <div>
          <div class="pin-label">PIN do jogo</div>
          <div class="pin-big" aria-label="PIN ${state.room.pin.split('').join(' ')}">${state.room.pin.slice(0, 3)} ${state.room.pin.slice(3)}</div>
        </div>
        <img class="qr" src="${state.room.qr}" alt="QR code para entrar no jogo" width="150" height="150" />
      </section>
      <div class="lobby-bar">
        <div class="lobby-count">${ic('users')} <b id="pc">0</b> <span>jogadores</span></div>
        <button class="btn btn--ghost" id="lockBtn" type="button"></button>
        <button class="btn btn--gold btn--big" id="startBtn" type="button" disabled>${ic('play')} Começar</button>
      </div>
      <div class="players" id="players" aria-live="polite"></div>
    </div>
  `
  );
  $('#lockBtn').addEventListener('click', () => socket.emit('host:lock', !state.locked));
  $('#startBtn').addEventListener('click', () => {
    sound.unlock();
    socket.emit('host:start', null, (res) => {
      if (res?.error) toast(res.error);
    });
  });
  renderPlayers(true);
  sound.music('lobby');
}

function renderPlayers(initial = false) {
  const box = $('#players');
  if (!box) return;
  const pc = $('#pc');
  pc.textContent = state.players.length;
  $('#startBtn').disabled = state.players.length === 0;
  $('#lockBtn').innerHTML = state.locked ? `${ic('lock')} Sala trancada` : `${ic('lock-open')} Sala aberta`;
  if (!state.players.length) {
    box.innerHTML = `<div class="empty-lobby"><span class="heartbeat">${ic('heart-pulse')} Aguardando jogadores…</span></div>`;
    icons();
    return;
  }
  $('.empty-lobby', box)?.remove();
  const existing = new Map($$('.player-chip', box).map((el) => [el.dataset.id, el]));
  const ids = new Set(state.players.map((p) => p.id));
  for (const [id, el] of existing) if (!ids.has(id)) el.remove();
  for (const p of state.players) {
    let el = existing.get(p.id);
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'player-chip';
      el.dataset.id = p.id;
      el.title = `Remover ${p.nickname}`;
      el.setAttribute('aria-label', `${p.nickname}. Toque para remover`);
      el.innerHTML = `<span class="av">${esc(p.avatar)}</span><span>${esc(p.nickname)}</span>`;
      el.addEventListener('click', () => {
        if (confirm(`Remover ${p.nickname} da sala?`)) socket.emit('host:kick', p.id);
      });
      box.append(el);
      if (!initial) {
        sound.play('join');
        stage.beat();
      }
    }
    el.classList.toggle('offline', !p.connected);
  }
  icons();
}

// ---------- 3. Fases ----------
function onPhase(p) {
  state.phase = p.phase;
  state.last = p;
  menuBtn.hidden = false;
  if (p.number) {
    progressPill.hidden = false;
    progressPill.innerHTML = `${ic('list-ordered')} ${p.number}/${p.total}`;
    icons();
  }
  if (state.room) {
    pinPill.hidden = p.phase === 'lobby';
    pinPill.textContent = `PIN ${state.room.pin}`;
  }
  switch (p.phase) {
    case 'lobby':
      return showLobby();
    case 'starting':
      return showStarting(p);
    case 'intro':
      return showIntro(p);
    case 'question':
      return showQuestion(p);
    case 'result':
      return showResult(p);
    case 'leaderboard':
      return showLeaderboard(p);
    case 'podium':
      return showPodium(p);
  }
}

function showStarting(p) {
  stage.ecg(false);
  sound.music(null);
  sound.play('whoosh');
  setScreen(
    `
    <h1 class="display">${esc(p.title)}</h1>
    <p class="lead">${p.total} perguntas. Acerto + rapidez = mais pontos. O pódio aparece no final!</p>
    <div class="countdown" aria-live="assertive"><b id="cd">3</b></div>
  `,
    'screen--center'
  );
  let n = Math.max(1, Math.round(p.durationMs / 1000) - 1);
  $('#cd').textContent = n;
  sound.play('count');
  const t = setInterval(() => {
    n -= 1;
    const el = $('#cd');
    if (!el || n < 1) {
      clearInterval(t);
      if (el) sound.play('go');
      return;
    }
    el.textContent = n;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    sound.play('count');
  }, 1000);
  state.stopClock = () => clearInterval(t);
}

function showIntro(p) {
  stage.ecg(false);
  stage.mood(null);
  sound.music(null);
  sound.play('whoosh');
  setScreen(`
    <div class="intro">
      <span class="intro-num">${ic(p.icon || 'help-circle')} Pergunta ${p.number} de ${p.total} · ${esc(p.topic)}</span>
      <h1>${esc(p.text)}</h1>
      <div class="timebar" aria-hidden="true"><i id="bar"></i></div>
    </div>
  `);
  const bar = $('#bar');
  state.stopClock = startClock(p.durationMs, { onFrame: (_, f) => (bar.style.transform = `scaleX(${f})`) });
}

function showQuestion(p) {
  stage.ecg(false);
  stage.mood(null);
  setScreen(`
    <div class="game">
      <div class="game-q">${esc(p.text)}</div>
      <div class="game-mid">
        ${ringMarkup(Math.ceil(p.durationMs / 1000))}
        <div class="mid-art"><div class="topic-orb">${ic(p.icon || 'help-circle')}</div></div>
        <div class="counter"><b id="ans">${p.answeredCount || 0}</b><span>respostas</span></div>
      </div>
      <div class="answers">
        ${p.answers.map((a, i) => `<div class="answer a${i}" style="--i:${i}">${shape(i)}<span>${esc(a)}</span></div>`).join('')}
      </div>
      <div class="host-actions"><button class="btn btn--ghost" id="skipBtn">${ic('skip-forward')} Encerrar pergunta</button></div>
    </div>
  `);
  $('#skipBtn').addEventListener('click', () => socket.emit('host:skip'));
  const ring = $('.ring');
  const prog = $('.ring .prog');
  const num = $('.ring b');
  const full = p.limitSec * 1000;
  sound.music('question');
  state.stopClock = startClock(p.durationMs, {
    onFrame: (left) => prog.setAttribute('stroke-dashoffset', String(100 - (left / full) * 100)),
    onSecond: (s) => {
      num.textContent = s;
      if (s <= 5 && s > 0) {
        ring.classList.add('urgent');
        sound.play('urgent');
      }
    },
  });
}

function showResult(p) {
  stage.ecg(false);
  sound.music(null);
  sound.play(p.answered ? 'reveal' : 'timeup');
  const max = Math.max(1, ...p.distribution);
  const rate = p.playerCount ? Math.round((p.distribution[p.correct] / p.playerCount) * 100) : 0;
  setScreen(`
    <div class="game">
      <div class="game-q">${esc(p.text)}</div>
      <div class="chart" role="img" aria-label="Distribuição das respostas">
        ${p.distribution
          .map(
            (n, i) => `<div class="bar a${i} ${i === p.correct ? '' : 'dim'}" style="--i:${i}">
              <span class="n">${i === p.correct ? ic('check') : ''}${n}</span>
              <div class="col" style="--h:${Math.round((n / max) * 100)}">${shape(i)}</div>
            </div>`
          )
          .join('')}
      </div>
      <div class="answers">
        ${p.answers
          .map(
            (a, i) =>
              `<div class="answer a${i} ${i === p.correct ? 'is-correct' : 'dim'}" style="--i:${i}">${shape(i)}<span>${esc(a)}</span>${i === p.correct ? `<span class="check">${ic('check')}</span>` : ''}</div>`
          )
          .join('')}
      </div>
      <div class="result-foot">
        ${p.explanation ? `<div class="host-explain">${ic('lightbulb')}<div>${esc(p.explanation)}<br/><small>Slide ${p.slide} · ${rate}% da turma acertou</small></div></div>` : ''}
        <div class="host-actions">
          ${p.fastest ? `<span class="fastest" style="margin-right:auto">${ic('zap')} Mais rápido: <b>${esc(p.fastest.avatar)} ${esc(p.fastest.nickname)}</b> (${(p.fastest.elapsedMs / 1000).toFixed(1)}s)</span>` : ''}
          <button class="btn btn--gold btn--big" id="nextBtn">${p.isLast ? `${ic('trophy')} Ver pódio` : `${ic('bar-chart-3')} Ver ranking`}</button>
        </div>
      </div>
    </div>
  `);
  $('#nextBtn').addEventListener('click', () => socket.emit('host:next'));
  $('#nextBtn').focus({ preventScroll: true });
}

function showLeaderboard(p) {
  stage.ecg(true);
  stage.mood(null);
  sound.play('whoosh');
  // posições anteriores (pelo ranking anterior) para animar a troca de lugar
  const prevOrder = [...p.top].sort((a, b) => a.prevRank - b.prevRank);
  setScreen(`
    <h1 class="board-title">Ranking</h1>
    <ol class="board" id="board">
      ${prevOrder.map((r) => rowHtml(r, true)).join('')}
    </ol>
    <div class="host-actions" style="margin-top:auto;padding-top:18px">
      <button class="btn btn--gold btn--big" id="nextBtn">${ic('arrow-right-circle')} Próxima pergunta</button>
    </div>
  `);
  const board = $('#board');
  const positions = {};
  for (const li of board.children) positions[li.dataset.id] = li.offsetTop;
  // reordena para a ordem nova e anima (FLIP)
  setTimeout(() => {
    if (!$('#board')) return;
    board.innerHTML = p.top.map((r) => rowHtml(r, false)).join('');
    icons();
    flip(board, positions);
    p.top.forEach((r) => countUp($(`[data-id="${r.id}"] .pts`, board), r.score, { from: r.score - r.gained, dur: 1400 }));
  }, 350);
  $('#nextBtn').addEventListener('click', () => socket.emit('host:next'));
  $('#nextBtn').focus({ preventScroll: true });
}

function rowHtml(r, before) {
  const up = r.prevRank - r.rank;
  return `<li class="row" data-id="${r.id}">
    <span class="pos">${before ? r.prevRank : r.rank}</span>
    <span class="av" aria-hidden="true">${esc(r.avatar)}</span>
    <span class="nm">${esc(r.nickname)}</span>
    ${!before && r.streak >= 2 ? `<span class="fire" title="Sequência de acertos">${ic('flame')}${r.streak}</span>` : ''}
    ${!before && up > 0 ? `<span class="delta" title="Subiu ${up}">${ic('chevron-up')}${up}</span>` : ''}
    <span class="pts">${fmtPts(before ? r.score - r.gained : r.score)}</span>
  </li>`;
}

function showPodium(p) {
  stage.ecg(false);
  stage.mood(null);
  progressPill.hidden = true;
  sound.music(null);
  const [first, second, third] = p.standings;
  const step = (pl, place) =>
    `<div class="step p${place} ${pl ? '' : 'empty'}" id="step${place}">
      <div class="who">
        ${place === 1 && pl ? '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8l5 4 5-7 5 7 5-4-2 11H4z"/></svg>' : ''}
        <span class="av">${esc(pl?.avatar || '')}</span>
        <span class="nm">${esc(pl?.nickname || '')}</span>
        <span class="sc">${pl ? `${fmtPts(pl.score)} pts` : ''}</span>
      </div>
      <div class="block">${place}</div>
    </div>`;
  setScreen(`
    <div class="podium-wrap">
      <h1 class="podium-title">Pódio do plantão</h1>
      <div class="podium">${step(second, 2)}${step(first, 1)}${step(third, 3)}</div>
      <div class="final-extra" id="extra">
        <div class="panel">
          <div class="stats">
            <div class="stat"><b>${p.stats.players}</b><span>jogadores</span></div>
            <div class="stat"><b>${p.stats.questions}</b><span>perguntas</span></div>
            <div class="stat"><b>${p.stats.accuracy}%</b><span>acerto da turma</span></div>
          </div>
          ${p.stats.hardest ? `<p class="hardest">Pergunta mais difícil: <b>${esc(p.stats.hardest.text)}</b> (${p.stats.hardest.rate}% de acerto). Vale retomar o slide.</p>` : ''}
        </div>
        <div class="panel">
          <ol class="full-rank">
            ${p.standings
              .map((s) => `<li><span>${s.rank}º</span><span aria-hidden="true">${esc(s.avatar)}</span><span>${esc(s.nickname)}</span><span class="muted">${s.accuracy}%</span><b>${fmtPts(s.score)}</b></li>`)
              .join('')}
          </ol>
        </div>
        <div class="host-actions">
          <button class="btn btn--ghost" id="csvBtn">${ic('download')} Baixar relatório</button>
          <button class="btn btn--ghost" id="againBtn">${ic('rotate-ccw')} Jogar de novo</button>
          <button class="btn btn--coral" id="endBtn">${ic('power')} Encerrar sala</button>
        </div>
      </div>
    </div>
  `);
  // sequência: 3º → 2º → rufar → 1º com confete
  const reveal = (id) => $(id)?.classList.add('show');
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  sound.play('drumroll');
  at(600, () => {
    reveal('#step3');
    sound.play('reveal');
  });
  at(2000, () => {
    reveal('#step2');
    sound.play('reveal');
  });
  at(3000, () => sound.play('drumroll'));
  at(5000, () => {
    reveal('#step1');
    sound.play('fanfare');
    confetti({ duration: 6000, count: 240 });
  });
  at(6800, () => $('#extra')?.classList.add('show'));
  state.stopClock = () => timers.forEach(clearTimeout);

  $('#csvBtn').addEventListener('click', downloadReport);
  $('#againBtn').addEventListener('click', () => socket.emit('host:again'));
  $('#endBtn').addEventListener('click', () => {
    if (confirm('Encerrar a sala? Todos os jogadores serão desconectados.')) endRoom();
  });
}

function downloadReport() {
  socket.emit('host:report', null, ({ rows }) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pulso-quiz-${state.room.pin}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Relatório baixado');
  });
}

// ---------- atalhos de teclado (apresentador) ----------
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if ((e.key === ' ' || e.key === 'Enter') && ['result', 'leaderboard'].includes(state.phase) && !e.target.closest('button')) {
    e.preventDefault();
    socket.emit('host:next');
  }
  if (e.key.toLowerCase() === 'm') sound.toggle();
  if (e.key.toLowerCase() === 'f') $('#fsBtn').click();
});

// ---------- socket ----------
socket.on('lobby:update', (d) => {
  state.players = d.players;
  state.locked = d.locked;
  if (state.phase === 'lobby') renderPlayers();
});
socket.on('answers:count', ({ answered }) => {
  const el = $('#ans');
  if (!el) return;
  el.textContent = answered;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  sound.play('tick');
});
socket.on('game:phase', onPhase);
socket.on('room:closed', () => {
  clearSession();
  toast('Sala encerrada.');
});

let booted = false;
socket.on('connect', () => {
  const saved = loadSession();
  if (saved?.hostToken) {
    socket.emit('host:resume', saved, (res) => {
      if (res?.ok) {
        state.room = { ...res, hostToken: saved.hostToken };
        state.settings = res.settings;
        if (!booted) {
          if (res.state?.phase && res.state.phase !== 'lobby') onPhase(res.state);
          else showLobby();
        }
      } else if (!booted) {
        clearSession();
        showSetup();
      }
      booted = true;
    });
    return;
  }
  if (!booted) {
    booted = true;
    showSetup();
  }
});
socket.on('disconnect', () => toast('Conexão perdida. Reconectando…', 4000));

// carrega o quiz antes de tudo
const quizReady = fetch('/api/quiz')
  .then((r) => r.json())
  .then((q) => {
    state.quiz = q;
    state.settings = loadSettings(q.defaults);
  });

screen.addEventListener('click', onSetupClick);
screen.addEventListener('change', onSetupChange);
