// Modelos de visão da decupagem (modelos.json): baixa o que falta para .modelos/ (fora do git), do endereço oficial com
// versão fixa, e só guarda o arquivo se o tamanho e o sha256 conferem. Arquivo presente e certo não é baixado de novo;
// presente e errado é trocado. `node scripts/modelos.mjs` sai com erro se algum faltar (o CI para aí);
// `--tolerante` só avisa. O publicar.mjs usa `baixar()` e segue sem o que não veio: a tela mostra a camada como
// indisponível (não fingir).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
export const PASTA = join(RAIZ, '.modelos')
export const LISTA = join(RAIZ, 'modelos.json')
const ORIGEM = 'https://storage.googleapis.com/mediapipe-models/'

/** A lista de modelos.json, conferida: nome simples, endereço oficial com versão fixa, sha256 e tamanho. */
export function modelos(arquivo = LISTA) {
  const { modelos: lista } = JSON.parse(readFileSync(arquivo, 'utf8'))
  if (!Array.isArray(lista) || !lista.length) throw new Error('modelos.json sem modelos')
  for (const m of lista) {
    if (!/^[a-z0-9_]+\.(tflite|task)$/.test(m.arquivo)) throw new Error(`modelos.json: nome inválido (${m.arquivo})`)
    if (typeof m.url !== 'string' || !m.url.startsWith(ORIGEM) || !/\/\d+\/[^/]+$/.test(m.url) || m.url.includes('/latest/')) throw new Error(`modelos.json: endereço sem versão fixa (${m.arquivo})`)
    if (!/^[0-9a-f]{64}$/.test(m.sha256) || !Number.isInteger(m.tamanho) || m.tamanho <= 0) throw new Error(`modelos.json: sha256 ou tamanho inválido (${m.arquivo})`)
    if (typeof m.camada !== 'string' || !m.camada) throw new Error(`modelos.json: sem camada (${m.arquivo})`)
  }
  return lista
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** O arquivo em `pasta` existe e é o de modelos.json? */
export function confere(m, pasta = PASTA) {
  const caminho = join(pasta, m.arquivo)
  if (!existsSync(caminho) || statSync(caminho).size !== m.tamanho) return false
  return sha256(readFileSync(caminho)) === m.sha256
}

/** Situação de cada modelo em `pasta`: { ...modelo, pronto }. */
export const situacao = (pasta = PASTA, lista = modelos()) => lista.map((m) => ({ ...m, pronto: confere(m, pasta) }))

/**
 * Baixa o que falta. Nunca lança por causa da rede: devolve { prontos, faltando } com o motivo de cada falta.
 * `buscar` é o fetch (os testes trocam).
 */
export async function baixar({ pasta = PASTA, lista = modelos(), buscar = fetch, log = () => {}, prazoMs = 120_000 } = {}) {
  mkdirSync(pasta, { recursive: true })
  const prontos = []
  const faltando = []
  for (const m of lista) {
    if (confere(m, pasta)) {
      prontos.push(m.arquivo)
      continue
    }
    const destino = join(pasta, m.arquivo)
    const parcial = `${destino}.parcial`
    try {
      const r = await buscar(m.url, { redirect: 'error', signal: AbortSignal.timeout(prazoMs) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.length !== m.tamanho) throw new Error(`tamanho ${bytes.length}, esperado ${m.tamanho}`)
      if (sha256(bytes) !== m.sha256) throw new Error('sha256 não confere')
      writeFileSync(parcial, bytes)
      renameSync(parcial, destino)
      prontos.push(m.arquivo)
      log(`baixado ${m.arquivo} (${bytes.length} bytes, sha256 confere)`)
    } catch (e) {
      rmSync(parcial, { force: true })
      const motivo = String(e?.cause?.code || e?.message || e).slice(0, 120)
      faltando.push({ arquivo: m.arquivo, camada: m.camada, motivo })
      log(`faltou ${m.arquivo}: ${motivo}`)
    }
  }
  return { prontos, faltando }
}

// ───────── rosto em evento ─────────
// Os originais (YuNet e SFace) vêm do Hugging Face, com o commit fixo no endereço (o arquivo mora num CDN para onde o
// endereço redireciona: o sha256 é o que vale). Ficam em .modelos-rosto/, fora do git. Os derivados saem das receitas
// de scripts/onnx.mjs e só ficam se o sha256 confere com modelos.json; só eles vão para o site.

export const PASTA_ROSTO = join(RAIZ, '.modelos-rosto')
const ORIGEM_HF = /^https:\/\/huggingface\.co\/opencv\/[a-z_]+\/resolve\/[0-9a-f]{40}\/[a-z0-9_]+\.onnx$/

/** { fontes, modelos } do bloco `rosto` de modelos.json, conferidos. */
export function modelosDeRosto(arquivo = LISTA) {
  const { rosto } = JSON.parse(readFileSync(arquivo, 'utf8'))
  if (!rosto || !Array.isArray(rosto.fontes) || !Array.isArray(rosto.modelos)) throw new Error('modelos.json sem o bloco rosto')
  const nomes = new Set(rosto.fontes.map((f) => f.arquivo))
  for (const m of [...rosto.fontes, ...rosto.modelos]) {
    if (!/^[a-z0-9_]+\.onnx$/.test(m.arquivo)) throw new Error(`modelos.json: nome inválido (${m.arquivo})`)
    if (!/^[0-9a-f]{64}$/.test(m.sha256) || !Number.isInteger(m.tamanho) || m.tamanho <= 0) throw new Error(`modelos.json: sha256 ou tamanho inválido (${m.arquivo})`)
  }
  for (const f of rosto.fontes) if (!ORIGEM_HF.test(f.url)) throw new Error(`modelos.json: endereço sem commit fixo (${f.arquivo})`)
  for (const m of rosto.modelos) if (!nomes.has(m.de) || typeof m.receita !== 'string') throw new Error(`modelos.json: receita sem origem (${m.arquivo})`)
  return rosto
}

/** Situação dos modelos de rosto que vão para o site: { ...modelo, pronto }. */
export const situacaoRosto = (pasta = PASTA_ROSTO, rosto = modelosDeRosto()) => rosto.modelos.map((m) => ({ ...m, pronto: confere(m, pasta) }))

/**
 * Baixa os originais que faltam e gera os derivados (scripts/onnx.mjs). Nunca lança por causa da rede: devolve
 * { prontos, faltando }, como `baixar`.
 */
export async function prepararRosto({ pasta = PASTA_ROSTO, rosto = modelosDeRosto(), buscar = fetch, log = () => {}, prazoMs = 300_000 } = {}) {
  mkdirSync(pasta, { recursive: true })
  const { RECEITAS } = await import('./onnx.mjs')
  const prontos = []
  const faltando = []
  for (const m of rosto.modelos) {
    if (confere(m, pasta)) {
      prontos.push(m.arquivo)
      continue
    }
    const fonte = rosto.fontes.find((f) => f.arquivo === m.de)
    try {
      if (!confere(fonte, pasta)) {
        const r = await buscar(fonte.url, { redirect: 'follow', signal: AbortSignal.timeout(prazoMs) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const bytes = Buffer.from(await r.arrayBuffer())
        if (bytes.length !== fonte.tamanho || sha256(bytes) !== fonte.sha256) throw new Error(`${fonte.arquivo}: sha256 não confere`)
        writeFileSync(join(pasta, fonte.arquivo), bytes)
        log(`baixado ${fonte.arquivo} (${bytes.length} bytes, sha256 confere)`)
      }
      const receita = RECEITAS[m.receita]
      if (!receita) throw new Error(`receita desconhecida: ${m.receita}`)
      const saida = receita(readFileSync(join(pasta, fonte.arquivo)))
      if (saida.length !== m.tamanho || sha256(saida) !== m.sha256) throw new Error(`${m.arquivo}: o derivado não confere com modelos.json`)
      writeFileSync(join(pasta, m.arquivo), saida)
      prontos.push(m.arquivo)
      log(`gerado ${m.arquivo} (${saida.length} bytes, sha256 confere)`)
    } catch (e) {
      const motivo = String(e?.cause?.code || e?.message || e).slice(0, 160)
      faltando.push({ arquivo: m.arquivo, camada: m.camada, motivo })
      log(`faltou ${m.arquivo}: ${motivo}`)
    }
  }
  return { prontos, faltando }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const r = await baixar({ log: console.log })
  console.log(`${r.prontos.length} de ${modelos().length} modelos prontos em .modelos/`)
  const rr = await prepararRosto({ log: console.log })
  console.log(`${rr.prontos.length} de ${modelosDeRosto().modelos.length} modelos de rosto prontos em .modelos-rosto/`)
  if ((r.faltando.length || rr.faltando.length) && !process.argv.includes('--tolerante')) process.exit(1)
}
