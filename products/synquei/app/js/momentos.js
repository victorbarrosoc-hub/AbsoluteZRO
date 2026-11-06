// Momentos: o Synquei entende o que foi gravado e separa cada clipe no lugar certo antes de mandar para o editor.
// Cada tipo de projeto (app/js/tipos.js) tem um modelo: casamento vira making, decoração, cerimônia, votos, festa…;
// clipe vira performance (encaixou na música) × b-roll e takes; EP vira uma parte por música; podcast, aula e conteúdo
// ficam por câmera, com blocos por sessão.
//
// De onde vem a decisão, da pista mais forte para a mais fraca (a origem fica gravada e aparece no relatório):
//  1. marcado: o momento que a pessoa marcou no cartão (SOBEDESCE) ou corrigiu aqui (p.momentosManual);
//  2. pasta: palavras nas pastas, no nome do arquivo e no nome do aparelho ("Making Noiva", "Cerimônia", "Drone"…);
//  3. horario: a ordem e o horário das sessões sincronizadas (no casamento, a sessão principal é a cerimônia, o que
//     vem antes é making e o que vem depois é festa). É sugestão: o relatório e a tela de Momentos mostram como tal;
//  4. padrao: o momento principal do modelo.
// B-roll: vídeo que não encaixou pelo som em nada (só pela data, ou sem sincronia), sem som, ou com pasta de apoio,
// drone, detalhe. No clipe, b-roll é tudo o que não encaixou na música.
//
// Nada aqui mexe em arquivo: só decide nome, pasta e tags. Puro, roda no Node (tests/momentos.test.mjs).

export const MOMENTOS_VERSAO = 1

const BROLL = /\bb[\s_-]?rolls?\b|\bapoio\b|cobertura|\binserts?\b|\bdetalhes?\b|cutaways?|\bstock\b|\bimagens?\b/
const DRONE = /\bdrone|\bdji\b|mavic|\bfpv\b|\baerea|\baereo|\bavata\b/

const m = (id, nome, pistas, extra = {}) => ({ id, nome, pistas, ...extra })

// Casamento: na ordem do dia (a ordem vira o número da pasta no editor).
const CASAMENTO = [
  m('making-noiva', 'Making da noiva', /\bmaking\b.*\bnoiva\b|\bnoiva\b.*\bmaking\b|\bnoiva\b|\bbride\b|\bmadrinhas?\b/),
  m('making-noivo', 'Making do noivo', /\bmaking\b.*\bnoivo\b|\bnoivo\b.*\bmaking\b|\bnoivo\b|\bgroom\b|\bpadrinhos?\b/),
  m('making', 'Making of', /\bmaking\b|getting ready|preparac/),
  m('decoracao', 'Decoração', /\bdecor|cenario|ambient|\bigreja vazia\b|\bsalao\b|\bdetalhes da festa\b/),
  m('cerimonia', 'Cerimônia', /\bcerimonia|\bceremony\b|\bigreja\b|\baltar\b|\bcelebrac|\bentrada da noiva\b|\bcasamento civil\b|\bjuiz\b/),
  m('votos', 'Votos', /\bvotos?\b|\bvows?\b|\blapela\b|\blav\b|\blavalier\b/),
  m('ensaio', 'Ensaio', /\bensaio\b|pre[\s-]?wedding|\bexterna\b|\bpos[\s-]?cerimonia\b|\bfotos? dos noivos\b/),
  m('festa', 'Festa', /\bfesta\b|\bparty\b|\brecepc|\bpista\b|\bdanc|\bvalsa\b|\bbalada\b/),
  m('buffet', 'Buffet', /\bbuffet\b|\bcomida\b|\bjantar\b|\bbolo\b|\bdoces?\b|\bcake\b|\bfood\b|\bdrinks?\b|\bbar\b/),
  m('banda', 'Banda', /\bbanda\b|\bband\b|\bdj\b|\bshow\b|musica ao vivo|\bcantor/),
  m('discursos', 'Discursos e brindes', /\bdiscurso|\bbrinde|\bhomenage|\bspeech/),
]

