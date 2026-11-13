// O lote da tela Entregar: exportar muitas fotos e preparar as prévias da galeria, sem travar a tela.
//
// ESCOLHA: um pool de "faixas" sobre o próprio worker do motor (app/motor/motor-worker.js), e não várias sessões.
// Cada faixa é um criarPool(motor-worker.js, { tamanho: 1 }) de app/trabalho/pool.js: o protocolo do worker do motor é
// o mesmo do pool (ida { id, tipo, dados } e { cancelar }, volta { id, ok, resultado } e { id, progresso }), então o
// motor roda sem uma linha copiada. Uma faixa por vez faz abrir → exportar → fechar da MESMA foto (o worker guarda a
// foto aberta; o pool comum mandaria cada pedido a um worker qualquer). A sessão (app/motor/sessao.js) não serve para o
// lote: exige um canvas, sonda a placa, mantém a prévia da tela e guarda a última foto aberta — é a peça da tela
// Revelar. O arquivo final (redimensionar, nitidez, marca-d'água, JPEG/TIFF/PNG, ICC, EXIF, sha256) sai de um segundo
// pool, o da saída (saida-worker.js), enquanto a faixa já revela a próxima foto.
//
// O resto é src/exportar/fila.js (pausar, cancelar, repetir só o que falhou, estimativa honesta, chave de
// idempotência) e src/estilo/por-foto.js (corrigir luz e branco foto a foto e só então o estilo).

import { criarPool, tamanhoPadrao } from '../../trabalho/pool.js'
import { chaveDeSaida, criarFila, extensaoDaReceita, normalizarReceita } from '../../../src/exportar/fila.js'
import { normalizar, neutro } from '../../../src/motor/ajustes.js'
import { tratarEmLote } from '../../../src/estilo/por-foto.js'
import { descompactar } from '../../../src/estilo/look.js'

const URL_MOTOR = new URL('../../motor/motor-worker.js', import.meta.url)
const URL_SAIDA = new URL('./saida-worker.js', import.meta.url)
const LADO_MEDIDA = 160

// a mesma semente da sessão (app/motor/sessao.js): o grão da exportação é o mesmo da prévia
function sementeDe(texto) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  return (h >>> 0) % 1000003
}

// média de blocos em luz linear: a medida do automático lê no máximo 60 mil pontos, 160 px bastam
function encolher(base, lado) {
  const { largura, altura, dados } = base.imagem
  const k = Math.max(1, Math.ceil(Math.max(largura, altura) / lado))
  if (k === 1) return base
  const l = Math.floor(largura / k)
  const a = Math.floor(altura / k)
  const saida = new Float32Array(l * a * 3)
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < k; j++) {
        for (let q = 0, i = ((y * k + j) * largura + x * k) * 3; q < k; q++, i += 3) {
          r += dados[i]
          g += dados[i + 1]
          b += dados[i + 2]
        }
      }
      const o = (y * l + x) * 3
      const inv = 1 / (k * k)
      saida[o] = r * inv
      saida[o + 1] = g * inv
      saida[o + 2] = b * inv
    }
  }
  return { ...base, imagem: { largura: l, altura: a, dados: saida }, reduzir: (base.reduzir ?? 1) * k }
}

const abortado = () => new DOMException('Cancelado.', 'AbortError')

// ─────────── o motor do lote (um por página, nasce no primeiro uso) ───────────

let motorUnico = null

