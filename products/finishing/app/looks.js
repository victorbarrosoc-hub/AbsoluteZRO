// Revela Looks · a vitrine dos packs. O mesmo frame de exemplo passa por cada look do pack (motor de verdade, LUT
// assada aqui no navegador), em troca automática na vitrine e em faixas na capa de cada pack. Cada pack abre no Lab
// com a base escolhida. A compra ainda não existe: nada de botão de pagar, só "Loja em breve".

import './conta.js'
import './menu.js'
import { aplicar, assar } from '../src/cor/cube.js'
import { GRUPOS, analisarFrame, baseDoLab, criarLab } from '../src/cor/lab.js'
import { cascata, escalonar, icones } from './visual.js'

icones()
escalonar()

const raiz = document.querySelector('main')
const $ = (id) => raiz.querySelector(`#${id}`)
const LADO_VITRINE = 1280
const LADO_CAPA = 480
const TROCA_MS = 2800
const reduzir = matchMedia('(prefers-reduced-motion: reduce)')

const avisar = (t, erro = false) => {
  $('estado').textContent = t
  $('estado').classList.toggle('erro', erro)
}
const espera = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))

function desenhar(bm, lado) {
  const escala = Math.min(1, lado / Math.max(bm.width, bm.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bm.width * escala)
  c.height = Math.round(bm.height * escala)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bm, 0, 0, c.width, c.height)
  return ctx.getImageData(0, 0, c.width, c.height)
}

function pintarCom(base, f, tamanho) {
  const lut = assar(f, tamanho)
  const out = new ImageData(base.width, base.height)
  const d = base.data
  for (let i = 0; i < d.length; i += 4) {
    const o = aplicar(lut, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255)
    out.data[i] = Math.round(o[0] * 255)
    out.data[i + 1] = Math.round(o[1] * 255)
    out.data[i + 2] = Math.round(o[2] * 255)
    out.data[i + 3] = 255
  }
  return out
}

let frame = null // { vitrine: ImageData, capa: ImageData, correcao }
const cache = new Map() // id do look → ImageData da vitrine
let pack = GRUPOS[0]
let indice = 0
let relogio = null
let mostrando = 'a'

const look = (id) => criarLab({ base: id, correcao: frame.correcao })

function vitrineDe(id) {
  if (!cache.has(id)) cache.set(id, pintarCom(frame.vitrine, look(id).aplicar, 33))
  return cache.get(id)
}

/** Troca o look da vitrine com um fade entre os dois canvases (o de cima recebe o look novo). */
function mostrar(i) {
  indice = (i + pack.looks.length) % pack.looks.length
  const l = pack.looks[indice]
  const proximo = mostrando === 'a' ? 'b' : 'a'
  const c = $(`vitrine-${proximo}`)
  const img = vitrineDe(l.id)
  c.width = img.width
  c.height = img.height
  c.getContext('2d').putImageData(img, 0, 0)
  $(`vitrine-${proximo}`).classList.add('visivel')
  $(`vitrine-${mostrando}`).classList.remove('visivel')
  mostrando = proximo
  $('vitrine-nome').textContent = `${pack.nome} · ${l.nome}`
  for (const [j, b] of [...$('vitrine-pontos').children].entries()) b.setAttribute('aria-selected', String(j === indice))
}

function desenharPontos() {
  $('vitrine-pontos').replaceChildren(
    ...pack.looks.map((l, j) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'vitrine-ponto'
      b.setAttribute('role', 'tab')
      b.setAttribute('aria-label', l.nome)
      b.addEventListener('click', () => {
        mostrar(j)
        rodar()
      })
      return b
    }),
  )
}

/** Troca sozinha a cada 2,8 s; parada com "reduzir movimento", com o ponteiro em cima ou com a aba escondida. */
function rodar() {
  clearInterval(relogio)
  relogio = null
  if (reduzir.matches || document.hidden || !document.contains(raiz)) return
  relogio = setInterval(() => {
    if (!document.contains(raiz) || $('vitrine-palco').matches(':hover')) return
    mostrar(indice + 1)
  }, TROCA_MS)
}

