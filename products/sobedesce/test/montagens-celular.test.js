// Montagens no celular (web/public/app/lib/montagens-celular.js): o desenho é o do computador (lib/montagens.js é
// cópia idêntica de public/lib/montagens.js) e aqui ficam as contas do iPhone: cada parte do carrossel e da grade é
// desenhada sozinha (o Safari recusa canvas acima de 16,7 milhões de pixels), a foto abre só no tamanho que o quadro
// precisa, o vídeo tem no máximo 1920 px e o take anda (ou volta) no tempo certo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const C = await import('../web/public/app/lib/montagens-celular.js')
const M = await import('../web/public/app/lib/montagens.js')
const SAFARI_MAX_PIXELS = 16_777_216

test('celular: lib/montagens.js é cópia idêntica da do computador, e a ponte frames-posts aponta para os posts', async () => {
  const ler = (p) => fs.readFile(new URL(p, import.meta.url), 'utf8')
  assert.equal(await ler('../web/public/app/lib/montagens.js'), await ler('../public/lib/montagens.js'), 'web/public/app/lib/montagens.js difere de public/lib/montagens.js')
  const ponte = await import('../web/public/app/lib/frames-posts.js')
  const posts = await import('../web/public/app/lib/frames/posts.js')
  assert.deepEqual(Object.keys(ponte).sort(), Object.keys(posts).sort())
  assert.equal(ponte.cobrir, posts.cobrir)
})

test('partes: nome e ordem de postar no post, no carrossel e na grade', () => {
  const post = C.partesDe(M.telaDe({ tipo: 'post', formato: '4x5' }), 'Viagem: Chapada/2')
  assert.deepEqual(post.map((p) => p.nome), ['Viagem Chapada 2_4x5.jpg'])
  const car = C.partesDe(M.telaDe({ tipo: 'carrossel', formato: '4x5', slides: 3 }), 'Viagem')
  assert.deepEqual(car.map((p) => p.nome), ['Viagem_4x5_01.jpg', 'Viagem_4x5_02.jpg', 'Viagem_4x5_03.jpg'])
  // o carrossel vai da esquerda para a direita, sem buraco nem sobra
  assert.deepEqual(car.map((p) => p.fatia.x), [0, 1080, 2160])
  const grade = C.partesDe(M.telaDe({ tipo: 'grade', linhas: 2, quadrado: '3x4' }), 'Perfil')
  assert.equal(grade.length, 6)
  // o 01 (primeiro a postar) é o de baixo, à direita; o último é o de cima, à esquerda
  assert.deepEqual([grade[0].fatia.x, grade[0].fatia.y], [2160, 1440])
  assert.deepEqual([grade[5].fatia.x, grade[5].fatia.y], [0, 0])
  assert.ok(grade.every((p) => p.fatia.w === 1080 && p.fatia.h === 1440))
  assert.equal(C.nomeDoArquivo('', '1x1', 'jpg'), 'Montagem_1x1.jpg')
})

/** Um canvas de mentira que guarda onde cada coisa foi desenhada, já com o deslocamento do pincel. */
function canvasFalso() {
  const c = { width: 0, height: 0, desenhos: [], fundos: [], tamanhos: [] }
  let tx = 0
  let ty = 0
  const pilha = []
  const ctx = {
    imageSmoothingQuality: 'low',
    fillStyle: '#000',
    setTransform: (a, b, cc, d, e, f) => ((tx = e), (ty = f)),
    save: () => pilha.push([tx, ty]),
    restore: () => ([tx, ty] = pilha.pop() || [0, 0]),
    fillRect: (x, y, w, h) => c.fundos.push([x + tx, y + ty, w, h, ctx.fillStyle]),
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    arcTo: () => {},
    closePath: () => {},
    clip: () => {},
    stroke: () => {},
    drawImage: (img, sx, sy, sw, sh, x, y, w, h) => c.desenhos.push({ img: img.id, s: [sx, sy, sw, sh], d: [x + tx, y + ty, w, h] }),
  }
  c.getContext = () => ctx
  return new Proxy(c, {
    set(o, k, v) {
      if (k === 'width' || k === 'height') o.tamanhos.push([k, v])
      o[k] = v
      return true
    },
  })
}

