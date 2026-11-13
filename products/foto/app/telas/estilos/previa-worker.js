// Worker da tela Estilos: revela a prévia da foto da pessoa com cada estilo (o cartão da biblioteca e o palco), corrige
// a foto (exposição e branco, src/estilo/por-foto.js), trata um lote e extrai o estilo de uma referência. Tudo em
// JavaScript, com o mesmo motor da exportação (src/motor): o que o cartão mostra é o que a foto recebe.
//
// A fonte é a prévia JPEG da foto (1024 px, já de pé) ou a cena neutra gerada aqui (sem foto aberta). Ela vira Base uma
// vez por tamanho (baseDeImagem: a inversa exata da tela) e fica guardada enquanto é usada.
//
// Tarefas (pelo pool, app/trabalho/pool.js):
//   previa    { fonte, lado, p, daFoto, intensidade, local }      → { blob, largura, altura, ms }
//   corrigir  { fonte, ajustes, modo }                             → { ajustes, explicacao, correcao }
//   lote      { fotos: [{ id, blob, ajustes, grupo }], p, modo, intensidade } → [{ id, ajustes, explicacao, correcao }]
//   extrair   { referencias: [Blob], alvo: fonte | null, daFoto, nome } → { predefinicao, erro, grupos, avisos, … , antes, depois }
// `fonte` = { chave, blob } | { chave: 'cena' }.

import { comTransferencia, servir } from '../../trabalho/servir.js'
import { neutro, normalizar } from '../../../src/motor/ajustes.js'
import { baseDeImagem } from '../../../src/motor/base.js'
import { revelarEmBytes } from '../../../src/motor/revelar.js'
import { aplicar } from '../../../src/estilo/predefinicao.js'
import { descompactar, aplicarLut } from '../../../src/estilo/look.js'
import { tratarEmLote } from '../../../src/estilo/por-foto.js'
import { extrairEstilo } from '../../../src/estilo/referencia.js'

const GUARDAR = 8
/** chave|lado → Base (as mais usadas por último ficam) */
const bases = new Map()
/** id do look → função do look (o mesmo look não é descompactado de novo) */
const looks = new Map()

/** A cena neutra: céu, horizonte, mata, uma superfície quente, uma cartela cinza. Nada de gente; sempre a mesma. */
function desenharCena(largura, altura) {
  const tela = new OffscreenCanvas(largura, altura)
  const c = tela.getContext('2d')
  const L = largura
  const A = altura
  const ceu = c.createLinearGradient(0, 0, 0, A * 0.62)
  ceu.addColorStop(0, '#5f86b8')
  ceu.addColorStop(0.7, '#b9c8d6')
  ceu.addColorStop(1, '#e9d2b0')
  c.fillStyle = ceu
  c.fillRect(0, 0, L, A)
  // sol baixo
  const sol = c.createRadialGradient(L * 0.72, A * 0.5, 0, L * 0.72, A * 0.5, A * 0.42)
  sol.addColorStop(0, 'rgb(255 244 214 / 0.95)')
  sol.addColorStop(0.18, 'rgb(255 222 170 / 0.55)')
  sol.addColorStop(1, 'rgb(255 210 160 / 0)')
  c.fillStyle = sol
  c.fillRect(0, 0, L, A)
  // serra ao longe
  c.fillStyle = '#6f7f95'
  c.beginPath()
  c.moveTo(0, A * 0.6)
  for (let i = 0; i <= 12; i++) c.lineTo((i / 12) * L, A * (0.5 + 0.08 * Math.sin(i * 1.7) + 0.04 * Math.cos(i * 3.1)))
  c.lineTo(L, A * 0.64)
  c.lineTo(0, A * 0.64)
  c.fill()
  // campo e mata
  const campo = c.createLinearGradient(0, A * 0.6, 0, A)
  campo.addColorStop(0, '#5d7a3a')
  campo.addColorStop(1, '#2b3b1c')
  c.fillStyle = campo
  c.fillRect(0, A * 0.62, L, A * 0.38)
  c.fillStyle = '#26361a'
  for (let i = 0; i < 9; i++) {
    const x = L * (0.04 + i * 0.07)
    c.beginPath()
    c.ellipse(x, A * 0.66, L * 0.045, A * (0.12 + 0.03 * Math.sin(i * 2.3)), 0, 0, Math.PI * 2)
    c.fill()
  }
  // uma superfície quente (terracota, perto do tom de pele) com luz e sombra
  const pedra = c.createLinearGradient(L * 0.5, A * 0.66, L * 0.66, A * 0.92)
  pedra.addColorStop(0, '#e2a77f')
  pedra.addColorStop(1, '#8a4f33')
  c.fillStyle = pedra
  c.beginPath()
  c.roundRect(L * 0.48, A * 0.68, L * 0.2, A * 0.24, A * 0.03)
  c.fill()
  // a cartela cinza: do preto ao branco, embaixo à direita
  const passos = 6
  for (let i = 0; i < passos; i++) {
    const v = Math.round(18 + (i / (passos - 1)) * 222)
    c.fillStyle = `rgb(${v} ${v} ${v})`
    c.fillRect(L * (0.74 + i * 0.035), A * 0.8, L * 0.035, A * 0.1)
  }
  return tela
}

async function pixelsDe(fonte, lado) {
  let largura
  let altura
  let desenho
  if (fonte.cena || !fonte.blob) {
    largura = lado
    altura = Math.round((lado * 2) / 3)
    desenho = desenharCena(largura, altura)
  } else {
    const bitmap = await createImageBitmap(fonte.blob)
    const k = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
    largura = Math.max(1, Math.round(bitmap.width * k))
    altura = Math.max(1, Math.round(bitmap.height * k))
    desenho = new OffscreenCanvas(largura, altura)
    const c = desenho.getContext('2d', { alpha: false })
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'high'
    c.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close()
  }
  const { data } = desenho.getContext('2d').getImageData(0, 0, largura, altura)
  return { largura, altura, dados: data }
}

