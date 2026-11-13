// A biblioteca de predefinições: os estilos da casa e as funções puras que organizam a coleção da pessoa.
//
// ESTILOS DA CASA. Cada um usa só controles do motor (luz, curva, misturador, tonalização, cor, presença, efeitos,
// tela) — nada de exposição, branco, nitidez ou ruído, que são da foto e do arquivo (por-foto.js cuida deles antes de o
// estilo entrar). Os nomes são nossos, curtos, em português: nenhum nome de fabricante, de película ou de marca.
// Todos passam no controle de qualidade (qc.js); o teste trava isso.
//
// Critério de desenho, por família:
//   Natural            mexe pouco: é a foto mais limpa, mais viva ou mais suave
//   Retrato            protege a pele: laranja mais claro e menos saturado, textura para baixo, altas luzes seguras
//   Casamento          branco de vestido com detalhe (altas para baixo), verde de jardim domado, pele quente
//   Palco e show       luz de LED estoura um canal só e apaga o rosto: azul, roxo e magenta menos saturados e mais
//                      claros (o detalhe volta), altas luzes muito para baixo, preto fundo; pele sob luz colorida
//                      puxada de volta para o laranja
//   Esporte            ação legível: contraste local, cor firme, sombra aberta
//   Editorial          contraste de revista, cor contida
//   Filme              cor cruzada entre sombra e alta luz, preto levantado, grão
//   Preto e branco     a mistura por faixa faz o papel do filtro colorido na lente (azul para baixo = céu escuro)
//   Paisagem           céu e verde separados, neblina para fora
//   Noite              lâmpada de sódio domada, sombra aberta sem lavar o preto
//   Comida e produto   quente e apetitoso; branco limpo e textura para produto
//
// BIBLIOTECA DA PESSOA. O estado é JSON puro; a tela guarda (IndexedDB e conta):
//   { versao: 1, predefinicoes: [Predefinicao], favoritos: [id], recentes: [id], ordem: { [familia]: [id] } }
// As funções devolvem um estado novo e nunca alteram o que receberam. Os estilos da casa não moram no estado: entram
// na leitura (`todas`, `porFamilia`). Para mexer num estilo da casa, a pessoa duplica.

import { FAIXAS } from '../motor/ajustes.js'
import { ErroPredefinicao, criarPacote, criarPredefinicao, lerPacote, validar } from './predefinicao.js'

export const FAMILIAS = [
  'Natural',
  'Retrato',
  'Casamento',
  'Palco e show',
  'Esporte',
  'Editorial',
  'Filme',
  'Preto e branco',
  'Paisagem',
  'Noite',
  'Comida e produto',
]
export const FAMILIA_DA_PESSOA = 'Minhas'
export const FAMILIA_IMPORTADAS = 'Importadas'
export const MAX_RECENTES = 12
const VERSAO_DO_ESTADO = 1

// vetor de 8 faixas a partir de { laranja: 8, azul: -10 }
const f = (porFaixa = {}) => FAIXAS.map((nome) => porFaixa[nome] ?? 0)
const mis = (matiz, saturacao, luz) => ({ matiz: f(matiz), saturacao: f(saturacao), luz: f(luz) })
const zona = (matiz, saturacao, luz = 0) => ({ matiz, saturacao, luz })
// curva de pontos em código de tela 0..255, como se desenha
const curva = (...pares) => pares.map(([x, y]) => [x / 255, y / 255])

