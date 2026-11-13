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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const r = await baixar({ log: console.log })
  console.log(`${r.prontos.length} de ${modelos().length} modelos prontos em .modelos/`)
  if (r.faltando.length && !process.argv.includes('--tolerante')) process.exit(1)
}
