import crypto from 'node:crypto';
import { QUIZ } from './questions.js';

export const TIME_OPTIONS = [5, 10, 20, 30, 45, 60, 90, 120];
export const READ_OPTIONS = [0, 3, 5, 8];
export const POINTS_OPTIONS = ['standard', 'double', 'none'];
const POINTS_MULTIPLIER = { standard: 1, double: 2, none: 0 };

export const DEFAULT_SETTINGS = Object.freeze({
  timeLimit: 20, // segundos por pergunta (padrão)
  readTime: 3, // segundos mostrando a pergunta antes das alternativas
  points: 'standard', // standard | double | none
  speedBonus: true, // responder rápido vale mais
  streakBonus: true, // bônus por sequência de acertos
  shuffleQuestions: false,
  shuffleAnswers: false,
  showQuestionOnDevices: true,
  showExplanation: true,
  autoAdvance: false,
  autoAdvanceDelay: 6, // segundos em resultado/ranking quando autoAdvance
  maxPlayers: 60,
  questions: QUIZ.questions.map((_, i) => ({ index: i, enabled: true, timeLimit: null })),
});

const AVATARS = ['🩺', '💉', '🫀', '🧠', '💊', '🩹', '🧬', '🔬', '📚', '💡', '🦉', '🐙', '🦊', '🐼', '🐯', '🦄'];
export const AVATAR_LIST = AVATARS;

const clampChoice = (value, options, fallback) => (options.includes(value) ? value : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

export function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const s = {
    timeLimit: clampChoice(Number(input.timeLimit), TIME_OPTIONS, base.timeLimit),
    readTime: clampChoice(Number(input.readTime), READ_OPTIONS, base.readTime),
    points: clampChoice(input.points, POINTS_OPTIONS, base.points),
    speedBonus: bool(input.speedBonus, base.speedBonus),
    streakBonus: bool(input.streakBonus, base.streakBonus),
    shuffleQuestions: bool(input.shuffleQuestions, base.shuffleQuestions),
    shuffleAnswers: bool(input.shuffleAnswers, base.shuffleAnswers),
    showQuestionOnDevices: bool(input.showQuestionOnDevices, base.showQuestionOnDevices),
    showExplanation: bool(input.showExplanation, base.showExplanation),
    autoAdvance: bool(input.autoAdvance, base.autoAdvance),
    autoAdvanceDelay: clampChoice(Number(input.autoAdvanceDelay), [4, 6, 8, 10, 15], base.autoAdvanceDelay),
    maxPlayers: Math.max(2, Math.min(200, Number.parseInt(input.maxPlayers, 10) || base.maxPlayers)),
    questions: base.questions.map((q) => ({ ...q })),
  };
  if (Array.isArray(input.questions)) {
    s.questions = QUIZ.questions.map((_, i) => {
      const found = input.questions.find((q) => Number(q?.index) === i) || base.questions[i] || {};
      const tl = found.timeLimit == null || found.timeLimit === '' ? null : Number(found.timeLimit);
      return {
        index: i,
        enabled: bool(found.enabled, true),
        timeLimit: TIME_OPTIONS.includes(tl) ? tl : null,
      };
    });
  }
  if (!s.questions.some((q) => q.enabled)) s.questions[0].enabled = true;
  return s;
}

/**
 * Pontuação inspirada no Kahoot:
 *  - acerto vale até 1000 pts (x multiplicador);
 *  - com bônus de velocidade, cai linearmente até 500 pts no fim do tempo;
 *  - bônus de sequência: +100 por acerto seguido a partir do 2º (máx. +500).
 */