const PERFORMANCE = m('performance', 'Performance', /\bperformance\b|\bplayback\b|\bdublagem\b|\bclipe\b|\bbanda\b|\bcantor/)
const BROLL_M = m('broll', 'B-roll', BROLL, { broll: true })

/**
 * Modelo de cada tipo. eixo: o que vem primeiro na pasta do editor ('momento' | 'parte' | 'camera').
 * parte: como se chamam os pedaços da diária (takes do clipe, músicas do EP, blocos, palestras, aulas, episódios).
 * principal: o momento de quem encaixou pelo som e não tem outra pista. ordemDoDia: casamento usa a ordem das sessões.
 */
export const MODELOS = {
  // pistas: a ordem em que as palavras são procuradas ("entrada da noiva" é cerimônia, não making)
  casamento: { eixo: 'momento', momentos: CASAMENTO, principal: 'cerimonia', ordemDoDia: true, pistas: ['votos', 'cerimonia', 'discursos', 'decoracao', 'buffet', 'banda', 'festa', 'ensaio', 'making-noiva', 'making-noivo', 'making'] },
  videoclipe: { eixo: 'parte', parte: 'Take', takes: true, momentos: [PERFORMANCE, m('cenas', 'Cenas', /\bcena|\bficcao\b|\broteiro\b|\bnarrativa\b/, { broll: true }), BROLL_M], principal: 'performance', musical: true },
  show: {
    eixo: 'camera',
    parte: 'Bloco',
    momentos: [m('palco', 'Palco', /\bpalco\b|\bstage\b|\bpgm\b|\bprincipal\b/), m('plateia', 'Plateia', /\bplateia\b|\bpublico\b|\bcrowd\b|\bgrua\b/), m('bastidores', 'Bastidores', /\bbastidor|\bbackstage\b|\bcamarim\b|\bpasssagem de som\b|\bpassagem\b/, { broll: true }), BROLL_M],
    principal: 'palco',
  },
  dvd: {
    eixo: 'camera',
    parte: 'Bloco',
    momentos: [m('palco', 'Palco', /\bpalco\b|\bstage\b|\bpgm\b|\bprincipal\b/), m('plateia', 'Plateia', /\bplateia\b|\bpublico\b|\bcrowd\b|\bgrua\b/), m('bastidores', 'Bastidores', /\bbastidor|\bbackstage\b|\bcamarim\b|\bpassagem\b/, { broll: true }), BROLL_M],
    principal: 'palco',
  },
  sessao: { eixo: 'parte', parte: 'Música', momentos: [PERFORMANCE, m('bastidores', 'Bastidores', /\bbastidor|\bbackstage\b|\bmaking\b/, { broll: true }), BROLL_M], principal: 'performance', musical: true },
  podcast: { eixo: 'camera', parte: 'Episódio', momentos: [m('conversa', 'Conversa', /\bconversa\b|\bepisodio\b|\bpodcast\b|\bvideocast\b/), m('cortes', 'Cortes', /\bcortes?\b|\breels?\b|\bshorts?\b/), BROLL_M], principal: 'conversa' },
  entrevista: { eixo: 'camera', parte: 'Entrevista', momentos: [m('entrevista', 'Entrevista', /\bentrevista|\binterview\b|\bdepoimento/), BROLL_M], principal: 'entrevista' },
  documentario: {
    eixo: 'momento',
    momentos: [m('entrevistas', 'Entrevistas', /\bentrevista|\binterview\b|\bdepoimento|\bpersonagem/), m('observacional', 'Observacional', /\bobservac|\bcena|\bcotidiano\b|\bvivencia/), m('arquivo', 'Arquivo', /\barquivo\b|\bacervo\b|\barchive\b|\bfotos? antigas\b/), m('broll', 'B-roll', BROLL, { broll: true })],
    principal: 'entrevistas',
  },
  conteudo: { eixo: 'camera', parte: 'Bloco', momentos: [m('fala', 'Fala para a câmera', /\bfala\b|\bfalando\b|\btalking\b|\bprincipal\b|\bfrontal\b|\ba[\s-]?cam\b/), m('tela', 'Tela', /\btela\b|\bscreen\b|\bcaptura\b|\bgravacao de tela\b|\bobs\b/), m('detalhe', 'Detalhe', /\bdetalhe|\bmesa\b|\btop[\s-]?down\b|\bmaos\b/), BROLL_M], principal: 'fala' },
  aula: { eixo: 'camera', parte: 'Aula', momentos: [m('professor', 'Professor', /\bprofessor|\bprof\b|\bfrontal\b|\bprincipal\b/), m('tela', 'Tela', /\btela\b|\bscreen\b|\bcaptura\b|\bslides?\b|\bobs\b/), m('detalhe', 'Detalhe', /\bdetalhe|\bquadro\b|\blousa\b|\bmesa\b|\bmaos\b/), BROLL_M], principal: 'professor' },
  evento: {
    eixo: 'momento',
    parte: 'Palestra',
    momentos: [m('credenciamento', 'Credenciamento', /\bcredencia|\brecepc|\bchegada\b|\bcheck[\s-]?in\b/), m('palestras', 'Palestras e painéis', /\bpalestra|\bpainel|\bkeynote\b|\bpalco\b|\bpalestrante|\bauditorio\b/), m('plateia', 'Plateia', /\bplateia\b|\bpublico\b|\baudiencia\b/), m('networking', 'Networking', /\bnetworking\b|\bcoffee\b|\bcafe\b|\bintervalo\b|\bestande|\bstand\b|\bfeira\b/), m('entrevistas', 'Entrevistas', /\bentrevista|\bdepoimento|\btestemunho/), m('broll', 'B-roll', BROLL, { broll: true })],
    principal: 'palestras',
  },
  aftermovie: {
    eixo: 'momento',
    momentos: [m('chegada', 'Chegada e montagem', /\bmontagem\b|\bchegada\b|\bsetup\b|\bpreparac|\bcredencia/), m('publico', 'Público', /\bpublico\b|\bplateia\b|\bcrowd\b|\bpessoas\b/), m('palco', 'Palco e shows', /\bpalco\b|\bshow\b|\bbanda\b|\bdj\b|\bstage\b|\bapresentac/), m('ativacoes', 'Ativações e marcas', /\bativac|\bmarca\b|\bpatrocin|\bestande|\bstand\b|\bbrinde/), m('entrevistas', 'Entrevistas', /\bentrevista|\bdepoimento|\bvox ?pop/), m('broll', 'Imagens do evento', BROLL, { broll: true })],
    principal: 'publico',
    brollPrimeiro: true,
  },
  culto: { eixo: 'momento', parte: 'Bloco', momentos: [m('louvor', 'Louvor', /\blouvor|\bbanda\b|\bmusica|\bministerio de louvor/), m('palavra', 'Palavra', /\bpalavra\b|\bpregac|\bsermao|\bpastor|\bmensagem\b/), m('celebracao', 'Celebração', /\bceia\b|\bbatismo|\boracao|\bcelebrac/), BROLL_M], principal: 'palavra' },
  ficcao: { eixo: 'camera', parte: 'Cena', momentos: [m('cenas', 'Cenas', /\bcena|\bsc\d|\bplano\b/), m('making', 'Making of', /\bmaking\b|\bbastidor|\bbts\b/, { broll: true }), BROLL_M], principal: 'cenas' },
  publicidade: { eixo: 'camera', parte: 'Cena', momentos: [m('cenas', 'Cenas', /\bcena|\bsc\d|\bplano\b|\bfilme\b/), m('produto', 'Produto', /\bproduto|\bpackshot|\bstill\b|\bmesa\b/), m('making', 'Making of', /\bmaking\b|\bbastidor|\bbts\b/, { broll: true }), BROLL_M], principal: 'cenas' },
  espetaculo: { eixo: 'camera', parte: 'Ato', momentos: [m('palco', 'Palco', /\bpalco\b|\bstage\b|\bprincipal\b/), m('plateia', 'Plateia', /\bplateia\b|\bpublico\b/), m('bastidores', 'Bastidores', /\bbastidor|\bcoxia\b|\bcamarim\b/, { broll: true }), BROLL_M], principal: 'palco' },
  esporte: { eixo: 'camera', parte: 'Bloco', momentos: [m('acao', 'Ação', /\bjogo\b|\bpartida\b|\bprova\b|\bacao\b|\bcorrida\b|\bluta\b/), m('torcida', 'Torcida', /\btorcida\b|\bpublico\b|\barquibancada\b/), m('entrevistas', 'Entrevistas', /\bentrevista|\bdepoimento|\bcoletiva\b/), BROLL_M], principal: 'acao' },
  outro: { eixo: 'camera', momentos: [m('principal', 'Principal', /\bprincipal\b|\bmaster\b/), BROLL_M], principal: 'principal' },
}

