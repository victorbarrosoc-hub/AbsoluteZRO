// O lado do fotógrafo, sem tela: as rotas de /api/foto/eventos (docs/API.md), o pool que lê as fotos (rostos +
// prévias com marca-d'água, app/rosto/fotografo-worker.js) e, no modo com consentimento, a comparação feita AQUI, no
// computador do fotógrafo: os vetores dos rostos das fotos ficam no IndexedDB deste aparelho (nunca sobem); sobe só a
// ligação foto ↔ pessoa de quem pediu.
//
//   api(metodo, caminho, corpo?)                       → JSON (lança Falha com o código do servidor)
//   criarPreparo({ loja, evento, ids, marca, aoMudar }) → { comecar, pausar, cancelar, estado }   retomável: o que já
//                                                         subiu (prévia enviada e rostos gravados) não é refeito
//   processarPedidos(evento)                           → { pessoas, ligacoes, faltam }          (consentimento)
//   mascaraDeTexto(texto)                              → a máscara alfa da marca-d'água (desenhada aqui, na fonte da casa)

import { criarPool } from '../trabalho/pool.js'
import { deBase64, paraBase64, vetorDeTexto } from '../../src/rosto/assinatura.js'
import { ligar } from '../../src/rosto/decidir.js'

export class Falha extends Error {
  constructor(codigo, status = 0, dados = null) {
    super(codigo)
    this.codigo = codigo
    this.status = status
    this.dados = dados
  }
}