function escolherPack(g) {
  pack = g
  desenharPontos()
  mostrar(0)
  rodar()
  for (const a of $('packs').children) a.classList.toggle('ativo', a.dataset.pack === g.id)
}

/** Capa do pack: o frame em faixas verticais, uma por look, para ver o pack inteiro de uma vez. */
function capa(g) {
  const { width: w, height: h } = frame.capa
  const out = new ImageData(w, h)
  const faixas = g.looks.map((l) => pintarCom(frame.capa, look(l.id).aplicar, 17))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = Math.min(faixas.length - 1, Math.floor((x / w) * faixas.length))
      const i = (y * w + x) * 4
      out.data.set(faixas[k].data.subarray(i, i + 4), i)
    }
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').putImageData(out, 0, 0)
  c.setAttribute('aria-hidden', 'true')
  return c
}

function desenharPacks() {
  $('packs').replaceChildren(
    ...GRUPOS.map((g) => {
      const art = document.createElement('article')
      art.className = 'pack'
      art.dataset.pack = g.id
      const ver = document.createElement('button')
      ver.type = 'button'
      ver.className = 'pack-capa'
      ver.title = `Ver ${g.nome} na vitrine`
      ver.append(capa(g))
      ver.addEventListener('click', () => {
        escolherPack(g)
        $('vitrine-palco').scrollIntoView({ behavior: reduzir.matches ? 'auto' : 'smooth', block: 'center' })
      })
      const titulo = document.createElement('h2')
      titulo.textContent = g.nome
      const fichas = document.createElement('div')
      fichas.className = 'fichas pack-fichas'
      for (const [texto, dica] of [
        [`${g.looks.length} looks`, g.looks.map((l) => l.nome).join(', ')],
        ['.cube 33 · 65', 'LUT para Resolve, Premiere, Final Cut e CapCut'],
        ['.revela', 'Receita para ajustar no Lab'],
      ]) {
        const f = document.createElement('span')
        f.className = 'ficha'
        f.textContent = texto
        f.title = dica
        fichas.append(f)
      }
      const breve = document.createElement('span')
      breve.className = 'ficha ficha--saida'
      breve.textContent = 'Loja em breve'
      breve.title = 'Preços e compra pela conta Absolute ZRO, ainda a definir'
      fichas.append(breve)
      const abrir = document.createElement('a')
      abrir.className = 'vidro vidro--tinta'
      abrir.href = `lab.html?base=${g.looks[0].id}&exemplo`
      abrir.textContent = 'Abrir no Lab'
      art.append(ver, titulo, fichas, abrir)
      return art
    }),
  )
  cascata($('packs'))
}

async function iniciar() {
  avisar('Revelando os looks…')
  try {
    const r = await fetch('exemplos/material-vestido.jpg')
    const bm = await createImageBitmap(await r.blob())
    const vitrine = desenhar(bm, LADO_VITRINE)
    const pixels = new Float32Array(vitrine.width * vitrine.height * 3)
    for (let i = 0, j = 0; i < vitrine.data.length; i += 4, j += 3) {
      pixels[j] = vitrine.data[i] / 255
      pixels[j + 1] = vitrine.data[i + 1] / 255
      pixels[j + 2] = vitrine.data[i + 2] / 255
    }
    const { exposicao, ganhos } = analisarFrame(pixels)
    frame = { vitrine, capa: desenhar(bm, LADO_CAPA), correcao: { exposicao, ganhos } }
  } catch {
    return avisar('Não deu para abrir o frame de exemplo agora.', true)
  }
  await espera()
  desenharPontos()
  mostrar(0)
  await espera()
  desenharPacks()
  $('packs').firstElementChild?.classList.add('ativo')
  avisar('')
  rodar()
}

document.addEventListener('visibilitychange', rodar)
reduzir.addEventListener?.('change', rodar)
addEventListener('revela:pagina', (e) => (e.detail === 'looks' ? rodar() : clearInterval(relogio)))
// sem pacote de looks válido, nada a mostrar (não acontece: GRUPOS vem do motor)
if (GRUPOS.every((g) => g.looks.every((l) => baseDoLab(l.id)))) iniciar()