export const modeloDe = (tipo) => MODELOS[tipo] || MODELOS.outro

/** Texto das pistas: pastas, nome, aparelho e a marcação do SOBEDESCE, sem acento e em minúsculas. */
export function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_.\-/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const textoDe = (c, dev) => normalizar([c.relPath, c.name, c.org && c.org.dono, c.org && c.org.cartaoNome, c.org && c.org.momento, dev && dev.label].filter(Boolean).join(' / '))
const ehAudio = (c) => c.kind === 'audio'
const pad = (n) => String(n).padStart(2, '0')

/** Câmera (o "dono" do SOBEDESCE, "Aladim - FX30", ou o aparelho que o Synquei reconheceu) e lente, se o arquivo disser. */
export function cameraDe(c, dev) {
  const camera = (c.org && c.org.dono) || (dev && dev.label) || 'Câmera'
  const lente = (c.device && c.device.lens) || ''
  return { camera, lente }
}

/** O momento que a pessoa marcou (id do modelo, nome do modelo ou um nome próprio). */
function momentoMarcado(modelo, marca) {
  const t = normalizar(marca)
  if (!t) return null
  // o nome que a pessoa deu fica como ela escreveu ("Primeira dança" vira a pasta dela, não some dentro de Festa)
  return modelo.momentos.find((x) => x.id === marca || normalizar(x.nome) === t) || { id: `marcado:${t}`, nome: String(marca).trim().slice(0, 60), pistas: /$^/ }
}