const foto = (id, w = 4032, h = 3024) => ({ id, naturalWidth: w, naturalHeight: h })

test('fatia: cada parte desenha só o seu pedaço, igual a cortar a imagem inteira (carrossel contínuo)', () => {
  const tela = M.telaDe({ tipo: 'carrossel', formato: '4x5', slides: 3 })
  const opcoes = { formato: tela, modelo: 'duas-lado', imagens: [foto('a'), foto('b')], espaco: 20, cantos: 10, fundo: '#fff' }
  const inteira = canvasFalso()
  M.desenharMontagem(inteira, opcoes)
  assert.equal(inteira.width, 3240)
  for (const p of C.partesDe(tela, 'x')) {
    const c = canvasFalso()
    const r = C.desenharFatia(c, opcoes, p.fatia)
    // o canvas tem o tamanho da fatia (nunca o da tela inteira)
    assert.deepEqual([c.width, c.height, r.w, r.h], [1080, 1350, 1080, 1350])
    assert.ok(c.tamanhos.every(([, v]) => v <= 1350), JSON.stringify(c.tamanhos))
    // a mesma foto, o mesmo recorte e a mesma caixa (em px da tela inteira) que o desenho inteiro: a imagem continua
    // de um slide para o outro
    const global = c.desenhos.map((x) => ({ ...x, d: x.d.map((v, i) => (i === 0 ? v + p.fatia.x : i === 1 ? v + p.fatia.y : v)) }))
    assert.deepEqual(global, inteira.desenhos)
    assert.deepEqual(c.fundos[0], [0 - p.fatia.x || 0, 0, 3240, 1350, '#fff'])
  }
  // a foto "a" passa do slide 1 para o 2: ela atravessa a linha de corte em 1080
  const a = inteira.desenhos.find((x) => x.img === 'a').d
  assert.ok(a[0] < 1080 && a[0] + a[2] > 1080)
})

test('fatia: a grade 3×5 em 3:4 nunca cria um canvas maior que o do Safari', () => {
  const tela = M.telaDe({ tipo: 'grade', linhas: 5, quadrado: '3x4' })
  assert.ok(tela.w * tela.h > SAFARI_MAX_PIXELS, 'a tela inteira passaria do limite')
  for (const p of C.partesDe(tela, 'x')) {
    const c = canvasFalso()
    C.desenharFatia(c, { formato: tela, modelo: 'uma', imagens: [foto('a')], fundo: '#000' }, p.fatia)
    assert.ok(c.width * c.height <= SAFARI_MAX_PIXELS)
    assert.equal(c.desenhos.length, 1)
  }
})

test('foto: abre só no tamanho que o quadro precisa (com o zoom), nunca maior que a foto', () => {
  // 12 MP num quadro de 540×1350: precisa de 1350 px de altura (cobrir), 1800×1350
  assert.deepEqual(C.tamanhoNecessario(4032, 3024, { w: 540, h: 1350 }), { w: 1800, h: 1350 })
  // zoom 2: o dobro
  assert.deepEqual(C.tamanhoNecessario(4032, 3024, { w: 540, h: 1350 }, 2), { w: 3600, h: 2700 })
  // nunca maior que a foto
  assert.deepEqual(C.tamanhoNecessario(800, 600, { w: 2160, h: 1350 }, 3), { w: 800, h: 600 })
  // nem que o lado máximo do Safari
  const g = C.tamanhoNecessario(12000, 9000, { w: 10800, h: 1350 })
  assert.ok(Math.max(g.w, g.h) <= C.LIMITES.ladoFoto)
})

