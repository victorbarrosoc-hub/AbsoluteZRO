// A esteira da decupagem: mede, olha, classifica e dá a nota de cada foto do trabalho aberto, por trás, sem travar a
// tela. Tudo roda neste aparelho; nada sai dele.
//
//   const analise = criarAnalise({ loja })
//   analise.iniciar({ ids?, camadas: ['rostos', 'objetos', 'rotulos'], rigor, ensaio, pesos?, limiares?, raw? })
//   analise.pausar() · retomar() · cancelar()
//   analise.estado()      → { situacao, feitas, total, novas, puladas, porSegundo, restante?, camadas, motivos, raw, tempos, erro? }
//   analise.assinar(f)    f(estado) a cada mudança (no máximo umas 4 vezes por segundo); devolve quem cancela
//   analise.mostrar(ids)  o que está na tela passa na frente (a grade já avisa as miniaturas; a análise escuta o mesmo)
//   analise.refazerNota({ rigor, ensaio, pesos, limiares })   na hora: a nota e os baldes de novo, sem reanalisar pixel nenhum
//   analise.definirPessoas(lista | null)  as pessoas-chave ([{ id, fotos, chave }], de app/decupagem/pessoas.js): a
//                                         única foto de cada uma não vai para Fora sozinha (protegerPessoas). Só ids.
//   analise.meta(n)       "quero cerca de n": { ficam, saem, ordem, corte } (src/decupagem/nota.js)
//   analise.revisarPeloRaw(ids?)  a segunda passada: lê o RAW das fotos com estouro em dúvida e reavalia
//
// Por foto: a prévia (1024 px, a mesma da lupa) → medir() num pool de workers (app/decupagem/medir-worker.js) →
// visão num worker só (app/decupagem/visao-worker.js: rostos, olhos, objetos, rótulos) → cena → catálogo. A cada
// `lote` fotos e no fim: avaliarEnsaio (calibra a nitidez no ensaio, agrupa, avalia, escolhe em cada grupo e protege
// a cobertura) → a Magnitude e o grupo de cada foto, e as pilhas do catálogo.
//
// O que cada foto do catálogo ganha (o resto do contrato está em docs/ARQUITETURA.md):
//   medidas    as de medir(), enxutas (app/decupagem/compacto.js)
//   rostos     os de analisarRostos(), enxutos; undefined quando a camada de rostos não rodou (nunca se inventa rosto)
//   cena       classificarCena(...).cena
//   magnitude  a nota: { total, estrelas, balde, motivos, componentes, confianca, incertezas, dicas, detalhe }
//   grupo      o id do grupo (repetidas ou sequência), pelo catálogo (definirGrupos)
//   latitude?  a Latitude do RAW, enxuta, quando a segunda passada leu o arquivo
//   analise    { versao, camadas: [as que rodaram nesta foto], objetos, rotulos, cena: { confianca, porque, noite },
//                giro, raw?: 'lido' | { erro } }
//   escolha    a foto no grupo: { tipo, tamanho, escolhida, equivalente, equivalentes, desempate } ou null
//
// Recarregar a página não refaz nada: o catálogo guarda o que foi medido, e só vai para a fila o que falta (foto sem
// medidas, ou camada pedida e disponível que ainda não rodou nela).

import { criarPool, tamanhoPadrao } from '../trabalho/pool.js'
import { classificarCena } from '../../src/decupagem/cena.js'
import { avaliarEnsaio, meta as metaDoEnsaio, PARAMETROS } from '../../src/decupagem/nota.js'
import { protegerPessoas } from '../../src/decupagem/pessoas.js'

export const VERSAO = 1
export const CAMADAS = Object.freeze(['rostos', 'objetos', 'rotulos'])

/** Os números da esteira, num lugar só. */
export const AJUSTES_DA_ESTEIRA = Object.freeze({
  lote: 40, // a nota do ensaio é refeita a cada tantas fotos novas (e no fim)
  despejo: 250, // ms: o que foi medido entra no catálogo em lotes (mil fotos não viram mil avisos)
  aviso: 250, // ms: de quanto em quanto quem assina fica sabendo do progresso
  janela: 15000, // ms: a velocidade é a das fotos terminadas nesta janela
  naTela: 100, // prioridade do que está na tela
  objetos: 8, // quantos objetos e rótulos ficam guardados por foto
  rotulos: 5,
})