// [nome, descrição de uma linha, ajustes]
const CASA = {
  Natural: [
    ['Limpo', 'A foto como saiu, só um pouco mais viva.', { luz: { contraste: 6, altas: -10, sombras: 8 }, cor: { vibracao: 8 } }],
    [
      'Dia claro',
      'Céu firme e sombra aberta para luz de sol.',
      { luz: { contraste: 10, altas: -22, sombras: 16 }, cor: { vibracao: 14 }, misturador: mis({}, { azul: 8 }, { azul: -6 }) },
    ],
    ['Suave', 'Menos contraste e cor mais calma.', { luz: { contraste: -12, altas: -15, sombras: 18 }, cor: { saturacao: -6 }, presenca: { clareza: -6 } }],
  ],
  Retrato: [
    [
      'Pele',
      'Pele mais clara e lisa, sem perder o tom.',
      {
        luz: { contraste: 4, altas: -18, sombras: 10 },
        cor: { vibracao: 6 },
        presenca: { textura: -12, clareza: -4 },
        misturador: mis({}, { laranja: -6, vermelho: -4 }, { laranja: 8 }),
      },
    ],
    [
      'Estúdio',
      'Contraste limpo de fundo infinito.',
      { luz: { contraste: 14, brancos: 8, pretos: -8, altas: -8 }, cor: { vibracao: 4 }, presenca: { textura: -6 }, misturador: mis({}, {}, { laranja: 5 }) },
    ],
    [
      'Janela',
      'Luz lateral macia, com um calor leve nas altas.',
      {
        luz: { contraste: -6, altas: -25, sombras: 20 },
        cor: { vibracao: -4 },
        tonalizacao: { altas: zona(40, 8) },
        efeitos: { desbotar: 8 },
      },
    ],
    [
      'Dourado',
      'Calor de fim de tarde na pele.',
      {
        luz: { contraste: 6, altas: -16, sombras: 8 },
        cor: { vibracao: 10 },
        misturador: mis({ amarelo: -10 }, { laranja: 6 }, { laranja: 4 }),
        tonalizacao: { altas: zona(45, 14), sombras: zona(30, 6) },
      },
    ],
  ],
  Casamento: [
    [
      'Claro e leve',
      'Arejado, com sombra aberta e verde suave.',
      {
        luz: { contraste: -8, altas: -30, sombras: 30, pretos: 15 },
        cor: { vibracao: 6, saturacao: -8 },
        misturador: mis({}, { verde: -25, amarelo: -10 }, { verde: 10, laranja: 4 }),
        efeitos: { desbotar: 10 },
      },
    ],
    [
      'Terra',
      'Escuro e denso: verde fechado e pele quente.',
      {
        luz: { contraste: 12, altas: -35, sombras: -5, pretos: -12 },
        cor: { saturacao: -12 },
        misturador: mis({ verde: -20 }, { verde: -35, amarelo: -18, laranja: 4 }, { verde: -10 }),
        tonalizacao: { sombras: zona(30, 8) },
        efeitos: { vinheta: -12 },
      },
    ],
    [
      'Clássico',
      'Branco do vestido com detalhe e cor fiel.',
      { luz: { contraste: 8, altas: -22, brancos: 6, sombras: 6 }, cor: { vibracao: 8 }, misturador: mis({}, {}, { laranja: 5 }) },
    ],
    [
      'Fim de tarde',
      'Sol baixo: altas quentes e sombra aberta.',
      {
        luz: { contraste: 4, altas: -25, sombras: 15 },
        cor: { vibracao: 12 },
        misturador: mis({}, { verde: -10 }, {}),
        tonalizacao: { altas: zona(42, 16), sombras: zona(250, 5) },
      },
    ],
  ],
  'Palco e show': [
    [
      'Palco',
      'Base para show: segura o refletor e fecha o preto.',
      {
        luz: { contraste: 14, altas: -45, sombras: 10, pretos: -20 },
        cor: { vibracao: 8 },
        presenca: { clareza: 8 },
        misturador: mis({}, { azul: -15, roxo: -12, magenta: -10, vermelho: -8 }, { azul: 10, roxo: 6 }),
      },
    ],
    [
      'LED domado',
      'Azul, roxo e magenta de LED sem estourar o rosto.',
      {
        luz: { contraste: 6, altas: -55, brancos: -10, sombras: 8 },
        cor: { saturacao: -8 },
        misturador: mis({}, { azul: -30, roxo: -28, magenta: -22, vermelho: -18 }, { azul: 18, roxo: 14, magenta: 8 }),
      },
    ],
    [
      'Pele no palco',
      'Traz o rosto de volta sob luz colorida.',
      {
        luz: { contraste: 8, altas: -35, sombras: 14 },
        cor: { vibracao: -6 },
        misturador: mis({ vermelho: 12, magenta: 20 }, { vermelho: -14, magenta: -15, amarelo: -8, laranja: 6 }, { laranja: 12, vermelho: 6 }),
      },
    ],
    [
      'Noite de show',
      'Alto contraste, preto fundo e cor forte.',
      {
        luz: { contraste: 24, altas: -30, sombras: -6, brancos: 12, pretos: -30 },
        cor: { vibracao: 16 },
        presenca: { clareza: 14 },
        curva: { pontos: { luz: curva([0, 0], [64, 56], [128, 130], [192, 200], [255, 255]) } },
        misturador: mis({}, { azul: -10, roxo: -8 }, { azul: 6 }),
        efeitos: { vinheta: -14 },
      },
    ],
    [
      'Fumaça',
      'Contraluz e fumaça com recorte, sombra fria.',
      {
        luz: { contraste: 8, altas: -40, pretos: -14 },
        presenca: { neblina: 25, clareza: 10 },
        misturador: mis({}, { azul: -12, magenta: -8 }, { azul: 6 }),
        tonalizacao: { sombras: zona(225, 10) },
      },
    ],
  ],
  Esporte: [
    [
      'Ação',
      'Recorte e cor firme para movimento.',
      { luz: { contraste: 16, altas: -20, sombras: 12 }, cor: { vibracao: 14 }, presenca: { clareza: 16, textura: 10 } },
    ],
    [
      'Gramado',
      'Campo verde de verdade e uniforme vivo.',
      {
        luz: { contraste: 12, altas: -18, sombras: 10 },
        cor: { vibracao: 8 },
        presenca: { clareza: 10 },
        misturador: mis({ verde: 6, amarelo: 8 }, { verde: 10, azul: 8 }, { verde: -6 }),
      },
    ],
    [
      'Ginásio',
      'Quadra coberta: abre a sombra e doma o amarelo.',
      {
        luz: { contraste: 10, altas: -15, sombras: 22 },
        cor: { saturacao: -4 },
        presenca: { clareza: 12 },
        misturador: mis({}, { amarelo: -14, laranja: -6 }, { laranja: 4 }),
      },
    ],
  ],
  Editorial: [
    [
      'Revista',
      'Contraste de capa e cor contida.',
      { luz: { contraste: 18, brancos: 10, pretos: -10, altas: -12 }, cor: { saturacao: -10, vibracao: 6 }, presenca: { clareza: 6 }, tela: { contraste: 6 } },
    ],
    [
      'Frio',
      'Sombra azulada e pele sóbria.',
      {
        luz: { contraste: 12, altas: -14 },
        cor: { saturacao: -14 },
        misturador: mis({}, { laranja: -6 }, {}),
        tonalizacao: { sombras: zona(220, 12), altas: zona(200, 4) },
      },
    ],
    [
      'Fosco',
      'Preto levantado e cor apagada.',
      {
        luz: { contraste: 6, altas: -15 },
        cor: { saturacao: -12 },
        curva: { pontos: { luz: curva([0, 18], [48, 50], [128, 128], [208, 210], [255, 246]) } },
        efeitos: { desbotar: 16 },
      },
    ],
  ],
  Filme: [
    [
      'Negativo quente',
      'Altas quentes, sombra esverdeada e grão fino.',
      {
        luz: { contraste: 6, altas: -18 },
        misturador: mis({ verde: -14 }, { azul: -10, verde: -8 }, {}),
        tonalizacao: { altas: zona(48, 10), sombras: zona(190, 8) },
        efeitos: { desbotar: 12, grao: 22, graoTamanho: 30 },
      },
    ],
    [
      'Negativo frio',
      'Sombra ciano e cor mais seca.',
      {
        luz: { contraste: 4, altas: -15 },
        cor: { saturacao: -6 },
        misturador: mis({ azul: -10 }, { laranja: -4 }, {}),
        tonalizacao: { sombras: zona(170, 10), altas: zona(60, 5) },
        efeitos: { desbotar: 10, grao: 20, graoTamanho: 30 },
      },
    ],
    [
      'Positivo',
      'Cor cheia e contraste de cromo.',
      {
        luz: { contraste: 22, pretos: -14, altas: -10 },
        cor: { saturacao: 10, vibracao: 10 },
        misturador: mis({}, { azul: 12, vermelho: 6 }, { azul: -6 }),
        efeitos: { grao: 10 },
        tela: { contraste: 8 },
      },
    ],
    [
      'Vencido',
      'Filme passado: desbotado, magenta na sombra.',
      {
        luz: { contraste: -10, altas: -12 },
        cor: { saturacao: -14 },
        tonalizacao: { sombras: zona(320, 12), altas: zona(80, 10) },
        efeitos: { desbotar: 35, grao: 40, graoTamanho: 45, vinheta: -16 },
      },
    ],
  ],
  'Preto e branco': [
    [
      'Prata',
      'Preto e branco neutro, de contraste médio.',
      {
        luz: { contraste: 14, altas: -10 },
        pb: { ativo: true, mistura: f({ vermelho: 5, laranja: 10, amarelo: 5, ciano: -5, azul: -15, roxo: -5 }) },
        efeitos: { grao: 12 },
      },
    ],
    [
      'Carvão',
      'Dramático: céu escuro e preto denso.',
      {
        luz: { contraste: 34, brancos: 14, pretos: -28, altas: -20 },
        presenca: { clareza: 20 },
        pb: { ativo: true, mistura: f({ vermelho: 15, laranja: 15, azul: -40, ciano: -20 }) },
        efeitos: { grao: 25, vinheta: -14 },
      },
    ],
    [
      'Sépia',
      'Preto e branco com tom quente de cópia antiga.',
      {
        luz: { contraste: 6, altas: -10 },
        pb: { ativo: true, mistura: f({ laranja: 8 }) },
        tonalizacao: { sombras: zona(35, 22), altas: zona(45, 12) },
        efeitos: { desbotar: 10 },
      },
    ],
    [
      'Névoa',
      'Preto e branco macio, de pouco contraste.',
      { luz: { contraste: -14, sombras: 24, altas: -12 }, pb: { ativo: true, mistura: f({ laranja: 15 }) }, efeitos: { desbotar: 22, grao: 18 } },
    ],
  ],
  Paisagem: [
    [
      'Horizonte',
      'Céu com nuvem e chão com detalhe.',
      {
        luz: { altas: -40, sombras: 30, contraste: 6 },
        cor: { vibracao: 20 },
        presenca: { neblina: 14, clareza: 12 },
        misturador: mis({}, { azul: 10, verde: 6 }, { azul: -10 }),
      },
    ],
    [
      'Mata',
      'Verde fundo, sem amarelar.',
      {
        luz: { contraste: 10, sombras: 16, altas: -20 },
        presenca: { neblina: 8 },
        misturador: mis({ amarelo: 10, verde: 6 }, { verde: 12, amarelo: -8 }, { verde: -8 }),
      },
    ],
    [
      'Litoral',
      'Mar e céu limpos, areia quente.',
      {
        luz: { altas: -30, brancos: 8, contraste: 6 },
        cor: { vibracao: 14 },
        misturador: mis({ ciano: -8 }, { ciano: 14, azul: 10, laranja: 6 }, { azul: -8 }),
      },
    ],
  ],
  Noite: [
    [
      'Cidade',
      'Rua à noite: doma a lâmpada amarela e abre a sombra.',
      {
        luz: { altas: -45, sombras: 26, pretos: -10, contraste: 6 },
        presenca: { clareza: 8, neblina: 6 },
        misturador: mis({}, { laranja: -18, amarelo: -22, azul: 10 }, {}),
        tonalizacao: { sombras: zona(230, 10) },
      },
    ],
    [
      'Neon',
      'Letreiro e reflexo com cor acesa.',
      {
        luz: { contraste: 16, altas: -30, pretos: -22 },
        cor: { vibracao: 24 },
        misturador: mis({}, { magenta: 14, ciano: 14, azul: 8 }, {}),
        tonalizacao: { sombras: zona(265, 10) },
      },
    ],
    [
      'Luz de vela',
      'Pouca luz quente, sem virar laranja.',
      {
        luz: { contraste: -4, sombras: 18, altas: -20 },
        cor: { saturacao: -6 },
        misturador: mis({}, { laranja: -10, amarelo: -8 }, { laranja: 6 }),
        tonalizacao: { altas: zona(38, 12) },
        efeitos: { grao: 14 },
      },
    ],
  ],
  'Comida e produto': [
    [
      'Mesa',
      'Comida quente e apetitosa.',
      {
        luz: { contraste: 10, altas: -15, brancos: 10 },
        cor: { vibracao: 18 },
        presenca: { textura: 14 },
        misturador: mis({}, { laranja: 8, vermelho: 8, verde: 6 }, { amarelo: 6 }),
      },
    ],
    [
      'Vitrine',
      'Produto nítido, com branco limpo.',
      { luz: { contraste: 12, brancos: 16, pretos: -6, sombras: 10 }, cor: { saturacao: 2 }, presenca: { textura: 16, clareza: 8 } },
    ],
    [
      'Fundo branco',
      'Fundo claro de catálogo, sem lavar o produto.',
      { luz: { contraste: 4, brancos: 26, sombras: 25, pretos: 6 }, cor: { saturacao: -2 }, presenca: { textura: 10 } },
    ],
  ],
}