const mediana = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

/**
 * Casamento sem pista de pasta: a sessão sincronizada mais "cheia" (aparelhos × duração) é a cerimônia; o que vem
 * antes (pelo relógio das câmeras) é making e o que vem depois é festa. Devolve sessionId → momento.
 */
function ordemDoDia(p, porId) {
  const sessoes = (p.sessions || []).map((s) => {
    const clipes = s.clipIds.map((id) => porId.get(id)).filter(Boolean)
    const aparelhos = new Set(clipes.map((c) => c.deviceId)).size
    return { s, quando: mediana(clipes.map((c) => c.created)), peso: aparelhos * Math.max(1, s.end - s.start), aparelhos }
  })
  const fora = new Map()
  if (!sessoes.length) return fora
  const principal = sessoes.reduce((a, b) => (b.peso > a.peso ? b : a))
  for (const x of sessoes) {
    if (x === principal) fora.set(x.s.id, 'cerimonia')
    else if (x.quando != null && principal.quando != null) fora.set(x.s.id, x.quando < principal.quando ? 'making' : 'festa')
  }
  return fora
}

/**
 * Classifica os clipes prontos do projeto.
 * @returns {{ versao, tipo, eixo, parte, momentos: Array, clipes: Object<string, object>, partes: string[] }}
 */