const agora = () => performance.now()
const casas = (v, n = 3) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** n) / 10 ** n : null)
const mensagem = (e) => String(e?.message ?? e).slice(0, 200)
const cancelado = (e) => e?.name === 'AbortError'

// A grade avisa as miniaturas do que está na tela (loja.miniaturas.mostrar). A análise escuta o mesmo aviso, sem que
// a grade precise saber que ela existe: um ouvinte por loja, ligado uma vez.
const escutasDaTela = new WeakMap()
function escutarTela(loja, f) {
  const m = loja?.miniaturas
  if (!m || typeof m.mostrar !== 'function') return () => {}
  let escutas = escutasDaTela.get(m)
  if (!escutas) {
    escutas = new Set()
    escutasDaTela.set(m, escutas)
    const original = m.mostrar
    m.mostrar = (ids) => {
      original.call(m, ids)
      for (const g of escutas) g(ids)
    }
  }
  escutas.add(f)
  return () => escutas.delete(f)
}

/** Os workers de verdade. `visao` e `medidor` podem ser trocados (os testes passam detecções fabricadas). */
function workersPadrao() {
  const aqui = (arquivo) => new URL(arquivo, import.meta.url)
  // um núcleo fica para o worker de visão; o resto mede
  return {
    medidor: criarPool(aqui('./medir-worker.js'), { tamanho: Math.max(1, tamanhoPadrao() - 1), nome: 'medir' }),
    visao: criarPool(aqui('./visao-worker.js'), { tamanho: 1, nome: 'visao' }),
    leitorDeRaw: criarPool(aqui('./raw-worker.js'), { tamanho: 1, nome: 'raw' }),
  }
}

/** O que fica no catálogo dos objetos e rótulos: nome e confiança, poucos. */
const enxutos = (lista, n, campos) =>
  Array.isArray(lista)
    ? lista
        .slice()
        .sort((a, b) => (b.confianca ?? 0) - (a.confianca ?? 0))
        .slice(0, n)
        .map((x) => Object.fromEntries(campos.map((k) => [k, k === 'confianca' ? casas(x[k]) : x[k]])))
    : undefined

/** A foto como avaliarEnsaio a lê. */
const sinaisDe = (f) => ({ id: f.id, medidas: f.medidas, rostos: f.rostos, cena: f.cena, exif: f.exif, latitude: f.latitude ?? undefined, tipo: f.tipo })

/** Duas magnitudes iguais no que a tela mostra? (evita reescrever três mil fotos a cada lote) */
const mesmaNota = (a, b) =>
  !!a &&
  !!b &&
  a.total === b.total &&
  a.balde === b.balde &&
  a.confianca === b.confianca &&
  a.estrelas === b.estrelas &&
  JSON.stringify(a.motivos) === JSON.stringify(b.motivos) &&
  JSON.stringify(a.incertezas) === JSON.stringify(b.incertezas) &&
  JSON.stringify(a.componentes) === JSON.stringify(b.componentes) &&
  JSON.stringify(a.dicas) === JSON.stringify(b.dicas)
const mesmaEscolha = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * A segunda passada vale para esta foto? RAW ao alcance, ainda não lido, e a prévia embutida mostrou estouro além da
 * tolerância da nota (um canal ou três): só o sensor diz se o dado está perdido.
 */
export function precisaDoRaw(foto, temOriginal = true) {
  if (!foto || foto.tipo !== 'raw' || !temOriginal || foto.latitude || foto.analise?.raw) return false
  const e = foto.medidas?.exposicao
  if (!e) return false
  const P = PARAMETROS
  return e.altas * 100 > P.altas.tolerancia || e.altas3 * 100 > P.perdidas.tolerancia
}