const CRIADA_EM = '2026-11-13T00:00:00.000Z'
const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const slug = (t) =>
  semAcento(t)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

let casa = null

/** Os estilos da casa, prontos (predefinições válidas, `origem.tipo = 'nossa'`, id estável `casa-<família>-<nome>`). */
export function estilosDaCasa() {
  if (!casa) {
    casa = []
    for (const familia of FAMILIAS) {
      for (const [nome, descricao, ajustes] of CASA[familia]) {
        casa.push(
          criarPredefinicao({ id: `casa-${slug(familia)}-${slug(nome)}`, nome, familia, descricao, ajustes, origem: { tipo: 'nossa' }, criadaEm: CRIADA_EM }),
        )
      }
    }
  }
  return casa.map((p) => structuredClone(p))
}

const eDaCasa = (id) => typeof id === 'string' && id.startsWith('casa-')

// ─────────── estado ───────────

/** Biblioteca vazia. */
export function criarBiblioteca() {
  return { versao: VERSAO_DO_ESTADO, predefinicoes: [], favoritos: [], recentes: [], ordem: {} }
}

/** Qualquer coisa vira um estado válido: predefinição estragada some, id que não existe sai das listas. */
export function normalizarBiblioteca(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  const estado = criarBiblioteca()
  const vistos = new Set()
  for (const item of Array.isArray(e.predefinicoes) ? e.predefinicoes : []) {
    try {
      const p = validar(item)
      if (eDaCasa(p.id) || vistos.has(p.id)) continue
      vistos.add(p.id)
      estado.predefinicoes.push(p)
    } catch {
      // predefinição estragada não entra
    }
  }
  const existe = new Set([...vistos, ...estilosDaCasa().map((p) => p.id)])
  const ids = (v) => [...new Set(Array.isArray(v) ? v.filter((id) => existe.has(id)) : [])]
  estado.favoritos = ids(e.favoritos)
  estado.recentes = ids(e.recentes).slice(0, MAX_RECENTES)
  if (e.ordem && typeof e.ordem === 'object') for (const [familia, lista] of Object.entries(e.ordem)) estado.ordem[familia] = ids(lista)
  return estado
}