export function motorDoLote() {
  if (motorUnico) return motorUnico
  const nucleos = globalThis.navigator?.hardwareConcurrency || 4
  const faixas = Array.from({ length: Math.max(1, Math.min(3, tamanhoPadrao(nucleos) - 1)) }, () => criarPool(URL_MOTOR, { tamanho: 1, nome: 'lote-motor' }))
  const saida = criarPool(URL_SAIDA, { tamanho: Math.max(1, Math.min(2, nucleos - 2)), nome: 'lote-saida' })
  const livres = [...faixas]
  const espera = []

  function pegar(sinal) {
    if (sinal?.aborted) return Promise.reject(abortado())
    const livre = livres.pop()
    if (livre) return Promise.resolve(livre)
    return new Promise((ok, falhou) => {
      const vez = { ok, falhou }
      espera.push(vez)
      sinal?.addEventListener(
        'abort',
        () => {
          const i = espera.indexOf(vez)
          if (i >= 0) espera.splice(i, 1)
          falhou(abortado())
        },
        { once: true },
      )
    })
  }
  function soltar(faixa) {
    const proximo = espera.shift()
    if (proximo) proximo.ok(faixa)
    else livres.push(faixa)
  }

  /** Abre a foto na faixa, roda `trabalho(faixa, aberta)` e fecha (a base cheia de 24 MP não fica na memória). */
  async function comFoto({ id, arquivo, nome, sinal }, trabalho) {
    const faixa = await pegar(sinal)
    try {
      const aberta = await faixa.pedir('abrir', { id, arquivo, nome, visor: 240 }, { sinal })
      return await trabalho(faixa, aberta)
    } finally {
      faixa.pedir('fechar', { id }).catch(() => {})
      soltar(faixa)
    }
  }

  return {
    faixas: faixas.length,
    saidas: saida.tamanho,
    /** A base reduzida (até 160 px) e o exif: o que a correção por foto precisa. */
    medir: ({ id, arquivo, nome, sinal }) =>
      comFoto({ id, arquivo, nome, sinal }, (_, aberta) => ({ base: encolher(aberta.base, LADO_MEDIDA), exif: aberta.exif, camera: aberta.camera })),
    /** Revela no espaço `tela`, em 16 bits, já no `lado` pedido (ou cheia): { pixels, exif, camera }. */
    revelar: ({ id, arquivo, nome, tamanho, ajustes, tela, lado, look, sinal, aoProgredir }) =>
      comFoto({ id, arquivo, nome, sinal }, async (faixa, aberta) => {
        const pixels = await faixa.pedir(
          'exportar',
          { id, ajustes, tela, bits: 16, lado, semente: sementeDe(`${nome}|${tamanho}`), look },
          { sinal, aoProgredir },
        )
        if (!pixels) throw abortado()
        return { pixels, exif: aberta.exif, camera: aberta.camera }
      }),
    gerar: (dados, { sinal } = {}) => saida.pedir('gerar', dados, { sinal, transferir: [dados.dados.buffer] }),
    galeria: (dados, { sinal } = {}) => saida.pedir('galeria', dados, { sinal, transferir: [dados.dados.buffer] }),
  }
}

// ─────────── o que já saiu (idempotência entre lotes) ───────────

const CHAVE_FEITAS = (trabalho) => `foto_exportadas:${trabalho}`
const MAX_FEITAS = 6000

export function lerFeitas(trabalho) {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_FEITAS(trabalho)) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function gravarFeitas(trabalho, chaves) {
  try {
    localStorage.setItem(CHAVE_FEITAS(trabalho), JSON.stringify(chaves.slice(-MAX_FEITAS)))
  } catch {
    // sem armazenamento: o lote seguinte refaz
  }
}

/** O lado maior que o motor já pode entregar (o resto do tamanho fica com gerarSaida). */
function ladoDaReceita(r) {
  if (r.tamanho.tipo === 'lado' && !r.tamanho.ampliar) return r.tamanho.px
  if (r.tamanho.tipo === 'caixa' && !r.tamanho.ampliar) return Math.max(r.tamanho.largura, r.tamanho.altura)
  return null
}

/** O que entra na chave: a mesma foto, o mesmo tratamento, a mesma receita e o mesmo destino = já feita. */
export function chaveDoItem({ foto, tratamento, receita, destino, marca }) {
  return chaveDeSaida({ foto: foto.id, ajustes: { tratamento, destino, marca: marca || null }, receita })
}

/** O tratamento de uma foto, como entra na chave (antes de medir): o estilo e a base dela. */
export function tratamentoDe(foto, tratar) {
  const base = normalizar(foto.ajustes ?? neutro())
  if (!tratar?.predefinicao) return { base }
  return { base, estilo: tratar.predefinicao.id, versao: tratar.predefinicao.criadaEm ?? null, intensidade: tratar.intensidade, modo: tratar.modo }
}

/**
 * Um lote de exportação.
 *   itens       [{ foto (Foto do catálogo), arquivo: File }] na ordem da lista
 *   receita     a receita de saída           tratar    null | { predefinicao, modo, intensidade }
 *   destino     de destino.js (pasta ou zip) chaveDestino   texto que entra na chave
 *   mascara     a máscara da marca-d'água (ou null)  marca    a impressão dela (para a chave)
 *   contexto    { trabalho, software }      looks     (id do look) → predefinição que o tem
 *   aoMudar()   a cada mudança
 */
