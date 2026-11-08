# Pulso Quiz

Quiz multiplayer em tempo real, no estilo Kahoot, sobre **Metodologias Ativas de Aprendizagem** (Didática Aplicada à Enfermagem · CEST). O apresentador projeta a sala, a turma entra pelo celular com um PIN e todos respondem às mesmas perguntas ao mesmo tempo. No final, um pódio animado mostra os três primeiros colocados.

**Online:** apresentador em **https://pulso-quiz.onrender.com/host** · jogadores em **https://pulso-quiz.onrender.com** (plano grátis do Render: o primeiro acesso depois de um tempo parado pode levar ~1 minuto).

## Como funciona

| Apresentador (projetor) | Jogador (celular) |
| --- | --- |
| Ajusta as regras e abre a sala | Abre o link ou lê o QR code |
| Projeta o PIN e o QR code | Digita o PIN, escolhe apelido e avatar |
| Vê os jogadores entrando e pode removê-los ou trancar a sala | Espera no lobby |
| Conduz as 10 perguntas, vê a distribuição das respostas e a explicação | Responde tocando na forma colorida |
| Mostra o ranking entre as perguntas e o pódio no final | Vê se acertou, os pontos ganhos e sua posição |
| Baixa o relatório da turma (CSV) | Vê sua colocação final |

## Recursos

- **10 perguntas, 4 alternativas, 1 correta**, todas tiradas dos slides (conceito, Arco de Maguerez, características, DCN, PBL, sala de aula invertida e o caso clínico do Sr. Raimundo), cada uma com explicação e referência ao slide.
- **Pontuação estilo Kahoot**: até 1.000 pts por acerto, caindo até 500 conforme o tempo passa; bônus de sequência (+100 por acerto seguido, até +500).
- **Configurações do criador da sala**: tempo por pergunta (padrão 20 s, de 5 a 120 s), tempo próprio por pergunta, tempo de leitura, pontuação padrão/em dobro/sem pontos, bônus de velocidade e de sequência, embaralhar perguntas e alternativas, mostrar ou não a pergunta no celular, explicação após cada pergunta, avanço automático, limite de jogadores e escolha de quais perguntas usar.
- **Sala**: PIN de 6 dígitos, QR code (aponta para o IP da rede local quando aberto em `localhost`), trancar sala, remover jogador, reconexão automática se o celular bloquear a tela ou a página recarregar.
- **Som liga/desliga** (tecla `M`): trilha do lobby, trilha de tensão durante a pergunta, contagem regressiva, acerto/erro, rufar de tambores e fanfarra do pódio — tudo sintetizado com Web Audio, sem arquivos de áudio.
- **Animações**: linha de ECG no fundo que pulsa quando alguém entra, contagem 3‑2‑1, cronômetro circular, barras de resultado, ranking com troca de posições animada, pódio que sobe em sequência (3º → 2º → 1º) com confete.
- **Mobile first** e responsivo para tablet e desktop/projetor. Respeita `prefers-reduced-motion`. Tela cheia (tecla `F`), atalhos `Espaço`/`Enter` para avançar.

## Rodando localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

- Apresentador: http://localhost:3000/host
- Jogadores: http://localhost:3000 (ou o endereço/QR code mostrado no lobby)

Para os celulares entrarem, eles precisam estar na mesma rede Wi‑Fi do computador (ou o app precisa estar publicado na internet — veja abaixo).

### Testes

```bash
npm test
```

Testa a pontuação, a validação das configurações e uma partida completa com vários jogadores via Socket.IO (entrada, apelido duplicado, sala fechada após o início, respostas, tempo esgotado, pular pergunta, avanço automático, ranking, pódio, relatório, reconexão e "jogar de novo").

Para simular uma turma numa sala aberta: `node scripts/bots.js <PIN> 8`.

## Publicando

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/seeniam/kahoot)

O app é um servidor Node (Express + Socket.IO) com estado em memória, então precisa de um host que mantenha um processo rodando com WebSocket — por exemplo **Render**, **Railway** ou **Fly.io**. O repositório já inclui `render.yaml`: clique no botão acima (ou, no Render, crie um *Blueprint* apontando para este repositório). Defina `PUBLIC_URL` se quiser fixar o endereço usado no QR code.

No plano grátis do Render o serviço "dorme" após 15 minutos sem uso e leva cerca de 1 minuto para acordar: abra a página do apresentador alguns minutos antes da aula.

## Estrutura

```
server/
  index.js       servidor HTTP + Socket.IO, salas e eventos
  game.js        regras: fases, pontuação, ranking, pódio, relatório
  questions.js   as 10 perguntas tiradas dos slides
public/
  index.html     tela do jogador
  host.html      tela do apresentador
  css/app.css    tema e animações
  js/            player.js, host.js, ui.js (utilitários e confete), sound.js (áudio)
test/            testes automatizados (node:test)
scripts/bots.js  jogadores simulados
```
