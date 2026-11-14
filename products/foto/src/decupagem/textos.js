// Magnitude · textos: tudo que a decupagem diz para a pessoa, num lugar só. Português, curto, sem jargão: quem lê é
// fotógrafo no meio de um ensaio de mil fotos, não engenheiro. Nenhum outro arquivo da decupagem escreve frase à mão.

/** Número com vírgula decimal, sem casas sobrando. */
export function numero(v, casas = 0) {
  return v.toFixed(casas).replace('.', ',')
}

/** Fração (0..1) como porcentagem curta: "12%", "3%", "0,7%". Abaixo de 0,05% vira "menos de 0,1%". */
export function porcento(fracao) {
  const v = fracao * 100
  if (v >= 0.95) return `${Math.round(v)}%`
  if (v >= 0.05) return `${numero(v, 1)}%`
  return 'menos de 0,1%'
}

export const CENAS = Object.freeze({
  retrato: 'Retrato',
  grupo: 'Grupo',
  pessoas: 'Pessoas',
  animal: 'Animal',
  natureza: 'Natureza',
  paisagem: 'Paisagem',
  comida: 'Comida',
  arquitetura: 'Arquitetura',
  produto: 'Produto',
  documento: 'Documento',
  noturna: 'Noturna',
  outra: 'Outra',
})

/** Os três baldes: o nome da pilha (plural) e o da foto (singular). */
export const BALDES = Object.freeze({ fica: 'Ficam', talvez: 'Talvez', fora: 'Fora' })
export const BALDE_DA_FOTO = Object.freeze({ fica: 'Fica', talvez: 'Talvez', fora: 'Fora' })

export const RIGORES = Object.freeze({
  relaxado: { nome: 'Relaxado', dica: 'Guarda mais: só sai o que não tem conserto' },
  equilibrado: { nome: 'Equilibrado', dica: 'O meio-termo de quem entrega ensaio' },
  estrito: { nome: 'Estrito', dica: 'Só fica o que está inteiro' },
})

export const ENSAIOS = Object.freeze({
  geral: { nome: 'Geral', dica: 'Olhos e expressão de quem importa; beijo e oração não reprovam' },
  'recem-nascido': { nome: 'Recém-nascido', dica: 'Olho fechado não reprova: o bebê dorme' },
  boudoir: { nome: 'Boudoir', dica: 'Olho fechado não reprova: faz parte da pose' },
  esporte: { nome: 'Esporte', dica: 'Olhos não contam (capacete, esforço): vale a nitidez' },
})

export const CONFIANCAS = Object.freeze({ alta: 'Certeza alta', media: 'Certeza média', baixa: 'Certeza baixa' })

export const GRUPOS = Object.freeze({ repetidas: 'Repetidas', sequencia: 'Sequência' })

export const COMPONENTES = Object.freeze({ foco: 'Foco', pessoas: 'Pessoas', exposicao: 'Exposição', ruido: 'Ruído' })

/** Como cada componente e cada parte do rosto aparecem no meio de uma frase. */
export const NO_MEIO = Object.freeze({
  foco: 'nitidez',
  pessoas: 'pessoas',
  exposicao: 'exposição',
  ruido: 'imagem limpa',
  olhos: 'olhos abertos',
  nitidez: 'nitidez do rosto',
  expressao: 'expressão',
})

const px = (v) => `${Math.round(v)} px`

/** Os motivos da nota. Frases de uma linha, a mais grave primeiro (quem ordena é a nota). */
export const MOTIVOS = Object.freeze({
  // foco
  tremida: (comprimento) => `Tremida, cerca de ${px(comprimento)}`,
  tremidaLeve: (comprimento) => `Leve tremido, cerca de ${px(comprimento)}`,
  foraDeFoco: () => 'Fora de foco',
  rostoForaDeFoco: () => 'Rosto fora de foco',
  focoNoFundo: () => 'O foco caiu no fundo',
  focoSuave: () => 'Foco suave',
  nitida: () => 'Nítida',
  rostoNitido: () => 'Rosto nítido',
  olhosNitidos: () => 'Olhos nítidos',
  maisNitida: (total) => `A mais nítida de ${total}`,
  // pessoas
  olhosFechados: (quantos, de) => (de > 1 ? `Olhos fechados (${quantos} de ${de})` : 'Olhos fechados'),
  piscando: (quantos, de) => (de > 1 ? `Piscando (${quantos} de ${de})` : 'Piscando'),
  olhosAbertos: (de) => (de > 1 ? `Olhos abertos (${de} de ${de})` : 'Olhos abertos'),
  sorrindo: (de) => (de > 1 ? 'Sorrisos' : 'Sorrindo'),
  olhosFechadosDoMomento: () => 'Olhos fechados em toda a sequência: é do momento',
  olhosNaoContam: () => 'Olhos fechados não contam neste ensaio',
  // exposição
  altasPerdidas: (fracao) => `Altas luzes perdidas em ${porcento(fracao)}`,
  altasEstouradas: (fracao) => `Altas luzes estouradas em ${porcento(fracao)}`,
  altasRecuperaveis: (fracao) => `Altas luzes estouradas em ${porcento(fracao)}, recuperáveis no RAW`,
  altasNaPrevia: (fracao) => `Altas luzes estouradas na prévia em ${porcento(fracao)}`,
  sombrasFechadas: (fracao) => `Sombras fechadas em ${porcento(fracao)}`,
  escura: () => 'Escura',
  escuraRecuperavel: () => 'Escura, mas o RAW aguenta clarear',
  lavada: () => 'Lavada, sem preto',
  // ruído
  ruidosa: () => 'Muito ruído',
  // cobertura
  unica: () => 'Única foto deste momento',
  unicaDoGrupo: () => 'A melhor que há deste momento',
  unicaDaPessoa: () => 'A melhor foto que há desta pessoa',
})