const copia = (estado) => structuredClone(normalizarEntrada(estado))
const normalizarEntrada = (estado) =>
  estado && estado.versao === VERSAO_DO_ESTADO && Array.isArray(estado.predefinicoes) ? estado : normalizarBiblioteca(estado)

/** Todas as predefinições: as da casa primeiro, depois as da pessoa. */
export function todas(estado) {
  return [...estilosDaCasa(), ...normalizarEntrada(estado).predefinicoes.map((p) => structuredClone(p))]
}

/** Uma predefinição pelo id (da casa ou da pessoa), ou null. */
export function achar(estado, id) {
  return todas(estado).find((p) => p.id === id) ?? null
}

function exigir(estado, id) {
  const p = achar(estado, id)
  if (!p) throw new ErroPredefinicao('nao-achei', 'Esta predefinição não está na biblioteca.')
  return p
}

function exigirDaPessoa(estado, id) {
  if (eDaCasa(id)) throw new ErroPredefinicao('da-casa', 'Estilo da casa não muda. Duplique para fazer o seu.')
  const p = estado.predefinicoes.find((x) => x.id === id)
  if (!p) throw new ErroPredefinicao('nao-achei', 'Esta predefinição não está na biblioteca.')
  return p
}

// ─────────── ler ───────────

/** Busca sem acento e sem caixa em nome, família e descrição; todas as palavras têm de aparecer. */
export function buscar(estado, texto) {
  const palavras = semAcento(String(texto ?? ''))
    .split(/\s+/)
    .filter(Boolean)
  const lista = todas(estado)
  if (!palavras.length) return lista
  return lista.filter((p) => {
    const onde = semAcento(`${p.nome} ${p.familia} ${p.descricao}`)
    return palavras.every((w) => onde.includes(w))
  })
}