export function calcPoints({ correct, elapsedMs, limitMs, points = 'standard', speedBonus = true, streak = 0, streakBonus = true }) {
  const mult = POINTS_MULTIPLIER[points] ?? 1;
  if (!correct || mult === 0) return { base: 0, bonus: 0, total: 0 };
  const ratio = Math.min(1, Math.max(0, elapsedMs / limitMs));
  const base = Math.round((speedBonus ? 1000 * (1 - ratio / 2) : 1000) * mult);
  const bonus = streakBonus && streak >= 2 ? Math.min((streak - 1) * 100, 500) * mult : 0;
  return { base, bonus, total: base + bonus };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cleanNickname(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

const token = () => crypto.randomBytes(16).toString('hex');

export class Room {
  /**
   * @param {object} opts
   * @param {string} opts.pin
   * @param {object} opts.settings
   * @param {(target: {type:'host'}|{type:'player',id:string}|{type:'all'}, event: string, payload: any) => void} opts.send
   * @param {number} [opts.speed] fator de aceleração (testes)
   */
  constructor({ pin, settings, send, speed = 1 }) {
    this.pin = pin;
    this.hostToken = token();
    this.settings = sanitizeSettings(settings);
    // Guarda a última fase enviada a cada destinatário para quem reconectar.
    this.lastPhase = { host: null, players: new Map() };
    this.send = (target, event, payload) => {
      if (event === 'game:phase') {
        const rec = { payload, sentAt: Date.now() };
        if (target.type === 'host') this.lastPhase.host = rec;
        else if (target.type === 'player') this.lastPhase.players.set(target.id, rec);
      }
      send(target, event, payload);
    };
    this.speed = speed;
    this.players = new Map(); // id -> player
    this.locked = false;
    this.phase = 'lobby';
    this.round = null; // pergunta atual
    this.order = [];
    this.qPos = -1;
    this.timer = null;
    this.createdAt = Date.now();
    this.touchedAt = Date.now();
    this.hostConnected = true;
    this.history = [];
  }

  ms(seconds) {
    return Math.round((seconds * 1000) / this.speed);
  }

  touch() {
    this.touchedAt = Date.now();
  }

  // ---------- jogadores ----------
  addPlayer(nicknameRaw, avatarRaw) {
    const nickname = cleanNickname(nicknameRaw);
    if (nickname.length < 2) return { error: 'Use um apelido com pelo menos 2 caracteres.' };
    if (this.locked) return { error: 'A sala está trancada pelo apresentador.' };
    if (this.phase !== 'lobby') return { error: 'O jogo já começou. Aguarde a próxima rodada.' };
    if (this.players.size >= this.settings.maxPlayers) return { error: 'A sala está cheia.' };
    const taken = [...this.players.values()].some((p) => p.nickname.toLocaleLowerCase('pt-BR') === nickname.toLocaleLowerCase('pt-BR'));
    if (taken) return { error: 'Esse apelido já está em uso nesta sala.' };
    const avatar = AVATARS.includes(avatarRaw) ? avatarRaw : AVATARS[crypto.randomInt(AVATARS.length)];
    const player = {
      id: crypto.randomUUID(),
      token: token(),
      nickname,
      avatar,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correctCount: 0,
      rank: 0,
      prevRank: 0,
      connected: true,
      joinedAt: Date.now(),
      answers: [],
    };
    this.players.set(player.id, player);
    this.touch();
    this.broadcastLobby();
    return { player };
  }

  findByToken(tok) {
    return [...this.players.values()].find((p) => p.token === tok) || null;
  }

  kick(playerId) {
    const p = this.players.get(playerId);
    if (!p) return false;
    this.players.delete(playerId);
    this.send({ type: 'player', id: playerId }, 'player:kicked', {});
    this.broadcastLobby();
    if (this.phase === 'question') {
      this.sendAnswerCount();
      if (this.allAnswered()) this.schedule(400, () => this.closeQuestion('all'));
    }
    return p;
  }

  setConnected(playerId, connected) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = connected;
    if (this.phase === 'lobby') this.broadcastLobby();
    if (this.phase === 'question') {
      this.sendAnswerCount();
      if (!connected && this.allAnswered()) this.schedule(400, () => this.closeQuestion('all'));
    }
  }

  publicPlayer(p) {
    return { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, connected: p.connected, streak: p.streak, correctCount: p.correctCount };
  }

  broadcastLobby() {
    this.send({ type: 'host' }, 'lobby:update', {
      players: [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => this.publicPlayer(p)),
      locked: this.locked,
      settings: this.settings,
    });
  }

  // ---------- fluxo ----------
  updateSettings(input) {
    if (this.phase !== 'lobby') return false;
    this.settings = sanitizeSettings(input, this.settings);
    this.broadcastLobby();
    return true;
  }

  start() {
    if (this.phase !== 'lobby') return { error: 'O jogo já começou.' };
    if (this.players.size === 0) return { error: 'Espere pelo menos um jogador entrar.' };
    const enabled = this.settings.questions.filter((q) => q.enabled).map((q) => q.index);
    this.order = this.settings.shuffleQuestions ? shuffle(enabled) : enabled;
    this.qPos = -1;
    this.locked = true;
    this.history = [];
    this.setPhase('starting', { total: this.order.length, durationMs: this.ms(4), title: QUIZ.title });
    this.schedule(this.ms(4), () => this.nextQuestion());
    return { ok: true };
  }

  schedule(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  setPhase(phase, payload = {}, perPlayer) {
    this.phase = phase;
    this.touch();
    this.send({ type: 'host' }, 'game:phase', { phase, ...payload });
    for (const p of this.players.values()) {
      const extra = perPlayer ? perPlayer(p) : {};
      this.send({ type: 'player', id: p.id }, 'game:phase', { phase, ...payload, ...extra });
    }
  }

  currentQuestion() {
    return this.round?.question;
  }

  nextQuestion() {
    clearTimeout(this.timer);
    this.qPos += 1;
    if (this.qPos >= this.order.length) return this.finish();
    const qIndex = this.order[this.qPos];
    const src = QUIZ.questions[qIndex];
    const perm = this.settings.shuffleAnswers ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3];
    const answers = perm.map((i) => src.answers[i]);
    const correct = perm.indexOf(src.correct);
    const limit = this.settings.questions[qIndex]?.timeLimit || this.settings.timeLimit;
    this.round = {
      number: this.qPos + 1,
      total: this.order.length,
      qIndex,
      question: { ...src, answers, correct },
      limitSec: limit,
      responses: new Map(), // playerId -> {choice, elapsedMs}
      startedAt: 0,
    };
    for (const p of this.players.values()) p.prevRank = p.rank;

    const readMs = this.ms(this.settings.readTime);
    if (readMs > 0) {
      this.setPhase('intro', {
        number: this.round.number,
        total: this.round.total,
        topic: src.topic,
        icon: src.icon,
        text: src.text,
        durationMs: readMs,
      });
      this.schedule(readMs, () => this.openAnswers());
    } else {
      this.openAnswers();
    }
  }

  questionPayload(includeText) {
    const r = this.round;
    return {
      number: r.number,
      total: r.total,
      topic: r.question.topic,
      icon: r.question.icon,
      text: includeText ? r.question.text : null,
      answers: includeText ? r.question.answers : null,
      durationMs: this.ms(r.limitSec),
      limitSec: r.limitSec,
      playerCount: this.activePlayerCount(),
    };
  }

  /** Jogadores conectados — quem caiu não segura a pergunta até o fim do tempo. */
  activePlayerCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n += 1;
    return n;
  }

  allAnswered() {
    if (!this.round) return false;
    const online = [...this.players.values()].filter((p) => p.connected);
    return online.length > 0 && online.every((p) => this.round.responses.has(p.id));
  }

  openAnswers() {
    const r = this.round;
    r.startedAt = Date.now();
    this.phase = 'question';
    this.touch();
    this.send({ type: 'host' }, 'game:phase', { phase: 'question', ...this.questionPayload(true) });
    const forPlayers = this.questionPayload(this.settings.showQuestionOnDevices);
    for (const p of this.players.values()) {
      this.send({ type: 'player', id: p.id }, 'game:phase', { phase: 'question', ...forPlayers, answered: false });
    }
    this.schedule(this.ms(r.limitSec) + 250, () => this.closeQuestion('timeup'));
  }

  answer(playerId, choice, number) {
    if (this.phase !== 'question' || !this.round) return { error: 'Tempo esgotado.' };
    if (number != null && Number(number) !== this.round.number) return { error: 'Pergunta encerrada.' };
    const p = this.players.get(playerId);
    if (!p) return { error: 'Jogador não encontrado.' };
    const c = Number(choice);
    if (!Number.isInteger(c) || c < 0 || c > 3) return { error: 'Alternativa inválida.' };
    if (this.round.responses.has(playerId)) return { error: 'Você já respondeu.' };
    const elapsedMs = Math.max(0, (Date.now() - this.round.startedAt) * this.speed);
    this.round.responses.set(playerId, { choice: c, elapsedMs });
    this.sendAnswerCount();
    if (this.allAnswered()) this.schedule(400, () => this.closeQuestion('all'));
    return { ok: true };
  }

  sendAnswerCount() {
    this.send({ type: 'host' }, 'answers:count', { answered: this.round?.responses.size ?? 0, total: this.activePlayerCount() });
  }

  skip() {
    if (this.phase === 'intro') return this.openAnswers();
    if (this.phase === 'question') return this.closeQuestion('skip');
  }

  rankPlayers() {
    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    sorted.forEach((p, i) => {
      p.rank = i + 1;
    });
    return sorted;
  }

  closeQuestion(reason) {
    if (this.phase !== 'question') return;
    clearTimeout(this.timer);
    const r = this.round;
    const q = r.question;
    const limitMs = r.limitSec * 1000;
    const distribution = [0, 0, 0, 0];
    const results = new Map();
    let fastest = null;

    for (const p of this.players.values()) {
      const resp = r.responses.get(p.id);
      const correct = !!resp && resp.choice === q.correct;
      if (resp) distribution[resp.choice] += 1;
      p.streak = correct ? p.streak + 1 : 0;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      if (correct) p.correctCount += 1;
      const pts = calcPoints({
        correct,
        elapsedMs: resp?.elapsedMs ?? limitMs,
        limitMs,
        points: this.settings.points,
        speedBonus: this.settings.speedBonus,
        streak: p.streak,
        streakBonus: this.settings.streakBonus,
      });
      p.score += pts.total;
      p.answers.push({ number: r.number, qIndex: r.qIndex, choice: resp?.choice ?? null, correct, points: pts.total, elapsedMs: resp?.elapsedMs ?? null });
      results.set(p.id, { answered: !!resp, choice: resp?.choice ?? null, correct, points: pts, elapsedMs: resp?.elapsedMs ?? null });
      if (correct && (!fastest || resp.elapsedMs < fastest.elapsedMs)) fastest = { nickname: p.nickname, avatar: p.avatar, elapsedMs: resp.elapsedMs };
    }
    const ranked = this.rankPlayers();
    const answered = r.responses.size;
    const correctCount = distribution[q.correct];
    this.history.push({ number: r.number, qIndex: r.qIndex, distribution, correct: q.correct, answered, correctCount, total: this.players.size });

    const hostPayload = {
      number: r.number,
      total: r.total,
      text: q.text,
      topic: q.topic,
      answers: q.answers,
      correct: q.correct,
      distribution,
      answered,
      playerCount: this.players.size,
      explanation: this.settings.showExplanation ? q.explanation : null,
      slide: q.slide,
      fastest,
      reason,
      isLast: r.number >= r.total,
    };
    this.phase = 'result';
    this.touch();
    this.send({ type: 'host' }, 'game:phase', { phase: 'result', ...hostPayload });
    for (const p of this.players.values()) {
      const res = results.get(p.id);
      const ahead = p.rank > 1 ? ranked[p.rank - 2] : null;
      this.send({ type: 'player', id: p.id }, 'game:phase', {
        phase: 'result',
        number: r.number,
        total: r.total,
        correctAnswer: q.answers[q.correct],
        correctIndex: q.correct,
        explanation: this.settings.showExplanation ? q.explanation : null,
        ...res,
        score: p.score,
        streak: p.streak,
        rank: p.rank,
        playerCount: this.players.size,
        ahead: ahead ? { nickname: ahead.nickname, gap: ahead.score - p.score } : null,
      });
    }
    if (this.settings.autoAdvance) this.schedule(this.ms(this.settings.autoAdvanceDelay), () => this.next());
  }

  leaderboard() {
    const ranked = this.rankPlayers();
    const r = this.round;
    this.phase = 'leaderboard';
    this.touch();
    const top = ranked.slice(0, 5).map((p) => ({ ...this.publicPlayer(p), rank: p.rank, prevRank: p.prevRank || p.rank, gained: p.answers.at(-1)?.points ?? 0 }));
    this.send({ type: 'host' }, 'game:phase', { phase: 'leaderboard', number: r.number, total: r.total, top, isLast: r.number >= r.total });
    for (const p of ranked) {
      const ahead = p.rank > 1 ? ranked[p.rank - 2] : null;
      this.send({ type: 'player', id: p.id }, 'game:phase', {
        phase: 'leaderboard',
        number: r.number,
        total: r.total,
        rank: p.rank,
        prevRank: p.prevRank || p.rank,
        score: p.score,
        playerCount: ranked.length,
        ahead: ahead ? { nickname: ahead.nickname, gap: ahead.score - p.score } : null,
      });
    }
    if (this.settings.autoAdvance) this.schedule(this.ms(this.settings.autoAdvanceDelay), () => this.next());
  }

  next() {
    if (this.phase === 'result') {
      if (this.round.number >= this.round.total) return this.finish();
      return this.leaderboard();
    }
    if (this.phase === 'leaderboard') return this.nextQuestion();
  }

  finish() {
    clearTimeout(this.timer);
    const ranked = this.rankPlayers();
    const totalQ = this.order.length;
    const standings = ranked.map((p) => ({
      ...this.publicPlayer(p),
      rank: p.rank,
      bestStreak: p.bestStreak,
      accuracy: totalQ ? Math.round((p.correctCount / totalQ) * 100) : 0,
    }));
    const accuracy = this.history.length
      ? Math.round((this.history.reduce((s, h) => s + (h.total ? h.correctCount / h.total : 0), 0) / this.history.length) * 100)
      : 0;
    const hardest = [...this.history].sort((a, b) => a.correctCount / (a.total || 1) - b.correctCount / (b.total || 1))[0];
    this.phase = 'podium';
    this.touch();
    this.send({ type: 'host' }, 'game:phase', {
      phase: 'podium',
      standings,
      stats: {
        accuracy,
        questions: totalQ,
        players: ranked.length,
        hardest: hardest ? { number: hardest.number, text: QUIZ.questions[hardest.qIndex].text, rate: Math.round((hardest.correctCount / (hardest.total || 1)) * 100) } : null,
      },
      history: this.history.map((h) => ({ ...h, text: QUIZ.questions[h.qIndex].text })),
    });
    for (const p of ranked) {
      this.send({ type: 'player', id: p.id }, 'game:phase', {
        phase: 'podium',
        rank: p.rank,
        score: p.score,
        playerCount: ranked.length,
        correctCount: p.correctCount,
        total: totalQ,
        bestStreak: p.bestStreak,
        top3: standings.slice(0, 3).map(({ nickname, avatar, score, rank }) => ({ nickname, avatar, score, rank })),
      });
    }
  }

  report() {
    const header = ['Posição', 'Apelido', 'Pontos', 'Acertos', 'Maior sequência', ...this.order.map((_, i) => `P${i + 1}`)];
    const rows = this.rankPlayers().map((p) => [
      p.rank,
      p.nickname,
      p.score,
      p.correctCount,
      p.bestStreak,
      ...this.order.map((_, i) => {
        const a = p.answers.find((x) => x.number === i + 1);
        if (!a || a.choice == null) return '—';
        return `${'ABCD'[a.choice]}${a.correct ? ' ✓' : ' ✗'} (${a.points})`;
      }),
    ]);
    return [header, ...rows];
  }

  /** Última fase enviada, com o tempo restante ajustado, para quem reconectar. */
  resumePayload(target) {
    const rec = target.type === 'host' ? this.lastPhase.host : this.lastPhase.players.get(target.id);
    if (!rec) return { phase: this.phase };
    const payload = { ...rec.payload };
    if (payload.durationMs) payload.durationMs = Math.max(0, payload.durationMs - (Date.now() - rec.sentAt));
    if (payload.phase === 'question' && target.type === 'player') payload.answered = this.round?.responses.has(target.id) ?? false;
    if (payload.phase === 'question' && target.type === 'host') payload.answeredCount = this.round?.responses.size ?? 0;
    return payload;
  }

  playAgain() {
    clearTimeout(this.timer);
    for (const p of this.players.values()) {
      Object.assign(p, { score: 0, streak: 0, bestStreak: 0, correctCount: 0, rank: 0, prevRank: 0, answers: [] });
    }
    this.round = null;
    this.qPos = -1;
    this.locked = false;
    this.phase = 'lobby';
    this.setPhase('lobby', {});
    this.broadcastLobby();
  }

  destroy() {
    clearTimeout(this.timer);
    this.send({ type: 'all' }, 'room:closed', {});
  }
}