test('vídeo: até 1920 px no lado maior, sempre par, e o take no tempo certo', () => {
  assert.deepEqual(C.tamanhoDoVideo(M.formatoPorId('9x16')), { w: 1080, h: 1920, escala: 1 })
  const ultra = C.tamanhoDoVideo(M.formatoPorId('21x9'))
  assert.deepEqual([ultra.w, ultra.h], [1920, 810])
  const cinema = C.tamanhoDoVideo(M.formatoPorId('2.39x1'))
  assert.ok(cinema.w === 1920 && cinema.h % 2 === 0)
  // normal: anda 1/30 s por quadro a partir do começo do trecho
  assert.equal(C.tempoNoTake(30, 30, { inicio: 2 }, 20), 3)
  // câmera lenta: metade
  assert.equal(C.tempoNoTake(30, 30, { inicio: 2, lento: true }, 20), 2.5)
  // take mais curto que a montagem: volta para o começo do trecho em vez de congelar
  const t = C.tempoNoTake(90, 30, { inicio: 0 }, 2)
  assert.ok(t >= 0 && t < 2, String(t))
  assert.equal(C.quadrosDoVideo(5), 150)
})

test('vídeo: o recorte de cada take é o mesmo da prévia, e ele é lido só do tamanho da caixa', () => {
  const tela = M.telaDe({ tipo: 'post', formato: '4x5' })
  const v = C.tamanhoDoVideo(tela)
  const caixas = M.caixasDe('duas-lado', { w: v.w, h: v.h, espaco: 12 })
  const info = { largura: 3840, altura: 2160 }
  const e = C.encaixeDoTake(info, caixas[1], { x: 0.5, y: 0.5, zoom: 1 })
  // o recorte tem a proporção da caixa e cabe no take
  assert.ok(Math.abs(e.sw / e.sh - caixas[1].w / caixas[1].h) < 1e-6)
  assert.ok(e.sx >= 0 && e.sx + e.sw <= 3840 && e.sh <= 2160)
  const l = C.leituraDoTake(info, e)
  assert.ok(l.w < 3840 && l.w % 2 === 0 && l.h % 2 === 0)
  // a caixa é coberta sem esticar: o recorte lido tem pelo menos o tamanho dela
  assert.ok(e.sh * l.k >= caixas[1].h - 2)
})

test('mídia: foto ou vídeo pelo tipo e, sem tipo, pelo nome', () => {
  assert.equal(C.tipoDaMidia({ type: 'image/heic', name: 'IMG_0001.HEIC' }), 'foto')
  assert.equal(C.tipoDaMidia({ type: 'video/quicktime', name: 'IMG_0002.MOV' }), 'video')
  assert.equal(C.tipoDaMidia({ mimeType: 'video/mp4', name: 'take.mp4' }), 'video')
  assert.equal(C.tipoDaMidia({ type: '', name: 'take.mov' }), 'video')
  assert.equal(C.tipoDaMidia({ mimeType: 'application/octet-stream', name: 'foto.jpg' }), 'foto')
  assert.equal(C.tipoDaMidia({ type: 'application/pdf', name: 'roteiro.pdf' }), null)
  assert.equal(C.saidaDe(M.telaDe({ tipo: 'grade', linhas: 2 })), '6 imagens 1080 × 1440')
  assert.equal(C.saidaDe(M.telaDe({ tipo: 'post', formato: '21x9' }), { takes: 1, video: true }), '1920 × 810 · MP4')
})

test('celular: o Estúdio abre Montagens e o service worker guarda os arquivos novos', async () => {
  const ler = (p) => fs.readFile(new URL(`../web/public/app/${p}`, import.meta.url), 'utf8')
  const criar = await ler('components/criar.js')
  assert.match(criar, /MontagensTela/)
  assert.match(await ler('components/estudio.js'), /Montagens/)
  const sw = await ler('sw.js')
  for (const f of ['components/estudio.js', 'lib/montagens.js', 'lib/montagens-celular.js', 'lib/montagens-midia.js', 'lib/frames-posts.js', 'components/montagens.js']) assert.ok(sw.includes(`'./${f}'`), `${f} fora do service worker`)
  // o vídeo lê pelo Mediabunny (WebCodecs), quadro a quadro, sem <video> nem MediaRecorder
  const midia = await ler('lib/montagens-midia.js')
  assert.doesNotMatch(midia, /createElement\('video'\)|new MediaRecorder/)
})
