// Simula jogadores para testar uma sala: node scripts/bots.js <PIN> [quantidade] [url]
import { io } from 'socket.io-client';
import { QUIZ } from '../server/questions.js';

const [pin, count = 5, url = 'http://localhost:3000'] = process.argv.slice(2);
if (!pin) {
  console.error('Uso: node scripts/bots.js <PIN> [quantidade] [url]');
  process.exit(1);
}
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Kelly', 'Lucas'];
const AV = ['🩺', '💉', '🫀', '🧠', '💊', '🩹', '🧬', '🔬', '📚', '💡', '🦉', '🐙'];

for (let i = 0; i < Number(count); i++) {
  const skill = 0.35 + Math.random() * 0.6; // chance de acertar
  const s = io(url, { transports: ['websocket'] });
  s.on('connect', () => {
    s.emit('player:join', { pin, nickname: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : ''), avatar: AV[i % AV.length] }, (r) =>
      console.log(r.ok ? `entrou: ${r.nickname}` : `erro: ${r.error}`)
    );
  });
  const answers = QUIZ.questions.map((x) => x.correct);
  s.on('game:phase', (p) => {
    if (p.phase === 'question') {
      const delay = 1500 + Math.random() * Math.min(p.durationMs - 2000, 9000);
      setTimeout(() => {

        const choice = Math.random() < skill ? answers[p.number - 1] : Math.floor(Math.random() * 4);
        s.emit('player:answer', { choice, number: p.number }, () => {});
      }, delay);
    }
    if (p.phase === 'podium') console.log(`${NAMES[i % NAMES.length]}: ${p.rank}º com ${p.score} pts`);
  });
  s.on('room:closed', () => process.exit(0));
}