/**
 * `loja`: a do app (app/estado.js). `workers`: { medidor, visao, leitorDeRaw } (pools; o padrão cria os de verdade).
 * `ajustes`: troca algum número de AJUSTES_DA_ESTEIRA.
 */
export function criarAnalise({ loja, workers = null, ajustes = {} } = {}) {
  if (!loja?.catalogo) throw new Error('criarAnalise: falta a loja')
  const A = { ...AJUSTES_DA_ESTEIRA, ...ajustes }
  const catalogo = loja.catalogo
  let pools = workers
  const usar = () => (pools ??= workersPadrao())

  let opcoes = { camadas: [...CAMADAS], rigor: 'equilibrado', ensaio: 'geral', pesos: undefined, limiares: undefined, raw: false }
  let pessoas = null
  let situacao = 'parada'
  let erro = null
  let camadas = Object.fromEntries(CAMADAS.map((c) => [c, 'desligada']))
  let motivos = {}
  let total = 0
  let feitas = 0
  let novas = 0
  let puladas = 0
  let raw = { feitas: 0, total: 0, lidas: 0, falhas: 0 }
  let fila = []
  let ponteiro = 0
  const pendentes = new Set()
  const emVoo = new Map()
  let naTela = []
  let desdeANota = 0
  let grupos = []
  let assinaturaDosGrupos = ''
  let jaAgrupou = false
  let geracao = 0
  let terminou = null
  const terminadas = []
  // a corrida inteira: do começo da fila até a última foto medida (é a velocidade que fica depois que acaba)
  let corrida = { inicio: null, fim: null }
  const tempos = {}
  const ouvintes = new Set()
  let despejo = []
  let relogioDoDespejo = null
  let relogioDoAviso = null
  let notaMarcada = null

  const desligar = escutarTela(loja, (ids) => analise.mostrar(ids))

  // ───────── estado e avisos ─────────

  function porSegundo() {
    const t = agora()
    while (terminadas.length && t - terminadas[0] > A.janela) terminadas.shift()
    if (terminadas.length < 2) return null
    const dt = (terminadas[terminadas.length - 1] - terminadas[0]) / 1000
    return dt > 0 ? (terminadas.length - 1) / dt : null
  }

  function estado() {
    const media = corrida.inicio != null && corrida.fim > corrida.inicio && novas > 0 ? (novas * 1000) / (corrida.fim - corrida.inicio) : null
    const v = situacao === 'rodando' ? (porSegundo() ?? media) : media
    const medias = Object.fromEntries(Object.entries(tempos).map(([k, { soma, n }]) => [k, Math.round((soma / n) * 10) / 10]))
    return {
      situacao,
      feitas,
      total,
      novas,
      puladas,
      porSegundo: v == null ? null : Math.round(v * 10) / 10,
      restante: v && situacao === 'rodando' ? Math.round((total - feitas) / v) : null,
      camadas: { ...camadas },
      motivos: { ...motivos },
      raw: { ...raw },
      tempos: medias,
      erro,
      opcoes: { camadas: [...opcoes.camadas], rigor: opcoes.rigor, ensaio: opcoes.ensaio, raw: opcoes.raw },
    }
  }

  function avisar(agoraMesmo = false) {
    if (agoraMesmo) {
      clearTimeout(relogioDoAviso)
      relogioDoAviso = null
      const e = estado()
      for (const f of ouvintes) f(e)
      return
    }
    relogioDoAviso ??= setTimeout(() => avisar(true), A.aviso)
  }

  function contarTempo(nome, ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return
    const t = (tempos[nome] ??= { soma: 0, n: 0 })
    t.soma += ms
    t.n++
  }

  // ───────── o que falta em cada foto ─────────

  /** As camadas pedidas que estão prontas no worker. */
  const camadasAtivas = () => opcoes.camadas.filter((c) => camadas[c] === 'pronta')

  function faltaEm(foto) {
    const feitasNela = new Set(foto?.analise?.camadas ?? [])
    return { medir: !foto?.medidas, camadas: camadasAtivas().filter((c) => !feitasNela.has(c)) }
  }
  const precisa = (foto) => {
    const f = faltaEm(foto)
    return f.medir || f.camadas.length > 0
  }

  // ───────── despejo no catálogo ─────────

  function despejar() {
    clearTimeout(relogioDoDespejo)
    relogioDoDespejo = null
    if (!despejo.length) return
    const lote = despejo
    despejo = []
    catalogo.atualizarVarias(lote)
  }
  function guardar(alteracao) {
    despejo.push(alteracao)
    relogioDoDespejo ??= setTimeout(despejar, A.despejo)
  }

  // ───────── a nota do ensaio ─────────

  /** A nota de todas as fotos medidas, os grupos e as pilhas. Síncrono: dezenas de ms para milhares de fotos. */
  function notar({ reagrupar = true } = {}) {
    despejar()
    const t = agora()
    const fotos = catalogo.fotos().filter((f) => f.medidas)
    if (!fotos.length) return 0
    const r = avaliarEnsaio(fotos.map(sinaisDe), {
      rigor: opcoes.rigor,
      ensaio: opcoes.ensaio,
      pesos: opcoes.pesos,
      limiares: opcoes.limiares,
      grupos: reagrupar || !jaAgrupou ? undefined : grupos.filter((g) => g.fotos.every((id) => catalogo.foto(id)?.medidas)),
    })
    if (pessoas?.length) r.magnitudes = protegerPessoas(r.magnitudes, pessoas)
    grupos = r.grupos
    jaAgrupou = true
    const escolhas = new Map()
    for (const g of grupos) {
      for (const id of g.fotos) {
        escolhas.set(id, {
          tipo: g.tipo,
          tamanho: g.fotos.length,
          escolhida: g.escolhida === id,
          equivalente: g.equivalentes?.includes(id) ?? false,
          equivalentes: g.equivalentes?.length ?? 0,
          desempate: g.escolhida === id ? (g.desempate ?? null) : null,
        })
      }
    }
    const mudancas = []
    for (const f of fotos) {
      const m = r.magnitudes.get(f.id)
      const e = escolhas.get(f.id) ?? null
      const alteracao = { id: f.id }
      if (m && !mesmaNota(f.magnitude, m)) alteracao.magnitude = m
      if (!mesmaEscolha(f.escolha, e)) alteracao.escolha = e
      if (Object.keys(alteracao).length > 1) mudancas.push(alteracao)
    }
    if (mudancas.length) catalogo.atualizarVarias(mudancas)
    const assinatura = grupos.map((g) => `${g.id}:${g.tipo}:${g.fotos.join(',')}`).join('|')
    if (assinatura !== assinaturaDosGrupos) {
      assinaturaDosGrupos = assinatura
      catalogo.definirGrupos(grupos.map((g) => ({ id: g.id, fotos: g.fotos, tipo: g.tipo })))
    }
    const ms = agora() - t
    contarTempo('nota', ms)
    desdeANota = 0
    return ms
  }

  function marcarNota() {
    if (notaMarcada) return
    const fazer = () => {
      notaMarcada = null
      notar()
      avisar()
    }
    notaMarcada = typeof requestIdleCallback === 'function' ? { idle: requestIdleCallback(fazer, { timeout: 1500 }) } : { t: setTimeout(fazer, 50) }
  }
  function desmarcarNota() {
    if (!notaMarcada) return
    if (notaMarcada.idle != null) cancelIdleCallback(notaMarcada.idle)
    else clearTimeout(notaMarcada.t)
    notaMarcada = null
  }

  // ───────── uma foto ─────────

  async function processar(id, minha) {
    const foto = catalogo.foto(id)
    if (!foto) return 'fora'
    const falta = faltaEm(foto)
    if (!falta.medir && !falta.camadas.length) return 'ja'
    const prioridade = naTela.includes(id) ? A.naTela : 0
    const { medidor, visao } = usar()

    let t = agora()
    const blob = await loja.miniaturas.blob(id, 'previa')
    contarTempo('previa', agora() - t)
    if (minha !== geracao) return 'fora'
    if (!blob) return 'sem-previa'

    let medidas = foto.medidas
    let pixels = null
    if (falta.medir) {
      const r = await medidor.pedir('medir', { blob, devolver: falta.camadas.length > 0 }, { prioridade, chave: `medir:${id}` })
      if (!r) return 'fora'
      medidas = r.medidas
      pixels = r.pixels ?? null
      contarTempo('abrir', r.tempos?.abrir)
      contarTempo('medir', r.tempos?.medir)
    }
    if (minha !== geracao) return 'fora'

    const alteracao = { id, medidas }
    const antes = foto.analise ?? {}
    const analise = { versao: VERSAO, ...antes, camadas: [...(antes.camadas ?? [])] }
    let rostos = foto.rostos
    if (falta.camadas.length) {
      const original = loja.arquivo?.(id) ?? null
      const v = await visao.pedir(
        'analisar',
        {
          previa: pixels ?? blob,
          original: original ? { arquivo: original.arquivo, par: original.par, tipo: original.tipo } : null,
          camadas: falta.camadas,
          medidas,
        },
        { prioridade, chave: `visao:${id}`, transferir: pixels ? [pixels.rgba.buffer] : [] },
      )
      if (!v) return 'fora'
      for (const [k, ms] of Object.entries(v.tempos ?? {})) contarTempo(`visao.${k}`, ms)
      if (v.estado) for (const c of CAMADAS) if (camadas[c] !== 'desligada' && v.estado[c] === 'indisponivel') camadas[c] = 'indisponivel'
      for (const c of v.camadas ?? []) if (!analise.camadas.includes(c)) analise.camadas.push(c)
      if (v.camadas?.includes('rostos')) {
        rostos = v.rostos ?? []
        alteracao.rostos = rostos
        analise.giro = v.giro ?? 0
      }
      if (v.camadas?.includes('objetos')) analise.objetos = enxutos(v.objetos, A.objetos, ['classe', 'confianca'])
      if (v.camadas?.includes('rotulos')) analise.rotulos = enxutos(v.rotulos, A.rotulos, ['nome', 'confianca', 'indice'])
      if (v.falhas) analise.falhas = v.falhas
      else delete analise.falhas
    }
    t = agora()
    const c = classificarCena({ rostos, objetos: analise.objetos, rotulos: analise.rotulos, medidas })
    analise.cena = { confianca: c.confianca, porque: c.porque, noite: c.noite }
    alteracao.cena = c.cena
    alteracao.analise = analise
    contarTempo('cena', agora() - t)
    if (minha !== geracao) return 'fora'
    guardar(alteracao)
    return 'feita'
  }

  // ───────── a fila ─────────

  function proxima() {
    for (const id of naTela) if (pendentes.has(id)) return id
    while (ponteiro < fila.length && !pendentes.has(fila[ponteiro])) ponteiro++
    return ponteiro < fila.length ? fila[ponteiro] : null
  }

  function emVooMaximo() {
    const { medidor } = usar()
    return Math.max(2, (medidor.tamanho ?? 2) + 2)
  }

  function bombear() {
    if (situacao !== 'rodando') return
    const minha = geracao
    while (emVoo.size < emVooMaximo()) {
      const id = proxima()
      if (id == null) break
      pendentes.delete(id)
      const chave = `${minha}:${id}`
      const p = processar(id, minha)
        .then((r) => {
          if (minha !== geracao) return
          if (r === 'feita') {
            novas++
            desdeANota++
            corrida.fim = agora()
            terminadas.push(corrida.fim)
          } else if (r === 'sem-previa') puladas++
          if (r !== 'fora') feitas++
          if (desdeANota >= A.lote) marcarNota()
        })
        .catch((e) => {
          if (minha !== geracao || cancelado(e)) return
          puladas++
          feitas++
          erro = mensagem(e)
        })
        .finally(() => {
          emVoo.delete(chave)
          avisar()
          if (minha !== geracao) return
          if (situacao === 'rodando') bombear()
          if (!emVoo.size && proxima() == null && situacao === 'rodando') void fechar(minha)
        })
      emVoo.set(chave, p)
    }
  }

  async function fechar(minha) {
    situacao = 'fechando'
    desmarcarNota()
    notar()
    if (opcoes.raw) await revisarPeloRaw(null, minha)
    if (minha !== geracao) return
    situacao = 'pronta'
    await loja.salvarAgora?.()
    avisar(true)
    terminou?.resolver(estado())
  }

  async function prepararCamadas(pedidas) {
    camadas = Object.fromEntries(CAMADAS.map((c) => [c, pedidas.includes(c) ? 'carregando' : 'desligada']))
    motivos = {}
    if (!pedidas.length) return
    avisar(true)
    try {
      const r = await usar().visao.pedir('preparar', { camadas: pedidas }, { prioridade: 1000 })
      for (const c of pedidas) camadas[c] = r?.camadas?.[c] === 'pronta' ? 'pronta' : 'indisponivel'
      motivos = { ...(r?.motivos ?? {}) }
      for (const [c, ms] of Object.entries(r?.tempos ?? {})) contarTempo(`carga.${c}`, ms)
    } catch (e) {
      for (const c of pedidas) {
        camadas[c] = 'indisponivel'
        motivos[c] = `O leitor de visão não abriu (${mensagem(e)})`
      }
    }
  }

  // ───────── a segunda passada ─────────

  async function revisarPeloRaw(ids = null, minha = geracao) {
    despejar()
    const alvo = (ids ?? catalogo.ids()).map((id) => catalogo.foto(id)).filter((f) => precisaDoRaw(f, !!loja.arquivo?.(f?.id)))
    raw = { feitas: 0, total: alvo.length, lidas: 0, falhas: 0 }
    avisar()
    if (!alvo.length) return raw
    const { leitorDeRaw } = usar()
    for (const f of alvo) {
      if (minha !== geracao) return raw
      const original = loja.arquivo(f.id)
      try {
        const r = await leitorDeRaw.pedir('latitude', { arquivo: original.arquivo, nome: f.nome }, { chave: `raw:${f.id}` })
        if (!r) continue
        contarTempo('raw.ler', r.tempos?.ler)
        contarTempo('raw.medir', r.tempos?.medir)
        catalogo.atualizar(f.id, { latitude: r.latitude, analise: { ...(catalogo.foto(f.id)?.analise ?? {}), raw: 'lido' } })
        raw.lidas++
      } catch (e) {
        if (cancelado(e)) return raw
        const codigo = /^([a-z-]+):/.exec(mensagem(e))?.[1] ?? 'corrompido'
        catalogo.atualizar(f.id, { analise: { ...(catalogo.foto(f.id)?.analise ?? {}), raw: { erro: codigo } } })
        raw.falhas++
      }
      raw.feitas++
      avisar()
    }
    if (minha === geracao) notar({ reagrupar: false })
    return raw
  }

  // ───────── a API ─────────

  const analise = {
    /**
     * Começa (ou recomeça com outras opções). `ids`: só estas fotos (padrão: todas do trabalho, na ordem do
     * catálogo). `camadas`: as de visão que ligam ([] = só as medidas clássicas). Devolve uma Promise que resolve
     * com o estado quando a fila acaba (ou com o estado do momento, se for cancelada).
     */
    async iniciar({
      ids,
      camadas: pedidas = opcoes.camadas,
      rigor = opcoes.rigor,
      ensaio = opcoes.ensaio,
      pesos = opcoes.pesos,
      limiares = opcoes.limiares,
      raw: comRaw = opcoes.raw,
    } = {}) {
      const minha = ++geracao
      terminou?.resolver(estado())
      let resolver
      const promessa = new Promise((r) => (resolver = r))
      terminou = { resolver }
      opcoes = { camadas: CAMADAS.filter((c) => pedidas.includes(c)), rigor, ensaio, pesos, limiares, raw: !!comRaw }
      erro = null
      situacao = 'preparando'
      novas = 0
      puladas = 0
      terminadas.length = 0
      corrida = { inicio: null, fim: null }
      await prepararCamadas(opcoes.camadas)
      if (minha !== geracao) return promessa
      despejar()
      fila = (ids ?? catalogo.ids()).filter((id) => catalogo.tem?.(id) ?? !!catalogo.foto(id))
      ponteiro = 0
      pendentes.clear()
      for (const id of fila) if (precisa(catalogo.foto(id))) pendentes.add(id)
      total = fila.length
      feitas = total - pendentes.size
      desdeANota = 0
      situacao = 'rodando'
      corrida.inicio = agora()
      avisar(true)
      if (!pendentes.size) {
        void fechar(minha)
        return promessa
      }
      // o que já foi medido antes (recarregar, outro trabalho reaberto) já entra com nota
      if (feitas > 0) marcarNota()
      bombear()
      return promessa
    },
    /** Para de pedir fotos novas (as que estão no meio terminam). */
    pausar() {
      if (situacao !== 'rodando') return
      situacao = 'pausada'
      avisar(true)
    },
    retomar() {
      if (situacao !== 'pausada') return
      situacao = 'rodando'
      avisar(true)
      bombear()
      if (!emVoo.size && proxima() == null) void fechar(geracao)
    },
    /** Para tudo. O que já foi medido fica (e já entra na nota). */
    cancelar() {
      if (situacao === 'parada' || situacao === 'cancelada') return
      geracao++
      for (const chave of emVoo.keys()) {
        const id = chave.slice(chave.indexOf(':') + 1)
        pools?.medidor?.cancelar?.(`medir:${id}`)
        pools?.visao?.cancelar?.(`visao:${id}`)
      }
      pools?.leitorDeRaw?.cancelarTudo?.()
      emVoo.clear()
      pendentes.clear()
      desmarcarNota()
      notar()
      situacao = 'cancelada'
      avisar(true)
      terminou?.resolver(estado())
      terminou = null
    },
    estado,
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    /** As fotos que estão na tela agora, na ordem em que aparecem: passam na frente. */
    mostrar(ids) {
      naTela = Array.isArray(ids) ? ids.slice(0, 400) : []
      if (!pools) return
      for (const id of naTela) {
        pools.medidor?.priorizar?.(`medir:${id}`, A.naTela)
        pools.visao?.priorizar?.(`visao:${id}`, A.naTela)
      }
    },
    /** A nota de novo com outro rigor, ensaio, pesos ou limiares. Não relê pixel nenhum; devolve quanto levou (ms). */
    refazerNota({ rigor = opcoes.rigor, ensaio = opcoes.ensaio, pesos = opcoes.pesos, limiares = opcoes.limiares } = {}) {
      opcoes = { ...opcoes, rigor, ensaio, pesos, limiares }
      const ms = notar({ reagrupar: false })
      avisar(true)
      return ms
    },
    /** As pessoas-chave para a cobertura (null = sem agrupar por pessoa). Refaz a nota se mudou. */
    definirPessoas(lista) {
      const nova = Array.isArray(lista) && lista.length ? lista.map((p) => ({ id: p.id, fotos: [...p.fotos], chave: !!p.chave })) : null
      if (JSON.stringify(nova) === JSON.stringify(pessoas)) return 0
      pessoas = nova
      if (!catalogo.fotos().some((f) => f.medidas)) return 0
      const ms = notar({ reagrupar: false })
      avisar(true)
      return ms
    },
    /** "Quero cerca de n" sobre a nota que cada foto já tem. */
    meta(n) {
      const fotos = catalogo.fotos().filter((f) => f.magnitude)
      return metaDoEnsaio(
        fotos.map((f) => ({ id: f.id, magnitude: f.magnitude })),
        n,
        { grupos, pessoas: pessoas ? pessoas.filter((p) => p.chave) : null },
      )
    },
    revisarPeloRaw: (ids) => revisarPeloRaw(ids),
    /** Os grupos da última nota (com escolhida, equivalentes e desempate). */
    grupos: () => grupos,
    /** Solta os workers e para de escutar a tela. */
    encerrar() {
      analise.cancelar()
      desligar()
      ouvintes.clear()
      if (!workers && pools) for (const p of Object.values(pools)) p.encerrar?.()
      pools = null
    },
  }
  return analise
}
