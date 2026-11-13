// Apoio dos testes do espelho na GPU e da sessão: sobe o app (servidor local com os cabeçalhos de produção, em modo
// local), abre o Chromium e leva bases e imagens entre o Node e a página em base64 (Float32Array e Uint8Array). Tudo
// gerado: cena sintética com semente (apoio-motor.js), nenhum binário no git.
//
// O Chromium sem placa de vídeo usa o SwiftShader (WebGL2 em software, com EXT_color_buffer_float): é lento, mas faz
// a mesma conta em float32 — é o que o CI tem.

import { abrirChromium, semChromium, subirApp, vigiar } from './apoio-tela.js'
import { cena } from './apoio-motor.js'

export { semChromium }

export const paraBase64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64')
export function deBase64(texto, Tipo = Float32Array) {
  const b = Buffer.from(texto, 'base64')
  const copia = new Uint8Array(b.length)
  copia.set(b)
  return new Tipo(copia.buffer)
}

/**
 * Uma base de cena sintética (Rec.2020 linear), como a de prepararBase, com os metadados que o motor lê.
 * `ganho` multiplica a cena; `altas` acrescenta uma faixa estourada no topo (para os avisos).
 */
export function baseSintetica(semente, largura = 240, altura = 160, opcoes = {}) {
  const { ganho = 1, origem = 'raw', reduzir = 1, latitude = null, orientacao = 1, altas = false } = opcoes
  const imagem = cena(semente, largura, altura, { ganho })
  if (altas) {
    // topo: 6 linhas muito acima da saturação (três canais), depois 6 com só o vermelho alto
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < largura; x++) {
        const o = (y * largura + x) * 3
        if (y < 6) imagem.dados.set([4, 4, 4], o)
        else imagem.dados.set([1.6, 0.4, 0.3], o)
      }
  }
  return {
    imagem,
    latitude,
    branco: { kelvin: 5200, tinta: 4, neutroCamera: [0.5, 1, 0.7] },
    origem,
    exposicaoBase: 0,
    orientacao,
    ruido: null,
    demosaico: 'rapido',
    reduzir,
    cortado: { um: 0, dois: 0, tres: 0 },
    folgaAltas: 0,
  }
}

/** A base pronta para a página: dados em base64. */
export function baseParaPagina(base) {
  return { ...base, imagem: { largura: base.imagem.largura, altura: base.imagem.altura, dados: paraBase64(base.imagem.dados) } }
}

/** Sobe o app e abre uma página da origem dele (o 404 neutro: HTML mínimo, sem a casca). */
export async function abrirPagina() {
  const app = await subirApp()
  const navegador = await abrirChromium()
  const pagina = await navegador.newPage()
  const olho = vigiar(pagina, app.base)
  // a primeira visita cria a pessoa local (cookie); a página de trabalho é o 404 neutro, sem a casca rodando
  await pagina.request.get(`${app.base}/`)
  await pagina.goto(`${app.base}/sem-casca`)
  // o 404 da própria página de trabalho é esperado; daqui em diante, qualquer erro conta
  olho.erros.length = 0
  olho.ruins.length = 0
  return {
    app,
    navegador,
    pagina,
    olho,
    async fechar() {
      await navegador.close()
      await app.fechar()
    },
  }
}

// Código que roda na página: cria o motor num canvas, sobe a base e devolve o que `desenhar` + `ler` deram.
export const NA_PAGINA = `
window.__gpu = {
  b64(t) {
    let s = ''
    const u = new Uint8Array(t.buffer, t.byteOffset, t.byteLength)
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  },
  de64(s, T = Float32Array) {
    const b = atob(s)
    const u = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i)
    return new T(u.buffer)
  },
  async motor(opcoes) {
    const m = await import('/src/motor/gpu/motor.js')
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      document.body.append(this.canvas)
      this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true })
    }
    if (!this.m) this.m = m.criarMotorGpu(this.gl, opcoes)
    return this.m
  },
  base(b) { return { ...b, imagem: { ...b.imagem, dados: this.de64(b.imagem.dados) } } },
}
`
