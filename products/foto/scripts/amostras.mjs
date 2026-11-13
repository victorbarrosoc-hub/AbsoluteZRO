// Amostras RAW de domínio público (CC0) para os testes de leitura e revelação: baixa o que falta para .amostras/ (fora
// do git), do raw.pixls.us, e só guarda o arquivo se o tamanho e o sha256 conferem. Arquivo presente e certo não é
// baixado de novo; presente e errado é trocado.
//
//   node scripts/amostras.mjs              baixa; sai com erro se alguma faltar
//   node scripts/amostras.mjs --tolerante  só avisa
//
// Os testes que usam amostra pulam com mensagem quando ela falta; com FOTO_EXIGIR_AMOSTRAS=1 a falta vira falha. O CI
// não baixa por padrão (não depende de site de terceiros): o workflow tem a opção manual.
//
// A lista veio do índice público do raw.pixls.us (https://raw.pixls.us/json/getrepository.php?set=all), procurando cada
// arquivo pelo sha256; todos estão marcados como CC0 (Creative Commons Zero, domínio público) no índice.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
export const PASTA = join(RAIZ, '.amostras')
const ORIGEM = 'https://raw.pixls.us/getfile.php/'

// arquivo local, id e nome no raw.pixls.us, tamanho em bytes e sha256
export const LISTA = [
  ['adobe_5d3_lossy.dng', 1023, 'Adobe DNG Converter - Canon EOS 5D Mark III - Lossy JPEG compression (3:2).DNG', 6193902, '159326856c29073e845c3c5a9ecf98c6474f43ca15798a88ad5e2baecd0664b7'],
  ['canon_30d.cr2', 1791, 'Canon - EOS 30D - RAW (3:2).CR2', 9254110, 'fb216f8df8d7abca4eb9d9f8dc594c1d2b69d0a6369fb8b4107743343c37144f'],
  ['canon_5d3.dng', 2204, 'Canon - EOS 5D Mark III - 14bit 14bit (2.3471882640587).dng', 1538165, '1d77dcc6cdb839b10c1948f0b4471984ab48cf15e973fb77520584cee72b603e'],
  ['canon_r6.cr3', 4659, 'Canon - EOS R6 - 3:2.CR3', 5273174, '74abb0a113d075ad9887a058082f40dd2a938c4813a08474d82356f11a027778'],
  ['fuji_xt30ii.raf', 5064, 'Fujifilm - X-T30 II - 14bit 14bit compressed (3:2).RAF', 19409712, '5e2678038377cc7f146ceb7693c08535fa1af162cec705d06b0446c3d3017d47'],
  ['iphone_xs.dng', 3372, 'Apple - iPhone XS - 16bit (4:3).dng', 10290665, '50bc64ee8cfbbfb6c0531e29ab428ff985506a16fe2d1d2e74656f21b54505f6'],
  ['nikon_d70s.nef', 1117, 'Nikon - D70s - 12bit 12bit compressed (Lossy (type 1)) (3:2).NEF', 5193213, '6c46f9854033e7623ebbb5de8c951df6762ca44f05d45035ccc5cb7e9f4e5692'],
  ['pana_lx7.rw2', 7009, 'Panasonic - DMC-LX7 - 4:3.RW2', 3728896, '1e4ece67069fb8cb8dc63993386567fd42688df63da214ecaa9615d20ec74987'],
  ['pixel6pro.dng', 5961, 'Google - Pixel 6 Pro - 16bit (4:3).dng', 11932956, '3a859e917a91698a3e15ce3b3721a48a1fb1296873e0697d3bf7c2793297200d'],
  ['ricoh_gr.dng', 996, 'Ricoh - GR - 12bit (4:3).DNG', 12129815, '7ceec1ea31c56b6e0414202504581b915f17818ffe018b4c8bba1393332c405e'],
  ['samsung_g973.dng', 3839, 'Samsung - SM-G973U - 16bit 16bit (2.1132075471698).dng', 1318208, '6492b7e0ac8e012524c0c83606a104cc9bf3b68f30fa60c7b73ffbe4dc584ab1'],
  ['sony_a7s.arw', 1582, 'Sony - ILCE-7S - 14bit 14bit compressed (3:2).ARW', 6160384, 'a35ebb2fbec929daa5beb20d1ce5c15a8aac7b1a7a231455387f3df8a7442e07'],
].map(([arquivo, id, nome, tamanho, sha256]) => ({ arquivo, url: `${ORIGEM}${id}/nice/${encodeURIComponent(nome)}`, tamanho, sha256 }))

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** O arquivo em `pasta` existe e é o da lista? */
export function confere(a, pasta = PASTA) {
  const caminho = join(pasta, a.arquivo)
  if (!existsSync(caminho) || statSync(caminho).size !== a.tamanho) return false
  return sha256(readFileSync(caminho)) === a.sha256
}

/**
 * Baixa o que falta. Nunca lança por causa da rede: devolve { prontos, faltando } com o motivo de cada falta.
 * `buscar` é o fetch (os testes trocam). Redirecionamento só vale para o próprio raw.pixls.us.
 */
export async function baixar({ pasta = PASTA, lista = LISTA, buscar = fetch, log = () => {}, prazoMs = 180_000 } = {}) {
  mkdirSync(pasta, { recursive: true })
  const prontos = []
  const faltando = []
  for (const a of lista) {
    if (confere(a, pasta)) {
      prontos.push(a.arquivo)
      continue
    }
    const destino = join(pasta, a.arquivo)
    const parcial = `${destino}.parcial`
    try {
      const r = await buscar(a.url, { redirect: 'follow', signal: AbortSignal.timeout(prazoMs) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      if (r.url && !r.url.startsWith('https://raw.pixls.us/')) throw new Error(`redirecionado para fora do raw.pixls.us (${new URL(r.url).host})`)
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.length !== a.tamanho) throw new Error(`tamanho ${bytes.length}, esperado ${a.tamanho}`)
      if (sha256(bytes) !== a.sha256) throw new Error('sha256 não confere')
      writeFileSync(parcial, bytes)
      renameSync(parcial, destino)
      prontos.push(a.arquivo)
      log(`baixado ${a.arquivo} (${bytes.length} bytes, sha256 confere)`)
    } catch (e) {
      rmSync(parcial, { force: true })
      const motivo = String(e?.cause?.code || e?.message || e).slice(0, 120)
      faltando.push({ arquivo: a.arquivo, motivo })
      log(`faltou ${a.arquivo}: ${motivo}`)
    }
  }
  return { prontos, faltando }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const r = await baixar({ log: console.log })
  console.log(`${r.prontos.length} de ${LISTA.length} amostras prontas em .amostras/`)
  if (r.faltando.length && !process.argv.includes('--tolerante')) process.exit(1)
}