export function classificar(p, { tipo = p.type, manual = p.momentosManual || {} } = {}) {
  const modelo = modeloDe(tipo)
  const devs = new Map((p.devices || []).map((d) => [d.id, d]))
  const porId = new Map((p.clips || []).map((c) => [c.id, c]))
  const prontos = (p.clips || []).filter((c) => c.status === 'ready')
  const sessaoDe = new Map()
  ;(p.sessions || []).forEach((s) => s.clipIds.forEach((id) => sessaoDe.set(id, s)))
  const doDia = modelo.ordemDoDia ? ordemDoDia(p, porId) : new Map()
  const porMomentoId = new Map(modelo.momentos.map((x) => [x.id, x]))
  const extras = new Map()
  const achar = (id) => porMomentoId.get(id) || extras.get(id)

  // janelas das sessões pelo relógio das câmeras: o b-roll sem sincronia entra no momento da sessão mais perto
  const janelas = (p.sessions || [])
    .map((s) => {
      const t = s.clipIds.map((id) => porId.get(id)).filter((c) => c && Number.isFinite(c.created))
      if (!t.length) return null
      return { s, ini: Math.min(...t.map((c) => c.created)), fim: Math.max(...t.map((c) => c.created + (c.duration || 0) * 1000)) }
    })
    .filter(Boolean)

  const clipes = {}
  const decidir = (c) => {
    const dev = devs.get(c.deviceId)
    const texto = textoDe(c, dev)
    const audio = ehAudio(c)
    const { camera, lente } = cameraDe(c, dev)
    let mom = null
    let origem = 'padrao'
    const marca = manual[c.id] || (c.org && c.org.momento)
    if (marca) {
      mom = momentoMarcado(modelo, marca)
      if (mom && !porMomentoId.has(mom.id)) extras.set(mom.id, mom)
      origem = 'marcado'
    }
    if (!mom) {
      const achou = (modelo.pistas ? modelo.pistas.map(achar) : modelo.momentos).find((x) => x.pistas.test(texto))
      if (achou) {
        mom = achou
        origem = 'pasta'
      }
    }
    const s = sessaoDe.get(c.id)
    if (!mom && s && doDia.has(s.id)) {
      mom = achar(doDia.get(s.id))
      origem = 'horario'
    }
    if (!mom && !c.sync && Number.isFinite(c.created) && janelas.length && modelo.ordemDoDia) {
      // sem sincronia: a sessão em que ele caiu pelo relógio (ou a mais perto)
      const dist = (j) => (c.created < j.ini ? j.ini - c.created : c.created > j.fim ? c.created - j.fim : 0)
      const j = janelas.reduce((a, b) => (dist(b) < dist(a) ? b : a))
      if (doDia.has(j.s.id)) {
        mom = achar(doDia.get(j.s.id))
        origem = 'horario'
      }
    }
    if (!mom) mom = achar(modelo.principal) || modelo.momentos[0]

    const porSom = c.sync && String(c.sync.method || '').startsWith('audio')
    const semSom = c.audioStatus === 'none' || !c.audio
    let broll = false
    if (!audio) {
      if (DRONE.test(texto) || BROLL.test(texto) || mom.broll) broll = true
      else if (modelo.musical) broll = !porSom && c.sync?.method !== 'linked' && c.sync?.method !== 'timecode'
      else broll = !c.sync || c.sync.method === 'date' || (semSom && !porSom && c.sync.method !== 'timecode' && c.sync.method !== 'linked')
    }
    clipes[c.id] = { momento: mom.id, momentoNome: mom.nome, broll, drone: !audio && DRONE.test(texto), audio, camera, lente, origem, parte: null, sessao: s ? s.id : null }
  }
  for (const c of prontos) decidir(c)

  // ordem dos momentos: a do modelo, e os marcados à mão no fim, na ordem em que apareceram
  const usados = [...new Set(Object.values(clipes).map((x) => x.momento))]
  const ordemIds = [...modelo.momentos.map((x) => x.id), ...extras.keys()]
  const momentos = ordemIds
    .filter((id) => usados.includes(id))
    .map((id, i) => {
      const x = achar(id)
      const ids = Object.keys(clipes).filter((k) => clipes[k].momento === id)
      const origens = new Set(ids.map((k) => clipes[k].origem))
      return {
        id,
        nome: x.nome,
        ordem: i + 1,
        pasta: `${pad(i + 1)} ${x.nome}`,
        clipes: ids.length,
        broll: ids.filter((k) => clipes[k].broll).length,
        audio: ids.filter((k) => clipes[k].audio).length,
        duracao: ids.reduce((t, k) => t + (porId.get(k).duration || 0), 0),
        cameras: [...new Set(ids.filter((k) => !clipes[k].audio).map((k) => clipes[k].camera))],
        sugestao: origens.size === 1 && (origens.has('horario') || origens.has('padrao')),
        origens: [...origens],
      }
    })
  const ordemDe = new Map(momentos.map((x) => [x.id, x]))
  for (const k of Object.keys(clipes)) {
    const mm = ordemDe.get(clipes[k].momento)
    clipes[k].ordem = mm.ordem
    clipes[k].momentoPasta = mm.pasta
  }

  const partes = numerarPartes(p, modelo, clipes, porId)
  return { versao: MOMENTOS_VERSAO, tipo: tipo || 'outro', eixo: modelo.eixo, parte: modelo.parte || null, momentos, clipes, partes }
}

