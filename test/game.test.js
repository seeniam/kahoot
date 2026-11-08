import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { createServer } from '../server/index.js';
import { calcPoints, sanitizeSettings, cleanNickname } from '../server/game.js';
import { QUIZ } from '../server/questions.js';

// ---------- unidade ----------
test('o quiz tem 10 perguntas com 4 alternativas e uma correta', () => {
  assert.equal(QUIZ.questions.length, 10);
  for (const q of QUIZ.questions) {
    assert.equal(q.answers.length, 4, q.text);
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, q.text);
    assert.equal(new Set(q.answers).size, 4, `alternativas repetidas: ${q.text}`);
    assert.ok(q.explanation.length > 20);
  }
});

test('pontuação: velocidade, sequência e modos', () => {
  assert.equal(calcPoints({ correct: false, elapsedMs: 0, limitMs: 20000 }).total, 0);
  assert.equal(calcPoints({ correct: true, elapsedMs: 0, limitMs: 20000 }).total, 1000);
  assert.equal(calcPoints({ correct: true, elapsedMs: 20000, limitMs: 20000 }).total, 500);
  assert.equal(calcPoints({ correct: true, elapsedMs: 10000, limitMs: 20000 }).total, 750);
  assert.equal(calcPoints({ correct: true, elapsedMs: 10000, limitMs: 20000, speedBonus: false }).total, 1000);
  assert.equal(calcPoints({ correct: true, elapsedMs: 0, limitMs: 20000, points: 'double' }).total, 2000);
  assert.equal(calcPoints({ correct: true, elapsedMs: 0, limitMs: 20000, points: 'none' }).total, 0);
  assert.equal(calcPoints({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 3 }).total, 1200);
  assert.equal(calcPoints({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 30 }).total, 1500);
  assert.equal(calcPoints({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 3, streakBonus: false }).total, 1000);
});

test('configurações inválidas voltam ao padrão', () => {
  const s = sanitizeSettings({ timeLimit: 7, points: 'mega', readTime: 99, questions: [{ index: 0, enabled: false, timeLimit: 30 }] });
  assert.equal(s.timeLimit, 20);
  assert.equal(s.points, 'standard');
  assert.equal(s.readTime, 3);
  assert.equal(s.questions[0].enabled, false);
  assert.equal(s.questions[0].timeLimit, 30);
  const none = sanitizeSettings({ questions: QUIZ.questions.map((_, index) => ({ index, enabled: false })) });
  assert.ok(none.questions.some((q) => q.enabled), 'mantém ao menos uma pergunta');
});

test('apelidos são limpos', () => {
  assert.equal(cleanNickname('  <b>Ana</b>   Maria  '), 'bAna/b Maria');
  assert.equal(cleanNickname('x'.repeat(40)).length, 16);
});

// ---------- integração (sala real com vários jogadores) ----------
let srv;
let url;
before(async () => {
  srv = createServer({ speed: 20 });
  await new Promise((r) => srv.server.listen(0, r));
  url = `http://localhost:${srv.server.address().port}`;
});
after(() => {
  srv.io.close();
  srv.server.close();
});