async function baseDe(fonte, lado) {
  const chave = `${fonte.chave}|${lado}`
  const pronta = bases.get(chave)
  if (pronta) {
    bases.delete(chave)
    bases.set(chave, pronta)
    return pronta
  }
  const px = await pixelsDe(fonte, lado)
  const base = baseDeImagem({ largura: px.largura, altura: px.altura, dados: px.dados, canais: 4, espaco: 'srgb' })
  bases.set(chave, base)
  while (bases.size > GUARDAR) bases.delete(bases.keys().next().value)
  return base
}

function lookDe(p) {
  if (!p?.look) return null
  const chave = `${p.look.lado}:${p.look.dados.length}:${p.look.dados.slice(0, 64)}:${p.look.dados.slice(-64)}`
  if (!looks.has(chave)) {
    looks.set(chave, aplicarLut(descompactar(p.look)))
    if (looks.size > 24) looks.delete(looks.keys().next().value)
  }
  return looks.get(chave)
}

/** Os ajustes que a foto recebe: o estilo (na intensidade) sobre o que é da foto; sem estilo, só o da foto. */
function ajustesPara(p, daFoto, intensidade) {
  return p ? aplicar(p, daFoto ?? neutro(), intensidade ?? 100) : normalizar(daFoto ?? neutro())
}

async function emJpeg(base, ajustes, look, { local = true, qualidade = 0.86 } = {}) {
  const r = revelarEmBytes(base, ajustes, { semLocal: !local, look, semente: 7 })
  const tela = new OffscreenCanvas(r.largura, r.altura)
  tela.getContext('2d').putImageData(new ImageData(r.dados, r.largura, r.altura), 0, 0)
  const blob = await tela.convertToBlob({ type: 'image/jpeg', quality: qualidade })
  return { blob, largura: r.largura, altura: r.altura }
}

/** Uma imagem (Blob JPEG ou PNG) → { largura, altura, dados RGBA, espaco } no tamanho que basta para a extração. */
async function imagemDe(blob, lado = 768) {
  const bitmap = await createImageBitmap(blob)
  const k = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
  const largura = Math.max(1, Math.round(bitmap.width * k))
  const altura = Math.max(1, Math.round(bitmap.height * k))
  const tela = new OffscreenCanvas(largura, altura)
  const c = tela.getContext('2d', { alpha: false })
  c.imageSmoothingQuality = 'high'
  c.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()
  return { largura, altura, dados: c.getImageData(0, 0, largura, altura).data, espaco: 'srgb' }
}

servir({
  async previa({ fonte, lado = 320, p = null, daFoto = null, intensidade = 100, local = true, qualidade }, { cancelado }) {
    const inicio = performance.now()
    const base = await baseDe(fonte, lado)
    if (cancelado()) return null
    const r = await emJpeg(base, ajustesPara(p, daFoto, intensidade), lookDe(p), { local, qualidade })
    return { ...r, ms: performance.now() - inicio }
  },

  async corrigir({ fonte, ajustes, modo }) {
    // o automático lê uma grade pequena: 320 px bastam
    const base = await baseDe(fonte, 320)
    const [r] = tratarEmLote([{ id: fonte.chave, base, ajustes }], null, { modo, suavizar: false })
    return r
  },

  async lote({ fotos, p, modo, intensidade }, { cancelado, progresso }) {
    const entrada = []
    for (let i = 0; i < fotos.length; i++) {
      if (cancelado()) return null
      const f = fotos[i]
      let base
      if (modo !== 'so-estilo' && f.blob) {
        try {
          const px = await pixelsDe({ blob: f.blob }, 192)
          base = baseDeImagem({ largura: px.largura, altura: px.altura, dados: px.dados, canais: 4, espaco: 'srgb' })
        } catch {
          base = undefined
        }
      }
      entrada.push({ id: f.id, base, ajustes: f.ajustes, grupo: f.grupo })
      if (i % 8 === 7) progresso((i + 1) / fotos.length)
    }
    return tratarEmLote(entrada, p, { modo, intensidade }).map(({ id, ajustes, explicacao, correcao }) => ({ id, ajustes, explicacao, correcao }))
  },

  async extrair({ referencias, alvo, daFoto, nome }) {
    const refs = []
    for (const blob of referencias) refs.push(await imagemDe(blob))
    const imagemAlvo = alvo ? await imagemDe(alvo.blob ?? null, 768).catch(() => null) : null
    const r = extrairEstilo(refs, { alvo: imagemAlvo ?? undefined, nome })
    // antes e depois na foto da pessoa (ou na cena neutra, sem foto)
    const fonte = alvo?.blob ? alvo : { chave: 'cena', cena: true }
    const base = await baseDe(fonte, 1024)
    const antes = await emJpeg(base, ajustesPara(null, daFoto), null)
    const depois = await emJpeg(base, ajustesPara(r.predefinicao, daFoto, 100), lookDe(r.predefinicao))
    const resultado = {
      predefinicao: r.predefinicao,
      confianca: r.confianca,
      erro: { antes: r.erro.antes, depois: r.erro.depois, aderencia: r.erro.aderencia, alcance: r.erro.alcance },
      pareado: r.pareado,
      grupos: r.grupos,
      pb: r.pb,
      avisos: r.avisos,
      tempo: r.tempo.total,
      antes: antes.blob,
      depois: depois.blob,
      largura: depois.largura,
      altura: depois.altura,
    }
    return comTransferencia(resultado, [])
  },
})