/**
 * Partes da diária. Clipe: cada take é o grupo de câmeras que rodou junto em cima da música (pelo relógio, 45 s de
 * folga; sem relógio, a ordem dos clipes de cada câmera). EP, show, aulas, palestras: uma parte por sessão.
 */
function numerarPartes(p, modelo, clipes, porId) {
  if (!modelo.parte) return []
  const nomes = []
  if (modelo.takes) {
    const perf = Object.keys(clipes)
      .filter((k) => !clipes[k].audio && !clipes[k].broll)
      .map((k) => porId.get(k))
    const comRelogio = perf.filter((c) => Number.isFinite(c.created)).sort((a, b) => a.created - b.created)
    let n = 0
    let fim = -Infinity
    for (const c of comRelogio) {
      if (c.created > fim + 45000) n++
      fim = Math.max(fim, c.created + (c.duration || 0) * 1000)
      clipes[c.id].parte = `Take ${pad(n)}`
    }
    // sem relógio: o enésimo clipe de cada câmera é o take n
    const semRelogio = perf.filter((c) => !Number.isFinite(c.created))
    const porCamera = new Map()
    for (const c of semRelogio.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      const cam = clipes[c.id].camera
      porCamera.set(cam, (porCamera.get(cam) || 0) + 1)
      clipes[c.id].parte = `Take ${pad(n + porCamera.get(cam))}`
    }
  } else {
    const sessoes = (p.sessions || []).filter((s) => s.clipIds.some((id) => clipes[id]))
    if (sessoes.length > 1) {
      sessoes.forEach((s, i) => {
        const nome = `${modelo.parte} ${pad(i + 1)}`
        for (const id of s.clipIds) if (clipes[id] && !clipes[id].broll) clipes[id].parte = nome
      })
    }
  }
  for (const x of Object.values(clipes)) if (x.parte && !nomes.includes(x.parte)) nomes.push(x.parte)
  return nomes.sort()
}

const PLURAL = { Take: 'Takes', Música: 'Músicas', Bloco: 'Blocos', Palestra: 'Palestras', Aula: 'Aulas', Episódio: 'Episódios', Entrevista: 'Entrevistas', Cena: 'Cenas', Ato: 'Atos' }

/**
 * Pasta do clipe no editor (Media Pool do DaVinci, bins do Premiere, eventos do Final Cut).
 * eixo momento: Diária › 03 Cerimônia › Câmeras | B-roll | Áudio › câmera [› lente] [› cartão]
 * eixo parte:   Diária › Takes › Take 03 › câmera; B-roll e Áudio à parte
 * eixo câmera:  Diária › Câmeras › câmera [› lente] › cartão; B-roll e Áudio à parte
 * `lentes`: câmeras que usaram mais de uma lente (só nelas a lente vira subpasta).
 */
export function pastaDoClipe(info, { diaria, cartao, eixo, parte, lentes = new Set() }) {
  const cam = info.lente && lentes.has(info.camera) ? [info.camera, info.lente] : [info.camera]
  const tipo = info.audio ? 'Áudio' : info.broll ? (info.drone ? 'Drone' : 'B-roll') : 'Câmeras'
  if (eixo === 'momento') return [diaria, info.momentoPasta, tipo, ...cam, ...(tipo === 'Câmeras' && cartao ? [cartao] : [])]
  if (eixo === 'parte' && info.parte && tipo === 'Câmeras') return [diaria, PLURAL[parte] || parte, info.parte, ...cam]
  return [diaria, tipo, ...cam, ...(tipo !== 'Áudio' && cartao ? [cartao] : [])]
}