/**
 * Ordena uma lista de predefinições. `criterio`: 'nome' (alfabética, sem acento), 'criacao' (mais nova primeiro),
 * 'recentes' (as usadas por último primeiro; o resto na ordem em que estava), 'manual' (a ordem guardada da família;
 * o que não está nela vai para o fim, na ordem em que estava).
 */
export function ordenar(lista, criterio = 'manual', estado = null) {
  const com = lista.map((p, i) => ({ p, i }))
  const e = estado ? normalizarEntrada(estado) : criarBiblioteca()
  const posicao = (ids, id) => {
    const k = ids.indexOf(id)
    return k < 0 ? Infinity : k
  }
  const por = {
    nome: (a, b) => semAcento(a.p.nome).localeCompare(semAcento(b.p.nome), 'pt') || a.i - b.i,
    criacao: (a, b) => Date.parse(b.p.criadaEm) - Date.parse(a.p.criadaEm) || a.i - b.i,
    recentes: (a, b) => posicao(e.recentes, a.p.id) - posicao(e.recentes, b.p.id) || a.i - b.i,
    manual: (a, b) => posicao(e.ordem[a.p.familia] ?? [], a.p.id) - posicao(e.ordem[b.p.familia] ?? [], b.p.id) || a.i - b.i,
  }[criterio]
  if (!por) throw new Error(`ordenar: critério desconhecido: ${criterio}`)
  // Infinity − Infinity é NaN: empate vira a ordem de entrada
  return com.sort((a, b) => por(a, b) || a.i - b.i).map((x) => x.p)
}