export async function api(metodo, caminho, corpo) {
  let r
  try {
    r = await fetch(`/api/foto/eventos${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: corpo instanceof Uint8Array ? { 'Content-Type': 'application/octet-stream' } : corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo instanceof Uint8Array ? corpo : corpo ? JSON.stringify(corpo) : undefined,
    })
  } catch {
    throw new Falha('rede')
  }
  let dados = null
  try {
    dados = await r.json()
  } catch {
    /* sem JSON */
  }
  if (!r.ok || !dados?.ok) throw new Falha(dados?.erro || 'erro', r.status, dados)
  return dados
}

// ───────── os vetores deste computador (modo com consentimento) ─────────

const BANCO = 'foto-rosto'
function abrirBanco() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('rostos')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falha(r.error)
  })
}
async function naLoja(modo, fn) {
  const db = await abrirBanco()
  try {
    return await new Promise((ok, falha) => {
      const t = db.transaction('rostos', modo)
      const r = fn(t.objectStore('rostos'))
      t.oncomplete = () => ok(r?.result)
      t.onerror = () => falha(t.error)
    })
  } finally {
    db.close()
  }
}
const chaveLocal = (evento, foto) => `${evento}|${foto}`
export const guardarRostos = (evento, foto, rostos) => naLoja('readwrite', (l) => l.put(rostos, chaveLocal(evento, foto)))
/** Todos os rostos guardados de um evento: Map(foto → [rosto]). */
export async function rostosDoEvento(evento) {
  const db = await abrirBanco()
  try {
    return await new Promise((ok, falha) => {
      const saida = new Map()
      const t = db.transaction('rostos', 'readonly')
      const req = t.objectStore('rostos').openCursor(IDBKeyRange.bound(`${evento}|`, `${evento}|￿`))
      req.onsuccess = () => {
        const c = req.result
        if (!c) return
        saida.set(String(c.key).split('|')[1], c.value)
        c.continue()
      }
      t.oncomplete = () => ok(saida)
      t.onerror = () => falha(t.error)
    })
  } finally {
    db.close()
  }
}
/** Apaga os vetores deste computador de um evento (encerrar, apagar). */
export async function esquecerEvento(evento) {
  await naLoja('readwrite', (l) => l.delete(IDBKeyRange.bound(`${evento}|`, `${evento}|￿`)))
}

// ───────── o que foi escolhido ao criar (para continuar depois) ─────────

const ESCOLHA = (evento) => `foto-rosto:${evento}`
export function lembrarEscolha(evento, { ids, marca }) {
  try {
    localStorage.setItem(ESCOLHA(evento), JSON.stringify({ ids, marca }))
  } catch {
    /* sem armazenamento: continuar usa o trabalho inteiro */
  }
}
export function escolhaDe(evento) {
  try {
    return JSON.parse(localStorage.getItem(ESCOLHA(evento)) || 'null')
  } catch {
    return null
  }
}

// ───────── a marca-d'água ─────────

/** Texto → { largura, altura, dados: Float32Array } (alfa). Desenhado na Figtree, em branco. */
export async function mascaraDeTexto(texto) {
  const t = String(texto || '').trim()
  if (!t) return null
  const alto = 160
  await document.fonts?.load?.(`700 ${alto}px "Figtree Variable"`).catch(() => {})
  const fonte = `700 ${alto}px "Figtree Variable", system-ui, sans-serif`
  const medir = new OffscreenCanvas(8, 8).getContext('2d')
  medir.font = fonte
  const margem = Math.round(alto * 0.12)
  const largura = Math.ceil(medir.measureText(t).width) + margem * 2
  const altura = Math.round(alto * 1.3)
  const c = new OffscreenCanvas(largura, altura)
  const x = c.getContext('2d')
  x.font = fonte
  x.fillStyle = '#fff'
  x.textBaseline = 'middle'
  x.fillText(t, margem, altura / 2)
  const px = x.getImageData(0, 0, largura, altura).data
  const dados = new Float32Array(largura * altura)
  for (let i = 0; i < dados.length; i++) dados[i] = px[i * 4 + 3] / 255
  return { largura, altura, dados }
}

// ───────── preparar: ler, subir, guardar ─────────

let pool = null
const poolDoRosto = () =>
  (pool ??= criarPool(new URL('./fotografo-worker.js', import.meta.url), {
    tamanho: Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency || 2) - 1)),
    nome: 'rosto',
  }))

/**
 * Prepara as fotos de um evento: para cada uma (que ainda não terminou), lê a maior JPEG do aparelho, acha e assina
 * os rostos, gera a prévia e a miniatura com a marca-d'água, registra a foto, envia os bytes e grava os rostos
 * (busca aberta: os vetores sobem; com consentimento: só quantos, e os vetores ficam aqui). Retomável.
 * `aoMudar(estado)`: { situacao, feitas, total, rostos, falhas, motivo (da última falha), porFoto (ms), erro }.
 */
export function criarPreparo({ loja, evento, ids, marca = null, aoMudar = () => {} }) {
  const estado = { situacao: 'parada', feitas: 0, total: ids.length, rostos: 0, falhas: 0, motivo: null, porFoto: null, erro: null }
  let parar = false
  let rodando = null
  const avisar = () => aoMudar({ ...estado })

  async function uma(id, ordem, jaFeitas, mascara) {
    if (jaFeitas.has(id)) return
    const foto = loja.catalogo.foto(id)
    const fonte = foto && (await loja.miniaturas.grande(id))
    if (!fonte) throw new Error('O original não está ao alcance. Religue a pasta.')
    const r = await poolDoRosto().pedir(
      'evento',
      { blob: fonte.blob, orientacao: fonte.orientacao ?? 1, doNavegador: !!fonte.doNavegador, mascara },
      { chave: `evento:${evento.id}:${id}` },
    )
    const registro = {
      fotoId: id,
      nome: foto.nome,
      ordem,
      largura: r.previa.largura,
      altura: r.previa.altura,
      tipo: r.previa.tipo,
      tamanho: r.previa.bytes.length,
      sha256: r.previa.sha256,
      mini: { tipo: r.mini.tipo, tamanho: r.mini.bytes.length, sha256: r.mini.sha256 },
    }
    const { fotos } = await api('POST', `/${evento.id}/fotos`, { fotos: [registro] })
    const servidor = fotos[0]
    await api('PUT', `/${evento.id}/arquivo?foto=${servidor.id}&v=previa`, r.previa.bytes)
    await api('PUT', `/${evento.id}/arquivo?foto=${servidor.id}&v=mini`, r.mini.bytes)
    const rostos = r.rostos.map((x) => ({ v: paraBase64(new Uint8Array(x.v.buffer)), largura: x.largura, nota: x.nota, colado: x.colado, perfil: x.perfil }))
    if (evento.modo === 'aberta') await api('POST', `/${evento.id}/rostos`, { foto: servidor.id, rostos })
    else {
      await guardarRostos(evento.id, servidor.id, rostos)
      await api('POST', `/${evento.id}/rostos`, { foto: servidor.id, quantos: rostos.length })
    }
    estado.rostos += rostos.length
  }

  async function rodar() {
    parar = false
    estado.situacao = 'rodando'
    estado.erro = null
    avisar()
    try {
      const atual = await api('GET', `/${evento.id}`)
      const prontas = new Set(atual.fotos.filter((f) => f.enviada && f.mini?.enviada && f.rostosEm).map((f) => f.fotoId))
      estado.feitas = ids.filter((id) => prontas.has(id)).length
      avisar()
      const mascara = marca ? await mascaraDeTexto(marca) : null
      const fila = ids.map((id, ordem) => ({ id, ordem })).filter((x) => !prontas.has(x.id))
      const inicio = performance.now()
      const falhas = []
      let feitasAgora = 0
      const vez = async () => {
        while (fila.length && !parar) {
          const { id, ordem } = fila.shift()
          try {
            await uma(id, ordem, prontas, mascara)
            estado.feitas += 1
            feitasAgora += 1
            estado.porFoto = Math.round((performance.now() - inicio) / feitasAgora)
          } catch (e) {
            if (e?.codigo === 'rede' || e?.status === 503 || e?.status === 401) throw e
            estado.falhas += 1
            falhas.push({ id, ordem })
            estado.motivo = String(e?.codigo || e?.message || e).slice(0, 160)
          }
          avisar()
        }
      }
      const paralelo = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
      await Promise.all(Array.from({ length: paralelo }, vez))
      // as que falharam ganham uma segunda chance, uma de cada vez
      if (!parar && falhas.length) {
        fila.push(...falhas.splice(0))
        estado.falhas = 0
        await vez()
      }
      estado.situacao = parar ? 'pausada' : estado.feitas >= estado.total ? 'pronta' : 'com-falhas'
    } catch (e) {
      estado.situacao = 'parada'
      estado.erro = e?.codigo || e?.message || 'erro'
    }
    avisar()
  }

  return {
    comecar: () => (rodando ??= rodar().finally(() => (rodando = null))),
    pausar: () => {
      parar = true
    },
    estado: () => ({ ...estado }),
  }
}

/**
 * Modo com consentimento: busca quem pediu (GET pessoas), compara AQUI com os rostos guardados deste computador e
 * sobe só as ligações. Devolve { pessoas (processadas), ligacoes, faltam (fotos do evento sem rostos neste aparelho) }.
 */
export async function processarPedidos(evento, { todas = false } = {}) {
  const { pessoas } = await api('GET', `/${evento.id}/pessoas`)
  const alvo = pessoas.filter((p) => todas || p.pendente)
  const { fotos } = await api('GET', `/${evento.id}`)
  const locais = await rostosDoEvento(evento.id)
  const faltam = fotos.filter((f) => f.rostosEm && !locais.has(f.id)).length
  if (!alvo.length) return { pessoas: 0, ligacoes: 0, faltam }
  const rostos = []
  for (const [foto, lista] of locais) {
    for (const r of lista) {
      const v = vetorDeTexto(r.v)
      if (v) rostos.push({ foto, v, largura: r.largura, nota: r.nota, colado: r.colado, perfil: r.perfil })
    }
  }
  let ligacoes = 0
  // em lotes (o corpo do pedido tem teto); cada pessoa vai inteira num lote
  for (let i = 0; i < alvo.length; i += 200) {
    const lote = alvo.slice(i, i + 200).map((p) => ({ id: p.id, vetores: p.vetores.map((t) => new Int8Array(deBase64(t).buffer)) }))
    const lista = ligar(lote, rostos)
    const r = await api('POST', `/${evento.id}/ligacoes`, { pessoas: lote.map((p) => p.id), ligacoes: lista })
    ligacoes += r.ligacoes
  }
  return { pessoas: alvo.length, ligacoes, faltam }
}