/** Câmeras que usaram mais de uma lente na diária. */
export function camerasComLentes(cls) {
  const por = new Map()
  for (const x of Object.values(cls.clipes)) if (x.lente) por.set(x.camera, new Set([...(por.get(x.camera) || []), x.lente]))
  return new Set([...por].filter(([, s]) => s.size > 1).map(([k]) => k))
}

/** Tags do clipe (Keywords no DaVinci, keywords no Final Cut). */
export function tagsDoClipe(info, { diaria, cartao, tipoLabel } = {}) {
  return [diaria, info.momentoNome, info.parte, info.camera, info.lente, cartao, info.audio ? 'Áudio' : info.broll ? 'B-roll' : 'Principal', info.drone ? 'Drone' : null, info.origem === 'horario' || info.origem === 'padrao' ? 'Momento sugerido' : null, tipoLabel].filter(Boolean)
}

/**
 * As "sessões" das linhas do tempo organizadas (o mesmo formato de p.sessions, para buildTimelines):
 * eixo momento: uma por momento (e por grupo de sincronia); eixo parte: uma por take/música, com o áudio que toca junto;
 * eixo câmera: as sessões da diária com o nome da parte (Bloco 01, Aula 02…).
 */
export function sessoesOrganizadas(p, cls) {
  const porId = new Map(p.clips.map((c) => [c.id, c]))
  const out = []
  const juntar = (nome, ids) => {
    const porGrupo = new Map()
    for (const id of ids) {
      const c = porId.get(id)
      if (!c || !c.sync) continue
      if (!porGrupo.has(c.sync.group)) porGrupo.set(c.sync.group, [])
      porGrupo.get(c.sync.group).push(c)
    }
    const grupos = [...porGrupo.entries()].sort((a, b) => a[0] - b[0])
    grupos.forEach(([g, cs], i) => {
      const ini = Math.min(...cs.map((c) => c.sync.pos))
      const fim = Math.max(...cs.map((c) => c.sync.pos + (c.duration || 0)))
      out.push({ id: `o${out.length + 1}`, group: g, start: ini, end: fim, clipIds: cs.map((c) => c.id), name: grupos.length > 1 ? `${nome} (${i + 1})` : nome })
    })
  }
  const ids = Object.keys(cls.clipes)
  if (cls.eixo === 'momento') {
    for (const mm of cls.momentos) juntar(mm.pasta, ids.filter((k) => cls.clipes[k].momento === mm.id && !cls.clipes[k].broll))
  } else if (cls.eixo === 'parte' && cls.partes.length) {
    for (const parte of cls.partes) {
      const vids = ids.filter((k) => cls.clipes[k].parte === parte)
      const cs = vids.map((k) => porId.get(k)).filter((c) => c.sync)
      if (!cs.length) continue
      const ini = Math.min(...cs.map((c) => c.sync.pos))
      const fim = Math.max(...cs.map((c) => c.sync.pos + (c.duration || 0)))
      // o áudio (música master, gravador) que toca durante o take entra junto
      const sons = ids.filter((k) => cls.clipes[k].audio).filter((k) => {
        const a = porId.get(k)
        return a.sync && a.sync.group === cs[0].sync.group && a.sync.pos < fim && a.sync.pos + (a.duration || 0) > ini
      })
      juntar(parte, [...vids, ...sons])
    }
  } else {
    const sessoes = p.sessions || []
    sessoes.forEach((s, i) => {
      const parte = cls.parte && sessoes.length > 1 ? `${cls.parte} ${pad(i + 1)}` : cls.parte ? `${cls.parte} 01` : s.name
      out.push({ ...s, name: parte })
    })
  }
  return out
}

/** Resumo curto para a janelinha do DaVinci, o recibo e o relatório. */
export function resumoMomentos(cls) {
  return {
    momentos: cls.momentos.map((x) => ({ nome: x.nome, pasta: x.pasta, clipes: x.clipes, broll: x.broll, audio: x.audio, sugestao: x.sugestao })),
    partes: cls.partes.length,
    parte: cls.parte,
    broll: Object.values(cls.clipes).filter((x) => x.broll).length,
    sugeridos: Object.values(cls.clipes).filter((x) => x.origem === 'horario' || x.origem === 'padrao').length,
  }
}