/**
 * A biblioteca organizada por família: [{ familia, daCasa, predefinicoes }]. As famílias da casa vêm na ordem fixa;
 * as da pessoa, depois, em ordem alfabética. `opcoes`: busca (texto), soFavoritos, criterio (ver `ordenar`).
 * Família sem nenhuma predefinição (depois do filtro) não aparece.
 */
export function porFamilia(estado, { busca = '', soFavoritos = false, criterio = 'manual' } = {}) {
  const e = normalizarEntrada(estado)
  let lista = buscar(e, busca)
  if (soFavoritos) lista = lista.filter((p) => e.favoritos.includes(p.id))
  const grupos = new Map()
  for (const p of lista) {
    if (!grupos.has(p.familia)) grupos.set(p.familia, [])
    grupos.get(p.familia).push(p)
  }
  const nomes = [...grupos.keys()].sort((a, b) => {
    const ia = FAMILIAS.indexOf(a)
    const ib = FAMILIAS.indexOf(b)
    if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
    return semAcento(a).localeCompare(semAcento(b), 'pt')
  })
  return nomes.map((familia) => ({ familia, daCasa: FAMILIAS.includes(familia), predefinicoes: ordenar(grupos.get(familia), criterio, e) }))
}

/** As predefinições favoritas, na ordem em que foram marcadas. */
export function favoritas(estado) {
  const e = normalizarEntrada(estado)
  return e.favoritos.map((id) => achar(e, id)).filter(Boolean)
}

