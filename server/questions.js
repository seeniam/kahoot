// Perguntas extraídas dos slides "Metodologias Ativas de Aprendizagem"
// (Didática Aplicada à Enfermagem · CEST). Cada pergunta tem 4 alternativas
// e exatamente uma correta (índice `correct`).

export const QUIZ = {
  title: 'Metodologias Ativas de Aprendizagem',
  subtitle: 'Didática Aplicada à Enfermagem',
  questions: [
    {
      topic: 'Conceito',
      icon: 'graduation-cap',
      text: 'Nas metodologias ativas, qual é o papel do professor?',
      answers: [
        'Único detentor do saber, que transmite o conteúdo pronto',
        'Mediador, que orienta, provoca e dá feedback',
        'Ouvinte, que apenas observa os alunos trabalharem',
        'Avaliador, focado somente na prova final',
      ],
      correct: 1,
      explanation:
        'O professor deixa de ser o único detentor do saber e passa a ser mediador: orienta, provoca e dá feedback (Berbel, 2011; Bacich e Moran, 2018).',
      slide: 2,
    },
    {
      topic: 'Conceito',
      icon: 'landmark',
      text: 'Paulo Freire criticava a “educação bancária”. O que ela representa?',
      answers: [
        'O aluno constrói o conhecimento a partir de problemas reais',
        'A avaliação é contínua, ao longo de todo o processo',
        'O professor apenas deposita conteúdos no aluno',
        'A teoria é estudada em casa e a prática em sala',
      ],
      correct: 2,
      explanation:
        'Na educação bancária o professor apenas “deposita” conteúdos no aluno. As metodologias ativas rompem com essa lógica (Freire, 1987).',
      slide: 2,
    },
    {
      topic: 'Processo',
      icon: 'route',
      text: 'No Arco de Maguerez, em qual etapa o grupo busca respostas em artigos, protocolos e livros?',
      answers: ['Observação da realidade', 'Pontos-chave', 'Teorização', 'Aplicação à realidade'],
      correct: 2,
      explanation:
        'Na Teorização o grupo estuda individualmente e discute em grupo. Exemplo: estudar o Protocolo de Prevenção de Quedas (Brasil, 2013).',
      slide: 3,
    },
    {
      topic: 'Processo',
      icon: 'footprints',
      text: 'Qual é a primeira etapa do Arco de Maguerez?',
      answers: ['Hipóteses de solução', 'Observação da realidade', 'Teorização', 'Pontos-chave'],
      correct: 1,
      explanation:
        'O arco parte da realidade: o grupo recebe uma situação-problema e identifica o que chama atenção nela. Ex.: “Três idosos sofreram queda neste mês”.',
      slide: 3,
    },
    {
      topic: 'Características',
      icon: 'brain',
      text: 'O estudante que questiona, compara evidências e justifica suas escolhas demonstra qual característica?',
      answers: ['Autonomia', 'Participação', 'Trabalho em equipe', 'Pensamento crítico'],
      correct: 3,
      explanation:
        'Pensamento crítico: questionar e justificar em vez de apenas memorizar. Pergunta-chave: “por que esta conduta?”.',
      slide: 4,
    },
    {
      topic: 'Enfermagem',
      icon: 'scale',
      text: 'Segundo as Diretrizes Curriculares Nacionais (CNE/CES nº 3/2001), a formação do enfermeiro deve ser:',
      answers: [
        'Generalista, humanista, crítica e reflexiva',
        'Tecnicista, especializada e normativa',
        'Hospitalocêntrica e centrada em procedimentos',
        'Teórica, expositiva e baseada em memorização',
      ],
      correct: 0,
      explanation:
        'As DCN definem o perfil do enfermeiro com formação generalista, humanista, crítica e reflexiva (Resolução CNE/CES nº 3/2001).',
      slide: 5,
    },
    {
      topic: 'Estratégias',
      icon: 'search',
      text: 'Na Aprendizagem Baseada em Problemas (PBL), quando os pequenos grupos recebem o problema?',
      answers: ['Depois da aula expositiva', 'Somente na avaliação final', 'Antes da teoria', 'Após o debriefing'],
      correct: 2,
      explanation:
        'No PBL o grupo recebe o problema antes da teoria, identifica o que não sabe, estuda e retorna para discutir com o tutor.',
      slide: 6,
    },
    {
      topic: 'Estratégias',
      icon: 'repeat',
      text: 'Como funciona a Sala de Aula Invertida?',
      answers: [
        'Teste individual e, depois, o mesmo teste em equipe',
        'Teoria estudada em casa; em sala, dúvidas, discussão e prática',
        'Briefing, cenário com manequim e debriefing',
        'O professor expõe todo o conteúdo e aplica uma prova',
      ],
      correct: 1,
      explanation:
        'A teoria é estudada em casa (vídeos, textos) e o tempo em sala vai para dúvidas, discussão e prática orientada. Ex.: videoaula sobre sondagem vesical.',
      slide: 6,
    },
    {
      topic: 'Caso clínico',
      icon: 'activity',
      text: 'No caso do Sr. Raimundo, qual dado sugere hipotensão ortostática?',
      answers: [
        'Temperatura de 37,7 °C',
        'Glicemia capilar de 66 mg/dL',
        'PA deitado 132/78 → sentado 104/62 mmHg',
        'SpO₂ de 91% em ar ambiente',
      ],
      correct: 2,
      explanation:
        'A queda da pressão ao sentar (132/78 → 104/62 mmHg), com tontura e “vista escurecendo”, indica hipotensão ortostática — e risco de queda.',
      slide: 7,
    },
    {
      topic: 'Caso clínico',
      icon: 'shield-alert',
      text: 'Quais fatores do ambiente aumentam o risco de queda do Sr. Raimundo?',
      answers: [
        'Grades abaixadas, campainha fora do alcance e piso úmido',
        'Quarto iluminado e acompanhante presente',
        'Chinelo antiderrapante e grades elevadas',
        'Campainha ao alcance e luz de vigília acesa',
      ],
      correct: 0,
      explanation:
        'Grades laterais abaixadas, campainha no armário, luz apagada, chinelo sem solado antiderrapante, piso úmido e a filha ausente desde as 22h.',
      slide: 7,
    },
  ],
};