/** Dicas: aparecem ao lado da nota e não mexem nela. */
export const DICAS = Object.freeze({
  horizonte: (graus) => `Horizonte torto, cerca de ${numero(Math.abs(graus), Math.abs(graus) < 2 ? 1 : 0)}°`,
  rostoCortado: () => 'Rosto cortado na borda',
})

/** Por que a certeza não é alta. */
export const INCERTEZAS = Object.freeze({
  semRostos: () => 'Sem leitura de rostos',
  olhosNaoLidos: () => 'Rosto pequeno demais para ler os olhos',
  focoPeloQuadro: () => 'Foco medido no quadro inteiro, não no rosto',
  semNitidez: () => 'Prévia pequena demais para medir nitidez',
  semTremido: () => 'Prévia pequena demais para medir tremido',
  rawNaoLido: () => 'Exposição vista só na prévia: o RAW ainda não foi lido',
  noLimite: () => 'Nota no limite entre dois baldes',
})

/** Empate dentro da margem de erro: a tela diz que são equivalentes e como desempatou. */
export const EMPATE = Object.freeze({
  equivalentes: (total) => `${total} equivalentes`,
  olhos: () => 'Desempate pelos olhos',
  expressao: () => 'Desempate pela expressão',
  nitidez: () => 'Desempate pela nitidez',
  ordem: () => 'Desempate pela ordem de captura',
})

const ANIMAIS = {
  bird: 'pássaro',
  cat: 'gato',
  dog: 'cachorro',
  horse: 'cavalo',
  sheep: 'ovelha',
  cow: 'vaca',
  elephant: 'elefante',
  bear: 'urso',
  zebra: 'zebra',
  giraffe: 'girafa',
}

/** O porquê da cena, em uma linha. */
export const PORQUE_DA_CENA = Object.freeze({
  retrato: (fracao) => `Um rosto, com ${porcento(fracao)} da largura`,
  grupo: (rostos) => `${rostos} rostos`,
  pessoasRostos: (rostos) => (rostos === 1 ? 'Um rosto pequeno no quadro' : `${rostos} rostos`),
  pessoasCorpo: () => 'Pessoa no quadro, sem rosto à vista',
  animal: (classe) => `Tem ${ANIMAIS[classe] ?? 'animal'} no quadro`,
  animalRotulo: () => 'Parece um animal',
  rotulos: (cena) => `Parece ${CENAS[cena].toLowerCase()}`,
  objetos: (cena) => `Objetos de ${CENAS[cena].toLowerCase()} no quadro`,
  noturna: () => 'Cena escura com pontos de luz',
  outra: () => 'Sem pista suficiente',
  semVisao: () => 'Sem leitura de visão: só o que foi medido',
})

/** O aprendizado, em palavras. */
export const APRENDIZADO = Object.freeze({
  prioriza: (mais, menos) => `Você tem dado mais valor a ${NO_MEIO[mais]} do que a ${NO_MEIO[menos]}.`,
  soMais: (mais) => `Você tem dado mais valor a ${NO_MEIO[mais]}.`,
  semMudanca: () => 'Suas trocas ainda não apontam uma preferência.',
  zerar: () => 'Zerar o aprendizado volta aos pesos de fábrica.',
})

/** O estado dos olhos de um rosto, como a lupa escreve ao lado da caixa. */
export const OLHOS = Object.freeze({
  abertos: 'Olhos abertos',
  sorrindo: 'Sorrindo',
  parcial: 'Piscando',
  fechados: 'Olhos fechados',
  semLeitura: 'Olhos sem leitura',
  duvidoso: 'Talvez não seja rosto',
})

/** As camadas de visão e o estado de cada uma (a tela nunca finge uma camada que não carregou). */
export const CAMADAS = Object.freeze({ rostos: 'Rostos e olhos', objetos: 'Objetos e animais', rotulos: 'Cena' })
export const ESTADO_DA_CAMADA = Object.freeze({ pronta: 'Ligada', carregando: 'Carregando', indisponivel: 'Indisponível', desligada: 'Desligada' })

