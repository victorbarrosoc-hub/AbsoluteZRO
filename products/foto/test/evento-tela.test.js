// A página do visitante (/e/<token>) e o lado do fotógrafo no Chromium de verdade, com os cabeçalhos de produção
// (vercel.json), um Postgres temporário, a pasta local de arquivos, o ONNX Runtime e os modelos de verdade, e uma
// CÂMERA FALSA: o Chromium lê um vídeo .y4m gerado aqui (nenhuma foto de gente). Dois vídeos: uma CABEÇA 3D sintética
// (test/apoio-cabeca.js: elipsoide com nariz, a textura do rosto desenhado, luz) que gira para os dois lados e chega
// perto, em laço; e o MESMO rosto num plano (foto ou tela) que gira e chega perto. O fotógrafo (app/rosto/preparo.js,
// o mesmo código do painel) prepara as fotos sintéticas do evento: rostos, prévias com marca-d'água, upload; publica.
// O visitante:
//   - busca aberta: consentimento → câmera ao vivo → o desafio sorteado pelo servidor (vire para a esquerda, para a
//     direita, chegue mais perto, na ordem pedida) → a prova conferida no servidor → "É você" → favoritar → pedir;
//   - o mesmo rosto num plano girando: o desafio não se cumpre, nada é buscado; a planaridade e a guinada medidas com o
//     YuNet de verdade nos quadros das duas cabeças;
//   - o limite do aparelho, com a mensagem curta; evento com crianças (a caixa do responsável destacada);
//   - com consentimento: pedido feito → o computador do fotógrafo compara e sobe as ligações → a pessoa volta pelo link
//     e vê as fotos;
//   - "não quero aparecer": confere e tira da busca;
//   - o que sai pela rede é só o vetor (base64 de 128 bytes por quadro), nunca imagem;
//   - 390 px e 1440 px, claro e escuro, sem erro de console, sem violação de CSP, sem pedido para fora.
// Capturas em FOTO_TELAS (ou numa pasta temporária): evento-*.png e evento2-*.png (desafio, limite, crianças).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import postgres from 'postgres'
import { NOME } from '../app/nome.js'
import { pastaDasTelas, vigiar } from './apoio-tela.js'
import { renderizar } from './apoio-cabeca.js'
import { dioDe, formaDe, guinadaNaImagem, paralaxe, VIDA } from '../src/rosto/vida.js'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const EXIGIR = process.env.FOTO_EXIGIR === '1'
let playwright = null
try {
  playwright = createRequire(import.meta.url)('playwright')
} catch {
  playwright = null
}
const RAIZ = new URL('..', import.meta.url).pathname
const MODELOS = ['yunet_2023mar_dinamico.onnx', 'sface_2021dec_p8.onnx'].every((f) => existsSync(join(RAIZ, '.modelos-rosto', f)))
const ORT = existsSync(join(RAIZ, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'))
const pular = !playwright
  ? 'sem Playwright na máquina'
  : semPostgres || (!MODELOS ? 'sem os modelos de rosto (npm run modelos)' : !ORT ? 'sem onnxruntime-web (npm ci)' : false)

/**
 * O rosto sintético (desenho, não gente): oval com sombreado, cabelo, sobrancelhas, olhos, nariz e boca. `giro` vira
 * o rosto (os traços andam para o lado e o olho de lá encolhe), o que o detector lê como guinada.
 */
function desenharRosto(c, { cx, cy, largura, giro = 0 }) {
  const r = largura / 2
  const a = r * 1.3
  const desl = giro * r * 0.45
  c.save()
  c.fillStyle = '#d9a582'
  c.fillRect(cx - r * 0.42, cy + a * 0.7, r * 0.84, a * 0.8)
  c.fillStyle = '#2b1d14'
  c.beginPath()
  c.ellipse(cx, cy - a * 0.18, r * 1.08, a * 0.98, 0, 0, Math.PI * 2)
  c.fill()
  const g = c.createRadialGradient(cx + desl * 0.6 - r * 0.25, cy - a * 0.25, r * 0.1, cx, cy, r * 1.3)
  g.addColorStop(0, '#f6d2b5')
  g.addColorStop(0.6, '#d9a582')
  g.addColorStop(1, '#7a4a2c')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(cx, cy, r, a, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#2b1d14'
  c.beginPath()
  c.ellipse(cx, cy - a * 0.82, r * 0.95, a * 0.32, 0, 0, Math.PI * 2)
  c.fill()
  const olhoY = cy - a * 0.12
  for (const lado of [-1, 1]) {
    const comp = 1 - Math.max(0, lado * giro) * 0.35
    const ox = cx + lado * r * 0.4 * (1 - Math.abs(giro) * 0.15) + desl
    c.strokeStyle = '#2a1a10'
    c.lineWidth = r * 0.07
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(ox - r * 0.2 * comp, olhoY - r * 0.2)
    c.quadraticCurveTo(ox, olhoY - r * 0.3, ox + r * 0.2 * comp, olhoY - r * 0.2)
    c.stroke()
    c.fillStyle = '#f4f1ec'
    c.beginPath()
    c.ellipse(ox, olhoY, r * 0.17 * comp, r * 0.085, 0, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#4a3020'
    c.beginPath()
    c.arc(ox + desl * 0.15, olhoY, r * 0.075, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#0b0705'
    c.beginPath()
    c.arc(ox + desl * 0.15, olhoY, r * 0.035, 0, Math.PI * 2)
    c.fill()
  }
  const nx = cx + desl * 1.5
  const ny = cy + a * 0.18
  c.strokeStyle = 'rgba(120,70,45,0.7)'
  c.lineWidth = r * 0.04
  c.beginPath()
  c.moveTo(nx - r * 0.02, olhoY + r * 0.1)
  c.quadraticCurveTo(nx + r * 0.08, ny - r * 0.05, nx + r * 0.02, ny)
  c.stroke()
  c.fillStyle = 'rgba(90,50,30,0.8)'
  for (const lado of [-1, 1]) {
    c.beginPath()
    c.ellipse(nx + lado * r * 0.09, ny + r * 0.02, r * 0.05, r * 0.03, 0, 0, Math.PI * 2)
    c.fill()
  }
  const my = cy + a * 0.45
  const mx = cx + desl * 1.2
  c.fillStyle = '#b5524a'
  c.beginPath()
  c.ellipse(mx, my, r * 0.3, r * 0.09, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

/** Um cenário (céu, chão, formas) com ou sem o rosto: as "fotos do evento". */
function desenharCena(c, L, A, semente, rosto) {
  let s = semente
  const u = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
  const g = c.createLinearGradient(0, 0, 0, A)
  g.addColorStop(0, `hsl(${200 + u() * 30} 45% ${62 + u() * 10}%)`)
  g.addColorStop(0.62, `hsl(${30 + u() * 20} 30% ${70 + u() * 8}%)`)
  g.addColorStop(1, `hsl(${90 + u() * 40} 25% ${35 + u() * 10}%)`)
  c.fillStyle = g
  c.fillRect(0, 0, L, A)
  for (let i = 0; i < 14; i++) {
    c.fillStyle = `hsl(${u() * 360} ${20 + u() * 40}% ${30 + u() * 40}%)`
    c.fillRect(u() * L, A * (0.45 + u() * 0.4), 40 + u() * 260, 30 + u() * 200)
  }
  if (rosto) desenharRosto(c, rosto)
}

/** RGBA → I420 (BT.601, faixa de TV). */
function i420(rgba, L, A) {
  const y = Buffer.alloc(L * A)
  const u = Buffer.alloc((L / 2) * (A / 2))
  const v = Buffer.alloc((L / 2) * (A / 2))
  for (let p = 0; p < L * A; p++) {
    const [R, G, B] = [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]]
    y[p] = Math.round(16 + 0.257 * R + 0.504 * G + 0.098 * B)
  }
  for (let j = 0; j < A / 2; j++) {
    for (let i = 0; i < L / 2; i++) {
      let R = 0
      let G = 0
      let B = 0
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const p = (j * 2 + dy) * L + i * 2 + dx
        R += rgba[p * 4] / 4
        G += rgba[p * 4 + 1] / 4
        B += rgba[p * 4 + 2] / 4
      }
      u[j * (L / 2) + i] = Math.round(128 - 0.148 * R - 0.291 * G + 0.439 * B)
      v[j * (L / 2) + i] = Math.round(128 + 0.439 * R - 0.368 * G - 0.071 * B)
    }
  }
  return Buffer.concat([y, u, v])
}

let pg, dono, servidor, base, pasta, saida, telas, navegador, cameraNav, planoNav, videos, dados, textura

async function subirApp(urlFoto) {
  process.env.FOTO_LOCAL = '1'
  for (const v of ['ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'FOTO_S3_ENDPOINT', 'VERCEL']) delete process.env[v]
  process.env.FOTO_DATABASE_URL = urlFoto
  pasta = mkdtempSync(join(tmpdir(), 'foto-arquivos-tela-'))
  process.env.FOTO_ARQUIVOS_DIR = pasta
  saida = mkdtempSync(join(tmpdir(), 'foto-tela-evento-'))
  const { publicar } = await import('../publicar.mjs')
  await publicar({ saida, baixarModelos: false })
  const { servir } = await import('../scripts/servir.mjs')
  servidor = await servir({ porta: 0, publico: saida })
  base = `http://127.0.0.1:${servidor.address().port}`
}

/** No navegador do fotógrafo (modo local, pelo gate): fabrica as fotos, prepara pelo preparo.js e publica os dois eventos. */
async function prepararEventos(pagina) {
  const codigo = `(async () => {
    ${desenharRosto.toString()}
    ${desenharCena.toString()}
    const { api, criarPreparo, guardarRostos } = await import('/app/rosto/preparo.js')
    const L = 2400, A = 1600
    // 8 fotos: a pessoa em 5 (tamanhos e lugares diferentes, uma gravada deitada com EXIF 6), 3 só cenário
    const plano = [
      { rosto: { cx: 900, cy: 700, largura: 300, giro: 0.05 } },
      { rosto: { cx: 1500, cy: 650, largura: 220, giro: -0.1 } },
      { rosto: null },
      { rosto: { cx: 700, cy: 820, largura: 160, giro: 0.15 }, deitada: true },
      { rosto: null },
      { rosto: { cx: 1800, cy: 760, largura: 120, giro: 0 } },
      { rosto: null },
      { rosto: { cx: 1200, cy: 640, largura: 260, giro: -0.05 } },
    ]
    const blobs = {}
    for (let i = 0; i < plano.length; i++) {
      const t = new OffscreenCanvas(L, A)
      desenharCena(t.getContext('2d'), L, A, 1000 + i * 7919, plano[i].rosto)
      let fonte = t, orientacao = 1
      if (plano[i].deitada) {
        // gravada deitada (90° anti-horário), como a prévia embutida de um RAW em pé: o EXIF 6 manda girar
        const d = new OffscreenCanvas(A, L)
        const c = d.getContext('2d')
        c.translate(0, L)
        c.rotate(-Math.PI / 2)
        c.drawImage(t, 0, 0)
        fonte = d
        orientacao = 6
      }
      blobs['foto-' + i] = { blob: await fonte.convertToBlob({ type: 'image/jpeg', quality: 0.9 }), orientacao, doNavegador: false }
    }
    const ids = Object.keys(blobs)
    const loja = {
      catalogo: { foto: (id) => ({ id, nome: id.toUpperCase() + '.ARW' }) },
      miniaturas: { grande: async (id) => blobs[id] },
    }
    const saida = {}
    const fichas = {
      aberta: { nome: 'Corrida da Serra', modo: 'aberta', prazoDias: 14, aviso: 'ativacao-aberta-2026-11-13' },
      consentimento: { nome: 'Casamento Lia e Rui', modo: 'consentimento', prazoDias: 14, aviso: 'ativacao-consentimento-2026-11-13' },
      criancas: { nome: 'Festa da Escola', criancas: true, prazoDias: 7, aviso: 'ativacao-criancas-2026-11-14' },
    }
    for (const modo of Object.keys(fichas)) {
      const { evento } = await api('POST', '', { data: '2026-11-20', ...fichas[modo] })
      const t0 = performance.now()
      const p = criarPreparo({ loja, evento, ids, marca: 'Prova' })
      await p.comecar()
      const est = p.estado()
      const ms = performance.now() - t0
      const pub = await api('POST', '/' + evento.id + '/publicar', {})
      const { fotos } = await api('GET', '/' + evento.id)
      saida[modo] = { id: evento.id, endereco: pub.endereco, estado: est, ms, fotos: fotos.map((f) => ({ id: f.id, fotoId: f.fotoId, rostos: f.rostos })) }
    }
    saida.comRosto = plano.map((p, i) => (p.rosto ? 'foto-' + i : null)).filter(Boolean)
    return saida
  })()`
  return pagina.evaluate(codigo)
}

/** A textura do rosto (o mesmo desenho das fotos do evento, de frente), RGBA 512 × 512, 120 px por distância entre olhos. */
async function fabricarTextura(pagina) {
  const b64 = await pagina.evaluate(`(async () => {
    ${desenharRosto.toString()}
    const t = new OffscreenCanvas(512, 512)
    desenharRosto(t.getContext('2d'), { cx: 256, cy: 256, largura: 300, giro: 0 })
    const d = t.getContext('2d').getImageData(0, 0, 512, 512).data
    let s = ''
    for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, i + 8192))
    return btoa(s)
  })()`)
  return { largura: 512, altura: 512, dados: Buffer.from(b64, 'base64'), escala: 120, cx: 256, cy: 256 }
}

const GRAU = Math.PI / 180
const fundo = (x, y) => {
  const k = (x + y) / 1120
  return [141 - 48 * k, 154 - 50 * k, 163 - 51 * k]
}

/**
 * O laço do vídeo, a 15 quadros por segundo: de frente; vira para a esquerda (da pessoa) e volta; de frente; para a
 * direita e volta; de frente; chega perto e volta. Qualquer ordem sorteada cabe em até 3 voltas (~19 s, dentro dos 30).
 */
function laco({ giro = 28, perto = 2.4 } = {}) {
  const poses = []
  const parado = (n, pose) => {
    for (let i = 0; i < n; i++) poses.push(pose)
  }
  const ida = (n, alvo) => {
    for (let i = 1; i <= n; i++) poses.push(Object.fromEntries(Object.entries(alvo).map(([k, v]) => [k, (v * i) / n])))
  }
  const volta = (n, alvo) => {
    for (let i = n - 1; i >= 0; i--) poses.push(Object.fromEntries(Object.entries(alvo).map(([k, v]) => [k, (v * i) / n])))
  }
  parado(15, {})
  for (const alvo of [{ guinada: giro * GRAU }, { guinada: -giro * GRAU }, { z: perto }]) {
    ida(5, alvo)
    parado(11, alvo)
    volta(5, alvo)
    parado(5, {})
  }
  return poses
}

/** Um vídeo .y4m (640 × 480, I420, 15 qps) da cabeça 3D ou do mesmo rosto num plano. Quadros iguais são renderizados uma vez. */
function fabricarVideo(nome, { plano = false, giro, perto }) {
  const cache = new Map()
  const partes = [Buffer.from('YUV4MPEG2 W640 H480 F15:1 Ip A1:1 C420jpeg\n')]
  for (const pose of laco({ giro, perto })) {
    const k = JSON.stringify(pose)
    if (!cache.has(k)) cache.set(k, i420(renderizar({ textura, pose, plano, fundo }), 640, 480))
    partes.push(Buffer.from('FRAME\n'), cache.get(k))
  }
  const arquivo = join(saida, `${nome}.y4m`)
  writeFileSync(arquivo, Buffer.concat(partes))
  return arquivo
}

before(async () => {
  if (pular) return
  telas = pastaDasTelas()
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(
    `create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`,
  )
  await admin.end()
  const urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  await (await import('../scripts/migrar.mjs')).migrar(urlFoto)
  dono = postgres(urlFoto, { max: 2, onnotice: () => {} })
  await subirApp(urlFoto)
  navegador = await playwright.chromium.launch()
  const fot = await navegador.newPage()
  await fot.goto(`${base}/`)
  dados = await prepararEventos(fot)
  textura = await fabricarTextura(fot)
  // a cabeça gira 28° e chega 2,4 distâncias entre os olhos mais perto; o plano gira 40° (a foto que quem ataca vira)
  videos = { cabeca: fabricarVideo('cabeca', {}), plano: fabricarVideo('plano', { plano: true, giro: 40 }) }
  dados.fotografo = fot
  const camera = (arquivo) =>
    playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${arquivo}`] })
  cameraNav = await camera(videos.cabeca)
  planoNav = await camera(videos.plano)
})
after(async () => {
  await cameraNav?.close()
  await planoNav?.close()
  await navegador?.close()
  if (servidor) await new Promise((ok) => servidor.close(ok))
  await dono?.end({ timeout: 5 })
  await (await import('../api/_banco.js')).fecharBanco()
  await pg?.fechar()
  for (const p of [pasta, saida]) if (p) rmSync(p, { recursive: true, force: true })
  for (const v of ['FOTO_LOCAL', 'FOTO_DATABASE_URL', 'FOTO_ARQUIVOS_DIR']) delete process.env[v]
})

test('Chromium, Postgres e os modelos de rosto são exigidos no CI', { skip: !EXIGIR }, () => {
  assert.equal(pular, false, pular || '')
})

/** Um visitante com câmera falsa: contexto novo (sem cache), na largura pedida e no tema pedido. */
async function visitante({ largura = 390, altura = 844, tema = 'claro', nav = cameraNav } = {}) {
  // cada visitante é um aparelho novo (contexto novo, cookie novo); os limites zeram para não somar entre os testes
  await dono`delete from foto.limites`
  const ctx = await nav.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 2, permissions: ['camera'] })
  if (tema === 'escuro') await ctx.addCookies([{ name: 'foto_tema', value: 'escuro', url: base }])
  const pagina = await ctx.newPage()
  const olho = vigiar(pagina, base)
  // tudo o que a página manda: corpo e tipo
  const enviados = []
  pagina.on('request', (r) => {
    if (r.method() !== 'GET') enviados.push({ url: new URL(r.url()).pathname, corpo: r.postData() ?? '', tipo: r.headers()['content-type'] ?? '' })
  })
  return { ctx, pagina, olho, enviados }
}
/** A captura, depois de a entrada da tela assentar (as animações duram até ~0,9 s). */
async function tirar(pagina, nome) {
  await pagina.waitForTimeout(950)
  await pagina.screenshot({ path: join(telas, `evento-${nome}.png`), fullPage: false })
}
const semProblemas = (olho, rotulo) => {
  assert.deepEqual(olho.erros, [], `${rotulo}: erros`)
  assert.deepEqual(olho.fora, [], `${rotulo}: pedidos para fora`)
  assert.deepEqual(
    olho.falhas.filter((f) => !/ERR_ABORTED/.test(f)),
    [],
    `${rotulo}: falhas`,
  )
}
/**
 * O que saiu pela rede é JSON, sem imagem, e os vetores são base64 de 128 bytes. A prova leva também os 5 pontos do
 * detector quadro a quadro, o tempo, o moiré e o brilho: só números, nenhum pixel.
 */
function soVetores(enviados) {
  assert.ok(enviados.length > 0)
  for (const e of enviados) {
    assert.match(e.tipo, /^application\/json/, e.url)
    assert.ok(e.corpo.length < (e.url === '/api/evento/prova' ? 65536 : 2000), `${e.url}: ${e.corpo.length} bytes`)
    assert.ok(!/data:image|base64,|\/9j\//.test(e.corpo), `${e.url}: imagem?`)
    const j = JSON.parse(e.corpo)
    const permitidas = new Set(['token', 'contar', 'versao', 'vetores', 'chave', 'tipo', 'pin', 'nome', 'contato', 'fotos', 'prova', 'lembranca', 'desafio', 'quadros', 'para'])
    for (const k of Object.keys(j)) assert.ok(permitidas.has(k), `${e.url}: campo ${k}`)
    for (const q of j.quadros ?? []) {
      assert.deepEqual(Object.keys(q).filter((k) => !['t', 'p', 'm', 'l'].includes(k)), [], 'quadro: só tempo, pontos, moiré e brilho')
      assert.ok(q.p.length === 5 && q.p.flat().every(Number.isFinite))
    }
    for (const v of j.vetores ?? []) {
      assert.equal(v.length, 172)
      assert.equal(Buffer.from(v, 'base64').length, 128)
    }
  }
}

/** Do consentimento até a câmera achar: marca a caixa, permite e espera os resultados (ou o pedido feito). */
async function buscarPeloRosto(pagina, { titulo = /Achar suas fotos pelo rosto\?/ } = {}) {
  await pagina.getByRole('heading', { name: titulo }).waitFor()
  const permitir = pagina.getByRole('button', { name: /Permitir|Continuar/ })
  assert.equal(await permitir.isDisabled(), true, 'sem a caixa marcada não permite')
  await pagina.getByRole('checkbox').check()
  await permitir.click()
  await pagina.locator('.camera').waitFor()
}

test('busca aberta no celular: consentimento, câmera ao vivo, "É você", pedir; só o vetor sai', { skip: pular, timeout: 240_000 }, async () => {
  const { ctx, pagina, olho, enviados } = await visitante()
  const t0 = Date.now()
  await pagina.goto(dados.aberta.endereco.replace(/^https?:\/\/[^/]+/, base))
  const html = await pagina.content()
  assert.ok(!html.includes(NOME), 'sem o nome do produto')
  await pagina.getByRole('heading', { name: /Achar suas fotos pelo rosto\?/ }).waitFor()
  await tirar(pagina, 'consentimento-390-claro')
  await buscarPeloRosto(pagina)
  // o download aparece uma vez; depois a câmera com o oval e a dica
  await pagina.locator('.oval').waitFor({ timeout: 60_000 })
  const tPronto = Date.now()
  await pagina.waitForTimeout(400)
  await tirar(pagina, 'camera-390-claro')
  await pagina.getByRole('heading', { name: /Suas/ }).waitFor({ timeout: 90_000 })
  const tAchou = Date.now()
  const eu = await pagina.locator('section[aria-label="É você"] .foto').count()
  const comRosto = dados.aberta.fotos.filter((f) => f.rostos > 0)
  assert.equal(comRosto.length, 5, JSON.stringify(dados.aberta.fotos))
  assert.ok(eu >= 4, `É você: ${eu}`)
  const total = eu + (await pagina.locator('details.secao .foto').count())
  assert.equal(total, 5, 'as 5 fotos com a pessoa; nenhuma só de cenário')
  await pagina.waitForFunction(() => [...document.querySelectorAll('.foto img')].every((i) => i.complete && i.naturalWidth > 0))
  await tirar(pagina, 'resultado-390-claro')
  // favoritar duas e pedir
  const coracoes = pagina.locator('section[aria-label="É você"] .coracao')
  await coracoes.nth(0).click()
  await coracoes.nth(1).click()
  await pagina.getByRole('button', { name: 'Pedir' }).click()
  await pagina.getByPlaceholder('Seu nome').fill('Ana Souza')
  await pagina.getByPlaceholder('WhatsApp ou e-mail').fill('ana@exemplo.com')
  await tirar(pagina, 'pedido-390-claro')
  await pagina.getByRole('button', { name: 'Enviar pedido' }).click()
  await pagina.getByText('Pedido de 2 fotos enviado.').waitFor()
  const [p] = await dono`select nome, contato, cardinality(fotos) as n from foto.evento_pedidos where evento = ${dados.aberta.id}`
  assert.deepEqual({ ...p }, { nome: 'Ana Souza', contato: 'ana@exemplo.com', n: 2 })
  // a foto grande
  await pagina.locator('section[aria-label="É você"] .foto-abrir').first().click()
  await pagina.locator('.ver img').waitFor()
  await pagina.waitForFunction(() => document.querySelector('.ver img')?.complete)
  await tirar(pagina, 'foto-390-claro')
  await pagina.keyboard.press('Escape')
  soVetores(enviados)
  const achar = enviados.filter((e) => e.url === '/api/evento/achar')
  assert.equal(achar.length, 1)
  assert.ok(JSON.parse(achar[0].corpo).vetores.length >= 2, 'dois ou três quadros')
  semProblemas(olho, 'aberta')
  // o que medimos (vai para o relatório): do link ao leitor pronto e à resposta
  console.log(
    `# medida: leitor pronto em ${tPronto - t0} ms; achou em ${tAchou - tPronto} ms depois da câmera; fotógrafo: ${Math.round(dados.aberta.ms / 8)} ms por foto (8 fotos, ${dados.aberta.estado.rostos} rostos)`,
  )
  await ctx.close()
})

test('com consentimento: pedido feito, o computador do fotógrafo compara, a pessoa volta e vê as fotos', { skip: pular, timeout: 240_000 }, async () => {
  const { ctx, pagina, olho, enviados } = await visitante()
  const endereco = dados.consentimento.endereco.replace(/^https?:\/\/[^/]+/, base)
  await pagina.goto(endereco)
  await buscarPeloRosto(pagina)
  await pagina.getByRole('heading', { name: /Pedido feito/ }).waitFor({ timeout: 120_000 })
  await tirar(pagina, 'aguardando-390-claro')
  // nenhum vetor das fotos foi para o servidor; só o de quem pediu
  assert.equal((await dono`select count(*)::int as n from foto.evento_rostos where evento = ${dados.consentimento.id}`)[0].n, 0)
  assert.equal((await dono`select count(*)::int as n from foto.evento_pessoas where evento = ${dados.consentimento.id}`)[0].n, 1)
  // o fotógrafo: compara aqui, sobe só as ligações
  const r = await dados.fotografo.evaluate(`(async () => {
    const { processarPedidos } = await import('/app/rosto/preparo.js')
    const { evento } = await (await fetch('/api/foto/eventos/${dados.consentimento.id}', { credentials: 'same-origin' })).json()
    return processarPedidos(evento)
  })()`)
  assert.equal(r.pessoas, 1)
  assert.ok(r.ligacoes >= 4, JSON.stringify(r))
  assert.equal(r.faltam, 0)
  // a pessoa volta pelo mesmo link (recarrega): as fotos estão lá
  await pagina.reload()
  await pagina.getByRole('heading', { name: /Suas/ }).waitFor({ timeout: 30_000 })
  assert.ok((await pagina.locator('.foto').count()) >= 4)
  await pagina.waitForFunction(() => [...document.querySelectorAll('.foto img')].every((i) => i.complete && i.naturalWidth > 0))
  await tirar(pagina, 'voltou-390-claro')
  // lembrar neste celular e esquecer
  await pagina.getByRole('switch').check()
  await pagina.getByRole('button', { name: 'Esquecer' }).click()
  await pagina.getByRole('heading', { name: /Esquecido/ }).waitFor()
  soVetores(enviados)
  assert.ok(enviados.some((e) => e.url === '/api/evento/cadastrar'))
  semProblemas(olho, 'consentimento')
  await ctx.close()
})

test('escuro e computador: consentimento, câmera e resultados em 1440 px; "não quero aparecer"', { skip: pular, timeout: 300_000 }, async () => {
  const endereco = dados.aberta.endereco.replace(/^https?:\/\/[^/]+/, base)
  for (const [largura, altura, tema] of [
    [390, 844, 'escuro'],
    [1440, 900, 'claro'],
    [1440, 900, 'escuro'],
  ]) {
    const { ctx, pagina, olho, enviados } = await visitante({ largura, altura, tema })
    await pagina.goto(endereco)
    await pagina.getByRole('heading', { name: /Achar suas fotos pelo rosto\?/ }).waitFor()
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), tema)
    await tirar(pagina, `consentimento-${largura}-${tema}`)
    await buscarPeloRosto(pagina)
    await pagina.locator('.oval').waitFor({ timeout: 60_000 })
    await pagina.waitForTimeout(300)
    await tirar(pagina, `camera-${largura}-${tema}`)
    await pagina.getByRole('heading', { name: /Suas/ }).waitFor({ timeout: 90_000 })
    await pagina.waitForFunction(() => [...document.querySelectorAll('.foto img')].every((i) => i.complete && i.naturalWidth > 0))
    await tirar(pagina, `resultado-${largura}-${tema}`)
    // sem rolagem de lado
    assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    soVetores(enviados)
    semProblemas(olho, `${largura} ${tema}`)
    await ctx.close()
  }
  // "não quero aparecer": confere, tira da busca; depois disso a busca não acha mais
  const { ctx, pagina, olho, enviados } = await visitante({ tema: 'claro' })
  await pagina.goto(endereco)
  await pagina.getByRole('button', { name: 'Não quero aparecer' }).click()
  await tirar(pagina, 'remocao-390-claro')
  await buscarPeloRosto(pagina, { titulo: /Não quer aparecer na busca\?/ })
  await pagina.getByRole('button', { name: 'Tirar da busca' }).waitFor({ timeout: 90_000 })
  await pagina.waitForFunction(() => [...document.querySelectorAll('.foto img')].every((i) => i.complete && i.naturalWidth > 0))
  await tirar(pagina, 'conferir-390-claro')
  await pagina.getByRole('button', { name: 'Tirar da busca' }).click()
  await pagina.getByRole('heading', { name: /saíram da busca|saiu da busca/ }).waitFor()
  assert.equal((await dono`select count(*)::int as n from foto.evento_rostos where evento = ${dados.aberta.id}`)[0].n, 0)
  soVetores(enviados)
  semProblemas(olho, 'remoção')
  await ctx.close()
})

/** Pede ao worker do rosto (o mesmo da página do visitante) a análise de um quadro RGBA 640 × 480. */
async function analisar(pagina, rgba) {
  const b64 = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength).toString('base64')
  return pagina.evaluate(`(async () => {
    if (!window.__rosto) {
      const w = new Worker('/app/rosto/worker.js', { type: 'module' })
      let seq = 0
      const pend = new Map()
      w.onmessage = (e) => {
        const p = pend.get(e.data.id)
        if (!p || e.data.progresso !== undefined) return
        pend.delete(e.data.id)
        e.data.ok ? p.ok(e.data.resultado) : p.falha(new Error(e.data.erro.mensagem))
      }
      window.__rosto = (tipo, dados, tr = []) => new Promise((ok, falha) => { const id = ++seq; pend.set(id, { ok, falha }); w.postMessage({ id, tipo, dados }, tr) })
      await window.__rosto('preparar', {})
    }
    const s = atob('${b64}')
    const a = new Uint8ClampedArray(s.length)
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i)
    const bmp = await createImageBitmap(new ImageData(a, 640, 480))
    const r = await window.__rosto('quadro', { bitmap: bmp, querer: ['frente'] }, [bmp])
    return { pontos: r.pontos, m: r.tela?.m ?? null }
  })()`)
}

test('planaridade e guinada com o YuNet de verdade: a cabeça 3D girando passa; o mesmo rosto num plano não chega ao giro', { skip: pular, timeout: 240_000 }, async () => {
  const pagina = dados.fotografo
  const medir = async (plano, poses) => {
    const ref = (await analisar(pagina, renderizar({ textura, pose: {}, plano, fundo }))).pontos
    const saida = []
    for (const [nome, pose] of poses) {
      const a = await analisar(pagina, renderizar({ textura, pose, plano, fundo }))
      if (!a.pontos) continue
      saida.push({ nome, g: guinadaNaImagem(a.pontos), par: paralaxe(ref, a.pontos), forma: formaDe(ref, a.pontos), m: a.m, dio: dioDe(a.pontos) / dioDe(ref) })
    }
    return saida
  }
  const giros = []
  for (const g of [15, 20, 25, 30, 40]) giros.push([`e${g}`, { guinada: g * GRAU }], [`d${g}`, { guinada: -g * GRAU }])
  const cabeca = await medir(false, giros)
  const planos = []
  for (const g of [10, 20, 30, 40, 50, 60, 70]) planos.push([`e${g}`, { guinada: g * GRAU }], [`d${g}`, { guinada: -g * GRAU }])
  for (const a of [20, 35]) for (const g of [30, 50]) planos.push([`a${a}e${g}`, { guinada: g * GRAU, arfagem: a * GRAU }], [`a${a}d${g}`, { guinada: -g * GRAU, arfagem: -a * GRAU }])
  const plano = await medir(true, planos)
  const perto = await medir(false, [['perto', { z: 2.4 }]])
  const linha = (xs) => xs.map((x) => `${x.nome} g ${x.g.toFixed(2)} par ${x.par.toFixed(2)} forma ${x.forma.toFixed(2)} m ${x.m}`).join('; ')
  console.log(`# medida (YuNet): cabeça ${linha(cabeca)}`)
  console.log(`# medida (YuNet): plano ${linha(plano)}`)
  console.log(`# medida (YuNet): perto ${perto[0].dio.toFixed(2)}× a distância entre os olhos`)
  assert.equal(cabeca.length, giros.length, 'o detector acha a cabeça em todos os giros')
  // a cabeça girando 15° ou mais: virou para o lado pedido, com profundidade
  for (const x of cabeca) {
    const lado = x.nome[0] === 'e' ? 1 : -1
    assert.ok(lado * x.g >= VIDA.giro, `cabeça ${x.nome}: guinada ${x.g}`)
    assert.ok(x.par >= VIDA.paralaxe, `cabeça ${x.nome}: paralaxe ${x.par}`)
  }
  // o plano girado ou inclinado: nenhum quadro conta como giro (a guinada não chega, ou a forma é de cartão deitado)
  for (const x of plano) assert.ok(Math.abs(x.g) < VIDA.giro || x.forma < VIDA.forma[0] || x.forma > VIDA.forma[1], `plano ${x.nome}: ${JSON.stringify(x)}`)
  assert.ok(perto[0].dio >= VIDA.perto, 'chegar perto cresce o rosto o bastante')
})

/** Abre o pedido, marca a caixa e permite; espera a câmera. */
async function abrirCamera(pagina, endereco) {
  await pagina.goto(endereco)
  await buscarPeloRosto(pagina)
}
const enderecoDe = (modo) => dados[modo].endereco.replace(/^https?:\/\/[^/]+/, base)

test('desafio de vida: a câmera pede os passos sorteados (claro e escuro); o mesmo rosto num plano não passa e nada é buscado', { skip: pular, timeout: 300_000 }, async () => {
  for (const tema of ['claro', 'escuro']) {
    const { ctx, pagina, olho } = await visitante({ tema })
    await abrirCamera(pagina, enderecoDe('aberta'))
    await pagina.locator('.oval').waitFor({ timeout: 60_000 })
    // a instrução do desafio aparece (com a seta), não só "olhe para a câmera"
    await pagina.locator('.dica[data-passo="esquerda"], .dica[data-passo="direita"], .dica[data-passo="perto"]').waitFor({ timeout: 30_000 })
    await pagina.locator('.seta').waitFor({ timeout: 10_000 })
    assert.match(await pagina.locator('.dica').textContent(), /Vire para a sua (esquerda|direita)|Chegue mais perto/)
    await pagina.waitForTimeout(500)
    await pagina.screenshot({ path: join(telas, `evento2-desafio-390-${tema}.png`) })
    semProblemas(olho, `desafio ${tema}`)
    await ctx.close()
  }
  // o mesmo rosto numa foto (plano) que gira e chega perto: o desafio não se cumpre no prazo; nada é buscado
  const { ctx, pagina, olho, enviados } = await visitante({ nav: planoNav })
  await abrirCamera(pagina, enderecoDe('aberta'))
  await pagina.getByRole('heading', { name: /tempo acabou|confirmar/ }).waitFor({ timeout: 70_000 })
  await tirar(pagina, 'vida-plano-390-claro')
  await pagina.screenshot({ path: join(telas, 'evento2-vida-plano-390-claro.png') })
  assert.ok(enviados.some((e) => e.url === '/api/evento/desafio'))
  assert.ok(!enviados.some((e) => ['/api/evento/achar', '/api/evento/prova'].includes(e.url)), 'nada foi comparado')
  semProblemas(olho, 'plano')
  // "Tentar de novo" volta à câmera com outro desafio
  await pagina.getByRole('button', { name: 'Tentar de novo' }).click()
  await pagina.locator('.camera').waitFor()
  await ctx.close()
})

test('limite: "Muitas buscas deste aparelho." (claro e escuro), curto e com a saída de volta', { skip: pular, timeout: 180_000 }, async () => {
  const { REGRAS_EVENTO } = await import('../api/_evento.js')
  const antes = REGRAS_EVENTO.desafioAparelho.max
  try {
    for (const tema of ['claro', 'escuro']) {
      const { ctx, pagina, olho } = await visitante({ tema })
      REGRAS_EVENTO.desafioAparelho.max = 0
      await abrirCamera(pagina, enderecoDe('aberta'))
      await pagina.getByRole('heading', { name: /Muitas buscas deste aparelho/ }).waitFor({ timeout: 60_000 })
      assert.match(await pagina.locator('.apoio').first().textContent(), /Tente em alguns minutos\./)
      await tirar(pagina, `limite-390-${tema}`)
      await pagina.screenshot({ path: join(telas, `evento2-limite-390-${tema}.png`) })
      REGRAS_EVENTO.desafioAparelho.max = antes
      // o 429 aparece no console do navegador (é o servidor dizendo não); o resto, limpo
      olho.erros = olho.erros.filter((e) => !/status of 429/.test(e))
      semProblemas(olho, `limite ${tema}`)
      await pagina.getByRole('button', { name: 'Voltar' }).click()
      await pagina.getByRole('heading', { name: /Achar suas fotos pelo rosto\?/ }).waitFor()
      await ctx.close()
    }
  } finally {
    REGRAS_EVENTO.desafioAparelho.max = antes
  }
})

test('evento com crianças: a caixa do responsável, destacada e obrigatória; o pedido grava o texto dos responsáveis', { skip: pular, timeout: 240_000 }, async () => {
  for (const tema of ['claro', 'escuro']) {
    const { ctx, pagina, olho, enviados } = await visitante({ tema })
    await pagina.goto(enderecoDe('criancas'))
    await pagina.getByRole('heading', { name: /Achar as fotos pelo rosto\?/ }).waitFor()
    assert.equal(await pagina.locator('.ficha-criancas').textContent(), 'Evento com crianças')
    const caixa = pagina.locator('.caixa--destaque')
    assert.match(await caixa.textContent(), /Sou responsável por quem aparece na selfie\./)
    assert.doesNotMatch(await caixa.textContent(), /18 anos/)
    assert.equal(await pagina.getByRole('button', { name: 'Permitir' }).isDisabled(), true)
    await tirar(pagina, `criancas-390-${tema}`)
    await pagina.screenshot({ path: join(telas, `evento2-criancas-390-${tema}.png`) })
    if (tema === 'claro') {
      await buscarPeloRosto(pagina, { titulo: /Achar as fotos pelo rosto\?/ })
      await pagina.getByRole('heading', { name: /Pedido feito/ }).waitFor({ timeout: 120_000 })
      const cad = enviados.find((e) => e.url === '/api/evento/cadastrar')
      assert.equal(JSON.parse(cad.corpo).versao, 'cadastro-criancas-2026-11-14')
      const [r] = await dono`select versao from foto.evento_consentimentos where evento = ${dados.criancas.id} and tipo = 'cadastro'`
      assert.equal(r.versao, 'cadastro-criancas-2026-11-14')
      soVetores(enviados)
    }
    semProblemas(olho, `crianças ${tema}`)
    await ctx.close()
  }
})

test('o painel do fotógrafo: lista os eventos, abre um, publica outro e mostra o endereço com o QR', { skip: pular, timeout: 120_000 }, async () => {
  const pagina = dados.fotografo
  await pagina.setViewportSize({ width: 1440, height: 900 })
  const olho = vigiar(pagina, base)
  // a tela Entregar encaixa o painel; aqui ele é montado sozinho, por cima da casca
  await pagina.evaluate(`(async () => {
    const { render } = await import('/vendor/preact/preact.mjs')
    const { html } = await import('/app/preact.js')
    const { loja } = await import('/app/estado.js')
    const { PainelEvento } = await import('/app/rosto/painel.js')
    const caixa = document.createElement('div')
    caixa.id = 'painel-teste'
    caixa.style.cssText = 'position:fixed;inset:0;z-index:999;overflow:auto;padding:48px;background:var(--fundo)'
    document.body.append(caixa)
    render(html\`<\${PainelEvento} loja=\${loja} />\`, caixa)
  })()`)
  await pagina.getByRole('button', { name: /Corrida da Serra/ }).waitFor()
  assert.equal(await pagina.locator('.rosto-item').count(), 3)
  assert.equal(await pagina.locator('.rosto-item .ficha--forte').count(), 1, 'o evento com crianças aparece marcado')
  await tirar(pagina, 'painel-1440-claro')
  // o evento com crianças: uma linha no detalhe
  await pagina.getByRole('button', { name: /Festa da Escola/ }).click()
  await pagina.locator('.rosto-criancas').waitFor()
  assert.match(await pagina.locator('.rosto-criancas').textContent(), /Com crianças: só um responsável pede a busca\. As assinaturas somem em/)
  await tirar(pagina, 'painel-criancas-1440-claro')
  await pagina.screenshot({ path: join(telas, 'evento2-painel-criancas-1440-claro.png') })
  await pagina.getByRole('button', { name: 'Eventos' }).click()
  await pagina.getByRole('button', { name: /Casamento Lia e Rui/ }).click()
  await pagina.locator('.rosto-numeros').waitFor()
  await pagina.locator('.rosto-fila').waitFor({ timeout: 30_000 })
  await tirar(pagina, 'painel-detalhe-1440-claro')
  // trocar o link: o endereço aparece uma vez, com o QR
  await pagina.getByRole('button', { name: 'Trocar link' }).click()
  await pagina.locator('.rosto-qr svg').waitFor()
  assert.match(await pagina.locator('.rosto-url').textContent(), /\/e\/[A-Za-z0-9_-]{43}$/)
  await tirar(pagina, 'painel-endereco-1440-claro')
  // o cartaz A4 sai no aparelho
  const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Cartaz A4' }).click()])
  assert.match(baixado.suggestedFilename(), /^cartaz-.*\.png$/)
  const png = readFileSync(await baixado.path())
  assert.equal(png.readUInt32BE(16), 1240)
  assert.equal(png.readUInt32BE(20), 1754)
  writeFileSync(join(telas, 'evento-cartaz.png'), png)
  assert.deepEqual(olho.erros, [])
  assert.deepEqual(olho.fora, [])
})

test('link morto: a página neutra, sem nada do evento', { skip: pular }, async () => {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } })
  const pagina = await ctx.newPage()
  const r = await pagina.goto(`${base}/e/${'A'.repeat(43)}`)
  assert.equal(r.status(), 404)
  assert.equal(await r.text(), readFileSync(join(RAIZ, 'app/indisponivel.html'), 'utf8'))
  await ctx.close()
})