/** As usadas por último (até 12), a mais recente primeiro. */
export function recentes(estado) {
  const e = normalizarEntrada(estado)
  return e.recentes.map((id) => achar(e, id)).filter(Boolean)
}

export const eFavorita = (estado, id) => normalizarEntrada(estado).favoritos.includes(id)

// ─────────── mudar (devolvem estado novo) ───────────

/** Guarda uma predefinição da pessoa (criada, importada, extraída). Mesmo id troca a que estava. */
export function acrescentar(estado, predefinicao) {
  const e = copia(estado)
  const p = validar(predefinicao)
  if (eDaCasa(p.id)) throw new ErroPredefinicao('da-casa', 'Estilo da casa não muda. Duplique para fazer o seu.')
  const k = e.predefinicoes.findIndex((x) => x.id === p.id)
  if (k >= 0) e.predefinicoes[k] = p
  else e.predefinicoes.push(p)
  return e
}

/** Tira uma predefinição da pessoa da biblioteca (e dos favoritos, recentes e ordem). O arquivo exportado não muda. */
export function remover(estado, id) {
  const e = copia(estado)
  exigirDaPessoa(e, id)
  e.predefinicoes = e.predefinicoes.filter((p) => p.id !== id)
  e.favoritos = e.favoritos.filter((x) => x !== id)
  e.recentes = e.recentes.filter((x) => x !== id)
  for (const familia of Object.keys(e.ordem)) e.ordem[familia] = e.ordem[familia].filter((x) => x !== id)
  return e
}

/** Marca ou desmarca como favorita (sem `ligado`, alterna). Vale para a casa e para as da pessoa. */
export function favoritar(estado, id, ligado = undefined) {
  const e = copia(estado)
  exigir(e, id)
  const esta = e.favoritos.includes(id)
  const quer = ligado ?? !esta
  if (quer && !esta) e.favoritos.push(id)
  if (!quer && esta) e.favoritos = e.favoritos.filter((x) => x !== id)
  return e
}

/** Registra o uso: a predefinição vai para a frente das recentes. */
export function usar(estado, id) {
  const e = copia(estado)
  exigir(e, id)
  e.recentes = [id, ...e.recentes.filter((x) => x !== id)].slice(0, MAX_RECENTES)
  return e
}

function nomeLivre(estado, base) {
  const usados = new Set(todas(estado).map((p) => semAcento(p.nome)))
  if (!usados.has(semAcento(base))) return base
  for (let n = 2; n < 1000; n++) {
    const tentativa = `${base} ${n}`
    if (!usados.has(semAcento(tentativa))) return tentativa
  }
  return `${base} ${Date.now()}`
}

/**
 * Duplica uma predefinição (da casa ou da pessoa) para a pessoa editar. Devolve { estado, predefinicao }.
 * A cópia de um estilo da casa vai para a família da pessoa; o nome ganha "cópia" (ou o `nome` pedido).
 */