/** A foto dentro do grupo do momento. */
export const NO_GRUPO = Object.freeze({
  escolhida: (total) => `A escolhida de ${total}`,
  equivalente: (total) => `Equivale à escolhida (${total} no grupo)`,
  reserva: (total) => `Reserva (${total} no grupo)`,
})

/** A análise, foto a foto. */
export const ANALISE = Object.freeze({
  naFila: () => 'Na fila da análise',
  semPrevia: () => 'Sem prévia para analisar',
  rawLido: () => 'Exposição conferida no RAW',
  rawNaoAbriu: () => 'O RAW não abriu: exposição vista só na prévia',
  tremido: (comprimento) => `Tremido de cerca de ${Math.round(comprimento)} px`,
})

/** A fila de dúvidas: por que cada foto está ali, numa linha, e a sugestão. */
export const DUVIDAS = Object.freeze({
  pessoaSozinha: () => 'A única foto boa de uma pessoa',
  chaveFora: () => 'Pessoa em destaque, mas a nota manda para Fora',
  unicaTalvez: () => 'Única foto do momento, em Talvez',
  empate: (total) => `Empate entre ${total} da mesma cena`,
  limite: () => 'Nota no limite entre dois baldes',
  certeza: () => 'A análise não teve certeza',
  sugestao: { fica: 'Sugestão: Fica', fora: 'Sugestão: Fora' },
  faltam: (n) => (n === 1 ? 'Falta 1' : `Faltam ${n}`),
  vazia: () => 'Nenhuma dúvida.',
  resto: () => 'O resto segue a sugestão.',
})

/**
 * Agrupar por pessoa (regra 5 de docs/ARQUITETURA.md). O aviso tem versão: muda o texto, muda a versão, e o
 * consentimento guardado vale só para a versão que a pessoa leu.
 */
export const PESSOAS = Object.freeze({
  versao: 1,
  titulo: ['Agrupar', 'por pessoa.'],
  aviso:
    'Agrupar por pessoa cria uma assinatura do rosto de cada um, guardada só neste aparelho e apagada com o trabalho. ' +
    'Ela nunca sai daqui: não vai para a conta, para a galeria, para a exportação nem para o XMP.',
  pontos: ['Só neste aparelho', 'Some com o trabalho ou em "Esquecer rostos"', 'Nada vai para a galeria nem para o Lightroom'],
  consentimento: 'Tenho o consentimento das pessoas fotografadas para isso.',
  ligar: 'Agrupar',
  esquecer: 'Esquecer rostos',
  esquecidos: 'Rostos esquecidos neste aparelho.',
  nome: (n) => `Pessoa ${n}`,
  cobertura: (fotos, boas, protegida) =>
    fotos === 1
      ? 'Uma foto só. Não vai para Fora sozinha.'
      : protegida
        ? `${fotos} fotos, nenhuma boa. A melhor fica em Talvez.`
        : `${fotos} fotos, ${boas} ${boas === 1 ? 'boa' : 'boas'}`,
  andamento: (feitas, total) => `Rostos ${feitas} de ${total}`,
  nenhuma: 'Nenhum rosto grande o bastante ainda.',
  indisponivel: 'O leitor de rostos não abriu neste aparelho.',
  semRostos: 'Ligue "Rostos e olhos" para agrupar por pessoa.',
})

/** A calibração: as perguntas, as respostas e o que mudou, em palavras. */
export const CALIBRACAO = Object.freeze({
  titulo: ['Calibrar', 'em 30 segundos.'],
  serve: 'Esta serve?',
  qual: 'Qual das duas?',
  sim: 'Serve',
  nao: 'Não serve',
  dimensoes: { nitidez: 'Foco', olhos: 'Olhos', exposicao: 'Luz' },
  poucas: 'Poucas fotos perto do limite neste ensaio. Volte quando a análise tiver andado mais.',
  pronto: 'Pronto.',
  aplicar: 'Usar',
  padrao: 'Voltar ao padrão',
  mudancas: {
    nitidez: (d) => (d < 0 ? 'Você aceita foco um pouco mais suave.' : 'Você pede foco mais firme.'),
    olhos: (d) => (d < 0 ? 'Olho semicerrado passa com você.' : 'Você é mais exigente com olho semicerrado.'),
    exposicao: (k) => (k > 1 ? 'Você tolera mais luz estourada e sombra fechada.' : 'Você quer a luz mais contida.'),
  },
  contraditorio: (dimensao) => `${{ nitidez: 'Foco', olhos: 'Olhos', exposicao: 'Luz' }[dimensao]}: respostas diferentes para fotos parecidas, ficou como estava.`,
  igual: 'Suas respostas batem com o padrão.',
  limite: 'Chegou ao limite do ajuste.',
})
