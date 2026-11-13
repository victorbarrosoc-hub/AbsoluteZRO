// Apoio dos testes de tela (Chromium): sobe o app pelo servidor local com os cabeçalhos de produção (vercel.json), em
// modo local (FOTO_LOCAL=1: sem login único), e fabrica as fotos de teste. Nenhuma imagem no git e nenhuma foto de
// gente: os JPEG são desenhados num canvas (faixas e um número), o EXIF é montado à mão e o DNG sai de
// `escreverDng` com um JPEG embutido.
//
//   const app = await subirApp()            // { base, fechar }
//   const navegador = await abrirChromium() // null sem Playwright
//   const fotos = await fabricarFotos(navegador, { quantas: 300 })   // [{ name, mimeType, buffer }]
//   const olho = vigiar(pagina)             // { erros, falhas, ruins, fora }

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { criarNegativo } from '../src/raw/negativo.js'
import { escreverDng } from '../src/raw/dng.js'

export const EXIGIR = process.env.FOTO_EXIGIR === '1'

let playwright = null
try {
  // require (e não import) para achar o Playwright também pelo NODE_PATH do ambiente
  playwright = createRequire(import.meta.url)('playwright')
} catch {
  playwright = null
}
export const semChromium = playwright ? false : 'sem Playwright na máquina'

export async function abrirChromium() {
  return playwright ? playwright.chromium.launch() : null
}

/** Onde ficam as capturas de tela (fora do repositório). FOTO_TELAS aponta a pasta; sem ela, uma temporária. */
export function pastaDasTelas() {
  const pasta = process.env.FOTO_TELAS || join(tmpdir(), 'foto-telas')
  mkdirSync(pasta, { recursive: true })
  return pasta
}

/**
 * Sobe o app em modo local numa porta livre, com publico/ montado numa pasta temporária.
 * `local: false` deixa o login único "configurado" com um segredo de teste (para abrir com sessão de verdade).
 */
export async function subirApp({ local = true } = {}) {
  const antes = { ...process.env }
  if (local) {
    process.env.FOTO_LOCAL = '1'
    delete process.env.ZRO_CLIENT_ID
    delete process.env.ZRO_CLIENT_SECRET
  } else {
    delete process.env.FOTO_LOCAL
    process.env.ZRO_CLIENT_ID = 'foto-web'
    process.env.ZRO_CLIENT_SECRET = 'segredo-de-teste-que-so-existe-aqui'
    // nenhum teste fala com a Absolute ZRO de verdade: o emissor aponta para uma porta fechada
    process.env.ZRO_ISSUER = 'http://127.0.0.1:9'
  }
  delete process.env.FOTO_DATABASE_URL
  const saida = mkdtempSync(join(tmpdir(), 'foto-tela-'))
  const { publicar } = await import('../publicar.mjs')
  await publicar({ saida, baixarModelos: false })
  const { servir } = await import('../scripts/servir.mjs')
  const servidor = await servir({ porta: 0, publico: saida })
  return {
    base: `http://127.0.0.1:${servidor.address().port}`,
    async fechar() {
      await new Promise((ok) => servidor.close(ok))
      rmSync(saida, { recursive: true, force: true })
      for (const k of ['FOTO_LOCAL', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'ZRO_ISSUER', 'FOTO_DATABASE_URL']) {
        if (antes[k] === undefined) delete process.env[k]
        else process.env[k] = antes[k]
      }
    },
  }
}

/** Anota o que a página reclama: erros de script e de console (CSP incluída), pedidos que falharam, respostas ≥ 400 e pedidos para fora. */
export function vigiar(pagina, base) {
  const olho = { erros: [], falhas: [], ruins: [], fora: [] }
  pagina.on('pageerror', (e) => olho.erros.push(`erro: ${e.message}`))
  pagina.on('console', (m) => (m.type() === 'error' || /Content Security Policy|CSP/i.test(m.text())) && olho.erros.push(`console: ${m.text()}`))
  pagina.on('requestfailed', (r) => olho.falhas.push(`${r.url()} ${r.failure()?.errorText}`))
  pagina.on('response', (r) => r.status() >= 400 && olho.ruins.push(`${r.status()} ${new URL(r.url()).pathname}`))
  pagina.on('request', (r) => {
    const u = r.url()
    if (base && !u.startsWith(base) && !u.startsWith('blob:') && !u.startsWith('data:')) olho.fora.push(u)
  })
  return olho
}

// ───────────────────────────── fotos fabricadas ─────────────────────────────

const u16 = (v) => [v & 255, (v >> 8) & 255]
const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]

/**
 * Põe um bloco EXIF (APP1) num JPEG: data de captura ('AAAA-MM-DDTHH:MM:SS') e orientação (1..8). TIFF little-endian
 * com IFD0 (Orientation, ponteiro do Exif) e o IFD do Exif (DateTimeOriginal).
 */
export function comExif(jpeg, { data, orientacao = 1 } = {}) {
  const texto = data ? `${data.replace(/-/g, ':').replace('T', ' ')}\0` : ''
  const entradas0 = 2
  const ifd0 = 8
  const exifIfd = ifd0 + 2 + entradas0 * 12 + 4
  const onde = exifIfd + 2 + 12 + 4
  const tiff = [
    0x49,
    0x49,
    0x2a,
    0x00,
    ...u32(ifd0),
    ...u16(entradas0),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientacao),
    0,
    0,
    ...u16(0x8769),
    ...u16(4),
    ...u32(1),
    ...u32(exifIfd),
    ...u32(0),
    ...u16(1),
    ...u16(0x9003),
    ...u16(2),
    ...u32(texto.length),
    ...u32(onde),
    ...u32(0),
    ...Buffer.from(texto, 'latin1'),
  ]
  const corpo = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from(tiff)])
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (corpo.length + 2) >> 8, (corpo.length + 2) & 255]), corpo])
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)])
}