const connect = () =>
  new Promise((resolve) => {
    const s = ioc(url, { transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
  });
const call = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
const waitPhase = (s, phase, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout esperando ${phase}`)), timeout);
    const h = (p) => {
      if (p.phase === phase) {
        clearTimeout(t);
        s.off('game:phase', h);
        resolve(p);
      }
    };
    s.on('game:phase', h);
  });

test('partida completa: 3 jogadores, 10 perguntas, ranking e pódio', async () => {
  const host = await connect();
  const created = await call(host, 'host:create', { settings: { timeLimit: 20, readTime: 3 } });
  assert.ok(created.ok);
  assert.match(created.pin, /^\d{6}$/);
  assert.ok(created.qr.startsWith('data:image/png'));

  assert.equal((await call(host, 'room:check', '000000')).ok, false);
  assert.equal((await call(host, 'room:check', created.pin)).ok, true);

  const names = ['Ana', 'Bruno', 'Carla'];
  const players = [];
  for (const nickname of names) {
    const s = await connect();
    const res = await call(s, 'player:join', { pin: created.pin, nickname });
    assert.ok(res.ok, res.error);
    players.push({ s, nickname, ...res });
  }
  const dup = await connect();
  const dupRes = await call(dup, 'player:join', { pin: created.pin, nickname: 'ana' });
  assert.equal(dupRes.ok, false, 'apelido duplicado deve ser recusado');
  dup.close();

  const startRes = await call(host, 'host:start');
  assert.ok(startRes.ok);
  const late = await connect();
  assert.equal((await call(late, 'player:join', { pin: created.pin, nickname: 'Atrasado' })).ok, false);
  late.close();

  for (let n = 1; n <= 10; n++) {
    const hostQ = await waitPhase(host, 'question');
    assert.equal(hostQ.number, n);
    assert.equal(hostQ.answers.length, 4);
    const correct = QUIZ.questions[n - 1].correct;
    // Ana acerta sempre, Bruno acerta nas pares, Carla nunca responde na pergunta 5
    const plan = [correct, n % 2 === 0 ? correct : (correct + 1) % 4, n === 5 ? null : (correct + 2) % 4];
    const resultWaits = players.map((p) => waitPhase(p.s, 'result'));
    const hostResult = waitPhase(host, 'result');
    for (let i = 0; i < players.length; i++) {
      if (plan[i] == null) continue;
      const r = await call(players[i].s, 'player:answer', { choice: plan[i], number: n });
      assert.ok(r.ok, r.error);
    }
    const again = await call(players[0].s, 'player:answer', { choice: 0, number: n });
    assert.ok(again.error, 'não pode responder duas vezes');

    const hr = await hostResult;
    assert.equal(hr.correct, correct);
    assert.equal(hr.distribution.reduce((a, b) => a + b, 0), plan.filter((x) => x != null).length);
    const prs = await Promise.all(resultWaits);
    assert.equal(prs[0].correct, true);
    assert.ok(prs[0].points.total >= 500);
    assert.equal(prs[2].correct, false);
    assert.equal(prs[2].points.total, 0);
    if (n === 5) assert.equal(prs[2].answered, false);

    if (n < 10) {
      const lb = waitPhase(host, 'leaderboard');
      host.emit('host:next');
      const board = await lb;
      assert.equal(board.top[0].nickname, 'Ana');
      host.emit('host:next');
    } else {
      const podium = waitPhase(host, 'podium');
      const playerPodium = waitPhase(players[1].s, 'podium');
      host.emit('host:next');
      const final = await podium;
      assert.deepEqual(final.standings.map((s) => s.nickname), ['Ana', 'Bruno', 'Carla']);
      assert.equal(final.standings[0].accuracy, 100);
      assert.equal(final.standings[0].bestStreak, 10);
      assert.equal(final.standings[2].score, 0);
      const mine = await playerPodium;
      assert.equal(mine.rank, 2);
      assert.equal(mine.correctCount, 5);
    }
  }

  const report = await call(host, 'host:report');
  assert.equal(report.rows.length, 4);
  assert.equal(report.rows[1][1], 'Ana');

  // Reconexão de jogador com o token salvo
  const re = await connect();
  const resumed = await call(re, 'player:resume', { pin: created.pin, token: players[0].token });
  assert.ok(resumed.ok);
  assert.equal(resumed.state.phase, 'podium');

  // Jogar de novo zera a pontuação e volta ao lobby
  const lobby = waitPhase(players[0].s, 'lobby');
  host.emit('host:again');
  await lobby;

  for (const p of players) p.s.close();
  re.close();
  host.close();
});

test('jogador desconectado não segura a pergunta', async () => {
  const host = await connect();
  const created = await call(host, 'host:create', { settings: { timeLimit: 120, readTime: 0 } });
  const a = await connect();
  const b = await connect();
  await call(a, 'player:join', { pin: created.pin, nickname: 'Fica' });
  await call(b, 'player:join', { pin: created.pin, nickname: 'Cai' });
  await call(host, 'host:start');
  const q = await waitPhase(host, 'question');
  b.close(); // perde a conexão
  await new Promise((r) => setTimeout(r, 150));
  const started = Date.now();
  const result = waitPhase(host, 'result', 2000);
  await call(a, 'player:answer', { choice: 0, number: q.number });
  const r = await result;
  assert.ok(Date.now() - started < 1500, 'encerrou sem esperar os 120 s');
  assert.equal(r.playerCount, 2, 'o jogador que caiu continua no ranking');
  a.close();
  host.close();
});

test('pergunta encerra por tempo e o apresentador pode pular', async () => {
  const host = await connect();
  const created = await call(host, 'host:create', { settings: { timeLimit: 5, readTime: 0, autoAdvance: true, autoAdvanceDelay: 4, questions: QUIZ.questions.map((_, index) => ({ index, enabled: index < 2 })) } });
  const p = await connect();
  await call(p, 'player:join', { pin: created.pin, nickname: 'Solo' });
  await call(host, 'host:start');
  const q1 = await waitPhase(host, 'question');
  assert.equal(q1.total, 2, 'somente perguntas ativadas');
  const r1 = await waitPhase(p, 'result'); // tempo esgota sozinho (5s / 20)
  assert.equal(r1.answered, false);
  await waitPhase(host, 'leaderboard'); // avanço automático
  await waitPhase(host, 'question');
  host.emit('host:skip');
  await waitPhase(host, 'result');
  await waitPhase(host, 'podium');
  p.close();
  host.close();
});