export function duplicar(estado, id, { nome = null, familia = null, agora = null } = {}) {
  const e = copia(estado)
  const origem = exigir(e, id)
  const novo = criarPredefinicao(
    {
      ...origem,
      id: undefined,
      nome: nomeLivre(e, nome ?? `${origem.nome} cópia`),
      familia: familia ?? (eDaCasa(id) ? FAMILIA_DA_PESSOA : origem.familia),
      origem: { tipo: 'manual' },
      criadaEm: agora ?? undefined,
    },
    { agora },
  )
  let unico = novo.id
  for (let n = 2; e.predefinicoes.some((p) => p.id === unico); n++) unico = `${novo.id}-${n}`
  novo.id = unico
  e.predefinicoes.push(novo)
  return { estado: e, predefinicao: structuredClone(novo) }
}

/** Troca o nome de uma predefinição da pessoa (o id não muda). */
export function renomear(estado, id, nome) {
  const e = copia(estado)
  const p = exigirDaPessoa(e, id)
  const k = e.predefinicoes.indexOf(p)
  e.predefinicoes[k] = validar({ ...p, nome })
  return e
}

/** Move uma predefinição da pessoa para outra família (uma das da casa ou uma nova). */
export function moverDeFamilia(estado, id, familia) {
  const e = copia(estado)
  const p = exigirDaPessoa(e, id)
  const k = e.predefinicoes.indexOf(p)
  const antiga = p.familia
  e.predefinicoes[k] = validar({ ...p, familia })
  if (e.ordem[antiga]) e.ordem[antiga] = e.ordem[antiga].filter((x) => x !== id)
  return e
}

/** Guarda a ordem manual de uma família (a lista de ids como a pessoa arrastou). */
export function reordenar(estado, familia, ids) {
  const e = copia(estado)
  const daFamilia = new Set(
    todas(e)
      .filter((p) => p.familia === familia)
      .map((p) => p.id),
  )
  e.ordem[familia] = [...new Set(ids)].filter((id) => daFamilia.has(id))
  return e
}

/** As famílias que existem (as da casa e as que a pessoa criou), na ordem de `porFamilia`. */
export function familias(estado) {
  const e = normalizarEntrada(estado)
  const extras = [...new Set(e.predefinicoes.map((p) => p.familia))].filter((n) => !FAMILIAS.includes(n))
  return [...FAMILIAS, ...extras.sort((a, b) => semAcento(a).localeCompare(semAcento(b), 'pt'))]
}

// ─────────── exportar e importar a biblioteca ───────────

/** O pacote `.zropack` com as predefinições da pessoa (todas, ou só as de `ids`; estilos da casa também podem ir). */
export function exportar(estado, { ids = null, nome = 'Minhas predefinições', agora = null } = {}) {
  const e = normalizarEntrada(estado)
  const lista = ids ? ids.map((id) => exigir(e, id)) : e.predefinicoes
  return criarPacote(lista, { nome, agora })
}

/**
 * Importa um pacote (texto, bytes ou objeto) para a biblioteca. Devolve { estado, entraram: [ids], repetidas: [ids],
 * erros }. Predefinição com o mesmo id de uma que já existe e conteúdo igual conta como repetida; estilo da casa que
 * veio no pacote entra como cópia da pessoa.
 */
export function importar(estado, pacote, opcoes = {}) {
  let e = copia(estado)
  const { predefinicoes, erros } = lerPacote(pacote, opcoes)
  const entraram = []
  const repetidas = []
  for (const p of predefinicoes) {
    const item = eDaCasa(p.id) ? criarPredefinicao({ ...p, id: undefined, origem: { tipo: 'manual' } }, opcoes) : p
    const atual = e.predefinicoes.find((x) => x.id === item.id)
    if (atual && JSON.stringify(atual.ajustes) === JSON.stringify(item.ajustes) && atual.nome === item.nome) {
      repetidas.push(item.id)
      continue
    }
    e = acrescentar(e, item)
    entraram.push(item.id)
  }
  return { estado: e, entraram, repetidas, erros }
}