/** Um DNG de verdade (mosaico Bayer de 64 × 48, sem compressão) com o JPEG dado embutido como prévia. */
export function dngFabricado(jpeg, { largura, altura, data = '2026-11-13T09:00:00', orientacao = 1 } = {}) {
  const l = 64
  const a = 48
  const dados = new Uint16Array(l * a)
  for (let i = 0; i < dados.length; i++) dados[i] = 200 + ((i * 37) % 600)
  const negativo = criarNegativo({
    tipo: 'raw',
    formato: 'dng',
    fabricante: 'ZRO',
    modelo: 'Sintetica',
    exif: { data, orientacao, iso: 200, tempo: 1 / 250, abertura: 2.8, focal: 35 },
    sensor: { largura: l, altura: a, dados },
    area: { x: 0, y: 0, largura: l, altura: a },
    cfa: { tipo: 'bayer', lado: 2, padrao: Uint8Array.of(0, 1, 1, 2) },
    preto: { porCanal: [64, 64, 64] },
    branco: { declarado: [1023, 1023, 1023] },
    cor: { origem: 'dng', matrizes: [{ kelvin: 6504, xyzParaCamera: [0.9, 0, 0, 0, 1, 0, 0, 0, 0.8] }] },
    previa: { jpeg: new Uint8Array(jpeg), largura, altura },
  })
  return Buffer.from(escreverDng(negativo))
}

/**
 * Desenha `quantas` imagens num canvas do próprio Chromium (faixas de cor e o número da foto: nada de gente) e
 * devolve os JPEG. `largura` × `altura` em px.
 */
export async function desenharJpegs(navegador, { quantas, largura = 720, altura = 480, inicio = 1 }) {
  const pagina = await navegador.newPage()
  try {
    const base64 = await pagina.evaluate(
      async ({ quantas, largura, altura, inicio }) => {
        const tela = new OffscreenCanvas(largura, altura)
        const c = tela.getContext('2d')
        const saida = []
        for (let i = 0; i < quantas; i++) {
          const n = inicio + i
          const matiz = (n * 47) % 360
          const g = c.createLinearGradient(0, 0, largura, altura)
          g.addColorStop(0, `hsl(${matiz} 55% 62%)`)
          g.addColorStop(1, `hsl(${(matiz + 70) % 360} 60% 28%)`)
          c.fillStyle = g
          c.fillRect(0, 0, largura, altura)
          // um "horizonte" e um "sol": dá para ver se a foto está de pé ou deitada, e de cabeça para cima
          c.fillStyle = `hsl(${(matiz + 200) % 360} 35% 18%)`
          c.fillRect(0, altura * 0.68, largura, altura * 0.32)
          c.fillStyle = 'rgb(255 255 255 / 0.85)'
          c.beginPath()
          c.arc(largura * 0.78, altura * 0.26, Math.min(largura, altura) * 0.09, 0, Math.PI * 2)
          c.fill()
          c.font = `700 ${Math.round(altura * 0.2)}px sans-serif`
          c.textBaseline = 'middle'
          c.fillText(String(n), largura * 0.08, altura * 0.42)
          const blob = await tela.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let texto = ''
          for (let k = 0; k < bytes.length; k += 0x8000) texto += String.fromCharCode(...bytes.subarray(k, k + 0x8000))
          saida.push(btoa(texto))
        }
        return saida
      },
      { quantas, largura, altura, inicio },
    )
    return base64.map((b) => Buffer.from(b, 'base64'))
  } finally {
    await pagina.close()
  }
}

const dois = (n) => String(n).padStart(2, '0')
/** A hora da foto número i (uma a cada 7 segundos, a partir das 10h de 13/11/2026). */
export function horaDaFoto(i) {
  const s = i * 7
  return `2026-11-13T${dois(10 + Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`
}

/**
 * O conjunto de teste, pronto para `setInputFiles`: `quantas` fotos, sendo a última um RAW (DNG fabricado) com o
 * JPEG da câmera ao lado (o par) e a terceira um JPEG de pé (orientação 6 no EXIF). Devolve
 * { arquivos, total (fotos, com o par contando uma vez), nomes }.
 */
export async function fabricarFotos(navegador, { quantas = 300 } = {}) {
  const jpegs = await desenharJpegs(navegador, { quantas })
  const arquivos = []
  for (let i = 0; i < quantas - 1; i++) {
    const nome = `IMG_${String(i + 1).padStart(4, '0')}.JPG`
    arquivos.push({ name: nome, mimeType: 'image/jpeg', buffer: comExif(jpegs[i], { data: horaDaFoto(i), orientacao: i === 2 ? 6 : 1 }) })
  }
  // o RAW e o par dele: mesmo nome, extensões diferentes
  const ultimo = jpegs[quantas - 1]
  const nomeRaw = `IMG_${String(quantas).padStart(4, '0')}`
  arquivos.push({
    name: `${nomeRaw}.DNG`,
    mimeType: 'image/x-adobe-dng',
    buffer: dngFabricado(ultimo, { largura: 720, altura: 480, data: horaDaFoto(quantas - 1) }),
  })
  arquivos.push({ name: `${nomeRaw}.JPG`, mimeType: 'image/jpeg', buffer: comExif(ultimo, { data: horaDaFoto(quantas - 1) }) })
  return { arquivos, total: quantas, raw: `${nomeRaw}.DNG` }
}