export function criarExportacao({ itens, receita, tratar, destino, chaveDestino, mascara, marca, contexto, looks, trabalho, refazer = false, aoMudar }) {
  const motor = motorDoLote()
  const r = normalizarReceita(receita)
  const extensao = extensaoDaReceita(r)
  const porId = new Map(itens.map((it, i) => [it.foto.id, { ...it, seq: i + 1 }]))
  const feitasAntes = refazer ? [] : lerFeitas(trabalho)
  const fila = criarFila({
    itens: itens.map((it) => ({
      id: it.foto.id,
      foto: it.foto.id,
      ajustes: { tratamento: tratamentoDe(it.foto, tratar), destino: chaveDestino, marca: marca || null },
      receita: r,
    })),
    simultaneos: motor.faixas + 1,
    feitas: feitasAntes,
    minimoParaEstimar: 3,
  })
  const andamento = new Map() // id → { fase, p }
  const ajustesFinais = new Map()
  const explicacoes = new Map()
  let fase = 'pronta-para-comecar'
  let medidas = { feitas: 0, total: 0 }
  let bytes = 0
  let erro = null
  let rodando = null
  let medindo = null
  const ouvintes = new Set()
  const avisar = () => {
    for (const f of ouvintes) f()
    aoMudar?.()
  }
  fila.assinar(avisar)

  // ─── 1. medir (só com estilo e correção): as séries que têm alguma foto por fazer ───
  async function medir(sinal) {
    if (!tratar?.predefinicao) return
    const pendentes = new Set(fila.estado().itens.filter((x) => x.estado === 'na-fila').map((x) => x.id))
    const lista = itens.map((it) => it.foto)
    // a série (fotos seguidas do mesmo grupo) de uma pendente entra inteira: a suavização olha as vizinhas
    const entra = new Set()
    lista.forEach((f, i) => {
      if (!pendentes.has(f.id)) return
      entra.add(f.id)
      if (!f.grupo) return
      for (let j = i - 1; j >= 0 && lista[j].grupo === f.grupo; j--) entra.add(lista[j].id)
      for (let j = i + 1; j < lista.length && lista[j].grupo === f.grupo; j++) entra.add(lista[j].id)
    })
    const corrigir = tratar.modo !== 'so-estilo'
    const bases = new Map()
    if (corrigir) {
      const fazer = lista.filter((f) => entra.has(f.id) && !ajustesFinais.has(f.id))
      medidas = { feitas: 0, total: fazer.length }
      fase = 'medindo'
      avisar()
      await Promise.all(
        fazer.map(async (f) => {
          const it = porId.get(f.id)
          try {
            const m = await motor.medir({ id: f.id, arquivo: it.arquivo, nome: it.arquivo.name, sinal })
            bases.set(f.id, m.base)
          } catch (e) {
            if (sinal.aborted) throw e
            // sem a medida, a foto recebe só o estilo (por-foto.js diz isso na explicação)
          }
          medidas = { ...medidas, feitas: medidas.feitas + 1 }
          avisar()
        }),
      )
    }
    const lote = lista
      .filter((f) => entra.has(f.id))
      .map((f) => ({ id: f.id, base: bases.get(f.id), ajustes: normalizar(f.ajustes ?? neutro()), grupo: f.grupo ?? null }))
    for (const t of tratarEmLote(lote, tratar.predefinicao, { modo: tratar.modo, intensidade: tratar.intensidade })) {
      ajustesFinais.set(t.id, t.ajustes)
      explicacoes.set(t.id, t.explicacao)
    }
  }

  function lookDe(ajustes) {
    const id = ajustes.look?.id
    if (!id) return null
    // com estilo aplicado, o look é o dele (aplicar() põe o id do look do estilo nos ajustes)
    const p = tratar?.predefinicao?.look ? tratar.predefinicao : looks?.(id)
    if (!p?.look) throw new Error('O look desta foto não está na biblioteca.')
    return descompactar(p.look)
  }

  // ─── 2. exportar ───
  async function tratarItem(dados, { sinal, id }) {
    const it = porId.get(id)
    if (!it.arquivo) throw new Error('O original não está ao alcance. Religue a pasta.')
    const ajustes = ajustesFinais.get(id) ?? normalizar(it.foto.ajustes ?? neutro())
    andamento.set(id, { fase: 'revelando', p: 0 })
    avisar()
    const { pixels, exif, camera } = await motor.revelar({
      id,
      arquivo: it.arquivo,
      nome: it.arquivo.name,
      tamanho: it.arquivo.size,
      ajustes,
      tela: r.espaco,
      lado: ladoDaReceita(r),
      look: lookDe(ajustes),
      sinal,
      aoProgredir: (p) => {
        if (typeof p !== 'number') return
        andamento.set(id, { fase: 'revelando', p })
        avisar()
      },
    })
    if (sinal.aborted) throw abortado()
    andamento.set(id, { fase: 'gravando', p: 1 })
    avisar()
    const f = it.foto
    const arquivo = await motor.gerar(
      {
        largura: pixels.largura,
        altura: pixels.altura,
        dados: pixels.dados,
        receita: r,
        mascara: r.marcaDagua ? mascara : null,
        contexto: {
          exif: { ...exif, fabricante: camera?.fabricante, modelo: camera?.modelo },
          foto: { estrelas: f.estrelas, cor: f.cor, marca: f.marca },
          software: contexto.software,
          idioma: 'pt',
        },
      },
      { sinal },
    )
    if (sinal.aborted) throw abortado()
    const nome = await destino.gravar(
      { nome: f.nome, seq: it.seq, data: f.exif?.data, trabalho: contexto.trabalho, estrelas: f.estrelas, predefinicao: tratar?.predefinicao?.nome ?? '' },
      arquivo,
    )
    bytes += arquivo.bytes.length
    andamento.delete(id)
    return { nome, bytes: arquivo.bytes.length, largura: arquivo.largura, altura: arquivo.altura }
  }

  async function rodar() {
    if (rodando) return rodando
    const controle = new AbortController()
    medindo = controle
    erro = null
    rodando = (async () => {
      try {
        await medir(controle.signal)
        if (controle.signal.aborted) return
        fase = 'exportando'
        avisar()
        await fila.executar(tratarItem)
        gravarFeitas(trabalho, [...new Set([...lerFeitas(trabalho), ...fila.chavesFeitas()])])
      } catch (e) {
        if (e?.name !== 'AbortError') erro = String(e?.message ?? e)
      } finally {
        andamento.clear()
        fase = 'terminada'
        rodando = null
        medindo = null
        avisar()
      }
    })()
    avisar()
    return rodando
  }

  return {
    destino,
    extensao,
    comecar: rodar,
    pausar: () => fila.pausar(),
    retomar: () => fila.retomar(),
    cancelar() {
      medindo?.abort()
      fila.cancelar()
    },
    /** Põe de volta só as que falharam (as prontas não são refeitas) e roda de novo. */
    repetir() {
      if (fila.repetirFalhas()) return rodar()
      return null
    },
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    estado() {
      const e = fila.estado()
      return { fase, medidas, fila: e, andamento, bytes, erro, explicacoes, rodando: !!rodando }
    },
  }
}

