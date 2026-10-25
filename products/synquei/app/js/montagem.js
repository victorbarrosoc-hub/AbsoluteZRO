// Analisar a montagem (app de desktop · Beta): a pessoa escolhe uma sequência já montada no DaVinci, o Synquei lê os
// cortes pela janelinha (desktop/davinci.cjs), procura picos no som dos clipes, mostra onde cabe um SFX e sugere sons
// da biblioteca dela (desktop/sfx-biblioteca.cjs). Mandar para o DaVinci é opcional: só marcadores ou os sons numa faixa.

import { PathFile } from './media/pathfile.js'
import { probeWithSidecar } from './media/probe.js'
import { extractAudio } from './media/extract.js'
import { pontosDaSequencia, picosDoSinal, picosNaSequencia, indexar, sugerirTodos, pedidoSfx } from './montagem-sfx.js'

const D = globalThis.synqueiDesktop
const MAX_ARQUIVOS = 12

export const M = {
  ativo: !!(D && D.sfx && D.davinci),
  sequencias: null,
  linha: null,
  pontos: [],
  biblioteca: null,
  indice: [],
  ocupado: '',
  erro: null,
  aviso: null,
  resultado: null,
}

let mudouT = 0
function mudou() {
  clearTimeout(mudouT)
  mudouT = setTimeout(() => document.dispatchEvent(new CustomEvent('synquei:montagem-mudou')), 40)
}

// pedidos ao DaVinci: a resposta chega pela janelinha (pode demorar se ela estiver fechada)
const esperando = new Map()
if (M.ativo) {
  D.davinci.onResposta((r) => {
    const w = esperando.get(r.seq)
    if (!w) return
    esperando.delete(r.seq)
    w(r)
  })
  D.sfx.estado().then((b) => {
    usarBiblioteca(b)
    mudou()
  })
}
async function pedir(tipo, dados = {}, limite = 90000) {
  const seq = await D.davinci.enviar({ tipo, ...dados })
  return new Promise((ok, falha) => {
    const t = setTimeout(() => {
      esperando.delete(seq)
      falha(new Error('O DaVinci não respondeu. Abra Workspace › Scripts › Synquei e deixe a janelinha aberta.'))
    }, limite)
    esperando.set(seq, (r) => {
      clearTimeout(t)
      if (r.ok === false) falha(new Error(r.erro || 'O DaVinci não conseguiu.'))
      else ok(r)
    })
  })
}

async function ocupado(texto, fn) {
  M.ocupado = texto
  M.erro = null
  mudou()
  try {
    return await fn()
  } catch (e) {
    M.erro = e.message || String(e)
  } finally {
    M.ocupado = ''
    mudou()
  }
}

function usarBiblioteca(b) {
  M.biblioteca = b && b.pasta ? { pasta: b.pasta, total: b.total } : null
  M.indice = b && b.arquivos ? indexar(b.arquivos) : []
  if (M.pontos.length) M.pontos = sugerirTodos(M.pontos, M.indice)
}

// ───────── ações ─────────
export const buscarSequencias = () =>
  ocupado('Perguntando ao DaVinci quais sequências o projeto tem…', async () => {
    const r = await pedir('listar_linhas')
    M.sequencias = r.sequencias || []
    M.projeto = r.projeto
    if (!M.sequencias.length) M.erro = 'O projeto aberto no DaVinci não tem sequências.'
  })

export const analisar = (nome) =>
  ocupado(`Lendo “${nome}” no DaVinci…`, async () => {
    M.resultado = null
    M.aviso = null
    const { linha } = await pedir('ler_linha', { linha: nome })
    M.linha = linha
    const picos = await picosDaLinha(linha)
    M.pontos = sugerirTodos(pontosDaSequencia(linha, picos), M.indice)
  })

/** Picos de som dos clipes de áudio da sequência (os arquivos que o computador consegue ler). */
async function picosDaLinha(linha) {
  const clipes = (linha.audio || []).flat().filter((c) => c && c.arquivo)
  const arquivos = [...new Set(clipes.map((c) => c.arquivo))].slice(0, MAX_ARQUIVOS)
  if (!arquivos.length) return []
  const info = await D.sfx.info(arquivos)
  const out = []
  let lidos = 0
  for (const abs of arquivos) {
    const i = info[abs]
    if (!i) continue
    M.ocupado = `Procurando picos de som · ${lidos + 1}/${arquivos.length}`
    mudou()
    try {
      const file = new PathFile({ abs, size: i.size, lastModified: i.mtimeMs })
      const plano = await probeWithSidecar(file, file.name)
      if (!plano.audioPlan || plano.audioPlan.type === 'none') continue
      const { sig } = await extractAudio(file, plano)
      const pk = picosDoSinal(sig, 4000)
      for (const c of clipes.filter((x) => x.arquivo === abs)) out.push(...picosNaSequencia(c, pk, linha.fps))
      lidos++
    } catch {}
  }
  if (arquivos.length && !lidos) M.aviso = 'Não deu para ler o som dos clipes desta sequência: só os cortes, o começo e o fim foram marcados.'
  return out
}

export const escolherBiblioteca = () =>
  ocupado('Indexando a sua biblioteca de SFX…', async () => {
    const b = await D.sfx.escolher()
    if (b) usarBiblioteca(b)
  })

export const reindexar = () =>
  ocupado('Indexando a sua biblioteca de SFX…', async () => {
    usarBiblioteca(await D.sfx.reindexar())
  })

export function escolherSom(id, caminho) {
  const p = M.pontos.find((x) => x.id === id)
  if (p) {
    p.escolhido = caminho || null
    p.incluir = !!caminho
  }
  mudou()
}

export function alternar(id, ligado) {
  const p = M.pontos.find((x) => x.id === id)
  if (p) p.incluir = ligado && !!p.escolhido
  mudou()
}

export const mandar = (sons) =>
  ocupado(sons ? 'Encaixando os sons no DaVinci…' : 'Marcando os pontos no DaVinci…', async () => {
    const r = await pedir('sfx', pedidoSfx(M.linha.nome, M.pontos, { sons, fps: M.linha.fps }))
    M.resultado = { marcados: r.marcados || 0, encaixados: r.encaixados || 0, falhas: (r.falhas || []).length, sons }
  })

export function recomecar() {
  M.linha = null
  M.pontos = []
  M.resultado = null
  M.aviso = null
  M.erro = null
  mudou()
}