// ─────────── prévias da galeria ───────────

/**
 * Gera e envia as prévias de uma galeria. `itens`: [{ foto, arquivo, ordem, grupo, melhor }]; `enviar(item, previa)`
 * registra a foto e manda os bytes (galeria.js, pelas rotas da API). Mesma fila: pausar, cancelar, repetir as falhas.
 */
export function criarEnvio({ itens, mascara, marca, enviar, looks, aoMudar }) {
  const motor = motorDoLote()
  const porId = new Map(itens.map((it) => [it.foto.id, it]))
  const fila = criarFila({
    itens: itens.map((it) => ({ id: it.foto.id, foto: it.foto.id, ajustes: normalizar(it.foto.ajustes ?? neutro()), receita: { nome: 'galeria' } })),
    simultaneos: motor.faixas + 1,
    minimoParaEstimar: 3,
  })
  let rodando = null
  let enviadosBytes = 0
  fila.assinar(() => aoMudar?.())
  async function tratarItem(_, { sinal, id }) {
    const it = porId.get(id)
    if (!it.arquivo) throw new Error('O original não está ao alcance. Religue a pasta.')
    const ajustes = normalizar(it.foto.ajustes ?? neutro())
    let look = null
    if (ajustes.look.id) {
      const p = looks?.(ajustes.look.id)
      if (!p?.look) throw new Error('O look desta foto não está na biblioteca.')
      look = descompactar(p.look)
    }
    const { pixels } = await motor.revelar({
      id,
      arquivo: it.arquivo,
      nome: it.arquivo.name,
      tamanho: it.arquivo.size,
      ajustes,
      tela: 'srgb',
      lado: 2048,
      look,
      sinal,
    })
    const r = await motor.galeria({ largura: pixels.largura, altura: pixels.altura, dados: pixels.dados, mascara: marca ? mascara : null, marca }, { sinal })
    if (sinal.aborted) throw abortado()
    await enviar(it, r, sinal)
    enviadosBytes += r.previa.bytes.length + r.mini.bytes.length
    return { tamanho: r.previa.bytes.length }
  }
  const rodar = () => {
    rodando ??= fila.executar(tratarItem).finally(() => {
      rodando = null
      aoMudar?.()
    })
    return rodando
  }
  return {
    comecar: rodar,
    cancelar: () => fila.cancelar(),
    repetir: () => (fila.repetirFalhas() ? rodar() : null),
    estado: () => ({ fila: fila.estado(), bytes: enviadosBytes, rodando: !!rodando }),
  }
}
