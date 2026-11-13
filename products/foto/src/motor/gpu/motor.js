// O espelho do motor Latitude em WebGL2. Recebe um contexto `webgl2` (de um canvas ou de um OffscreenCanvas) e faz, na
// placa, a mesma conta de revelar.js: geometria → cadeia de ponto → vizinhança → tela. Os números saem das MESMAS
// funções do JS (`uniformes` de ponto.js, `criarTela` de tela.js, `geometria` e `contextoDe` de revelar.js, `LOCAL` de
// local.js): a placa não tem constante própria de aparência.
//
//   const motor = criarMotorGpu(gl)
//   motor.carregarBase(base)                                    // a cena sobe como textura float
//   motor.desenhar(ajustes, { regiao, zoom, comparar, avisos })  // no canvas do contexto
//   motor.desenhar(ajustes, { alvo: 'textura' }); motor.ler()   // Float32Array RGBA (código da tela 0..1)
//
// O que fica igual ao JS e o que não fica:
// - Cadeia de ponto, tela, look e geometria: a mesma conta, em float32. O teste trava a diferença em menos de 1/255.
// - Vizinhança (neblina, clareza, textura, nitidez, grão, vinheta): os mesmos filtros (caixa, mínimo, gaussiana, filtro
//   guiado), com uma diferença de propósito: quando o raio passa de RAIO_MAXIMO pixels, o filtro guiado roda numa cópia
//   reduzida por área (os momentos I, p, I², I·p) e os coeficientes voltam por bilinear. A diferença fica abaixo da
//   tolerância escrita em TOLERANCIA (ΔE em Oklab contra revelar do JS).
// - Redução de ruído: só no JS (roda na base, antes da cena). A placa a ignora e diz isso em `ignorados`.
//
// Sem DOM: o único objeto de fora é o contexto (e o tamanho do canvas dele, que a saída ajusta).

import { normalizar } from '../ajustes.js'
import { luminancia } from '../cor/espacos.js'
import { histogramaDaCena, histogramaDaTela } from '../histograma.js'
import { LOCAL, limitesDaNitidez, luzDoAr, margemLocal, temLocal, temRuido } from '../local.js'
import { criarPonto, uniformes as uniformesDoPonto } from '../ponto.js'
import { contextoDe, geometria } from '../revelar.js'
import { MARGENS, PESO_MAXIMO, criarTela, telaDe } from '../tela.js'
import * as G from './glsl.js'

/** Acima deste raio (em pixels da vista) o filtro guiado roda reduzido por área. */
export const RAIO_MAXIMO = 6

/** Tolerâncias medidas e travadas no teste (test/gpu.test.js), contra revelar do JS na mesma cena. */
export const TOLERANCIA = {
  ponto: 1 / 255, // maior diferença por canal, em código de 8 bits
  vizinhanca: { media: 0.003, p99: 0.015 }, // ΔE em Oklab (0,02 já se vê lado a lado); medido: 0,0007 e 0,004
}

/** Cores dos avisos (código da tela): neutras, distintas entre si e da foto. */
export const AVISOS = {
  perdida: [0.06, 0.06, 0.06], // altas luzes sem dado no arquivo (três canais cortados no sensor): sólido
  recuperavel: [0.5, 0.5, 0.5], // a tela corta, ou um ou dois canais cortados, mas o arquivo tem dado: listras
  sombra: [0.93, 0.93, 0.93], // abaixo do piso de ruído medido no arquivo: listras
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i

export class ErroGpu extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroGpu'
    this.codigo = codigo
  }
}

const CURVAS = { srgb: 0, rec2020: 1, gama22: 2, linear: 3 }

/**
 * O que a máscara de avisos precisa de uma base RAW: a matriz Rec.2020 → câmera (já com o branco) e o limiar de corte
 * por canal. Sai de `corDaCamera(negativo)` quando o negativo existe (exato); sem ele, do neutro da câmera guardado na
 * base, tratando Rec.2020 como espaço de câmera (aproximado: `exato: false`).
 */
export function corteDaBase(base, { cor = null, limiar = 0.98 } = {}) {
  if (base.origem !== 'raw') return null
  if (cor?.paraRec2020 && cor?.ganhos) {
    return { matriz: inverter3(cor.paraRec2020), limiar: cor.ganhos.map((g) => limiar * g), exato: true }
  }
  const neutro = base.branco?.neutroCamera
  if (!Array.isArray(neutro) || !neutro.every((v) => v > 0)) return null
  const maior = Math.max(...neutro)
  return { matriz: [1, 0, 0, 0, 1, 0, 0, 0, 1], limiar: neutro.map((v) => (limiar * maior) / v), exato: false }
}

function inverter3(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  const l0 = [A, -(b * i - c * h), b * f - c * e]
  const l1 = [B, a * i - c * g, -(a * f - c * d)]
  const l2 = [C, -(a * h - b * g), a * e - b * d]
  return [...l0, ...l1, ...l2].map((v) => v / det)
}

// A luz do ar medida na base inteira reduzida a 256 px, depois da cena — a mesma conta de revelar.js (luzDoArDaBase).
function reduzida256(base) {
  const { largura, altura, dados } = base.imagem
  const k = Math.max(1, Math.ceil(Math.max(largura, altura) / 256))
  const w = Math.floor(largura / k)
  const h = Math.floor(altura / k)
  const saida = new Float32Array(w * h * 3)
  const inv = 1 / (k * k)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let dy = 0; dy < k; dy++) {
        let i = ((y * k + dy) * largura + x * k) * 3
        for (let dx = 0; dx < k; dx++, i += 3) {
          r += dados[i]
          g += dados[i + 1]
          b += dados[i + 2]
        }
      }
      const o = (y * w + x) * 3
      saida[o] = r * inv
      saida[o + 1] = g * inv
      saida[o + 2] = b * inv
    }
  }
  return { largura: w, altura: h, dados: saida }
}

/**
 * A luz do ar (cor da neblina) da foto inteira: a base reduzida a 256 px, depois da cena (a conta de revelar.js
 * luzDoArDaBase). Vale para tirar e para pôr neblina, aqui e no JS.
 */
export function luzDoArDaFoto(base, ajustes, contexto = contextoDe(base, normalizar(ajustes)), pequena = reduzida256(base)) {
  const copia = { ...pequena, dados: Float32Array.from(pequena.dados) }
  criarPonto(normalizar(ajustes), contexto).aplicarEm(copia.dados, copia.largura * copia.altura)
  return luzDoAr(copia)
}

/**
 * Cria o motor sobre um contexto WebGL2. `opcoes.precisao`: 'alta' (tudo em float32, é o que o teste usa) ou 'auto'
 * (cena em float16 quando a base passa de 12 MP; filtros sempre em float32).
 */
export function criarMotorGpu(gl, { precisao = 'auto' } = {}) {
  if (!gl || typeof gl.createVertexArray !== 'function') throw new ErroGpu('sem-webgl2', 'Este navegador não tem WebGL2.')
  if (!gl.getExtension('EXT_color_buffer_float')) throw new ErroGpu('sem-float', 'A placa de vídeo não desenha em ponto flutuante (EXT_color_buffer_float).')
  const depurar = gl.getExtension('WEBGL_debug_renderer_info')
  const renderizador = String(gl.getParameter(depurar ? depurar.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '')
  const info = { renderizador, software: SOFTWARE.test(renderizador), maxTextura: gl.getParameter(gl.MAX_TEXTURE_SIZE) }
  let perdido = false
  const aoPerder = (e) => {
    perdido = true
    e.preventDefault?.()
  }
  gl.canvas?.addEventListener?.('webglcontextlost', aoPerder)

  // ─────────── programas ───────────

  function compilar(tipo, fonte, nome) {
    const s = gl.createShader(tipo)
    gl.shaderSource(s, fonte)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new ErroGpu('shader', `${nome}: ${gl.getShaderInfoLog(s)}`)
    return s
  }
  const vertice = compilar(gl.VERTEX_SHADER, G.VERTICE, 'vértice')
  const programas = {}
  function programa(nome) {
    if (programas[nome]) return programas[nome]
    const p = gl.createProgram()
    gl.attachShader(p, vertice)
    gl.attachShader(p, compilar(gl.FRAGMENT_SHADER, G[nome], nome))
    gl.bindAttribLocation(p, 0, 'p')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new ErroGpu('shader', `${nome}: ${gl.getProgramInfoLog(p)}`)
    const locais = new Map()
    programas[nome] = {
      p,
      local(n) {
        if (!locais.has(n)) locais.set(n, gl.getUniformLocation(p, n))
        return locais.get(n)
      },
    }
    return programas[nome]
  }

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  // uniformes por nome, com o tipo dito por quem chama
  let atual = null
  const U = {
    f: (n, v) => gl.uniform1f(atual.local(n), v),
    i: (n, v) => gl.uniform1i(atual.local(n), v),
    b: (n, v) => gl.uniform1i(atual.local(n), v ? 1 : 0),
    v2: (n, a, b) => gl.uniform2f(atual.local(n), a, b),
    v3: (n, v) => gl.uniform3f(atual.local(n), v[0], v[1], v[2]),
    i2: (n, a, b) => gl.uniform2i(atual.local(n), a, b),
    m3: (n, m) => gl.uniformMatrix3fv(atual.local(n), true, m),
  }
  let unidade = 0
  function textura(n, t, alvo = gl.TEXTURE_2D) {
    gl.activeTexture(gl.TEXTURE0 + unidade)
    gl.bindTexture(alvo, t)
    gl.uniform1i(atual.local(n), unidade++)
  }
  function usar(nome) {
    atual = programa(nome)
    gl.useProgram(atual.p)
    unidade = 0
    return U
  }
  function rodar(destino) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, destino ? destino.fbo : null)
    gl.viewport(0, 0, destino ? destino.w : gl.drawingBufferWidth, destino ? destino.h : gl.drawingBufferHeight)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  // ─────────── texturas ───────────

  const FORMATOS = {
    rgba32f: [gl.RGBA32F, gl.RGBA, gl.FLOAT],
    rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
    rg32f: [gl.RG32F, gl.RG, gl.FLOAT],
    rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
  }
  function novaTextura(alvo = gl.TEXTURE_2D) {
    const t = gl.createTexture()
    gl.bindTexture(alvo, t)
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
      [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ])
      gl.texParameteri(alvo, k, v)
    return t
  }
  // alvos de desenho reaproveitados entre quadros (mesmo tamanho e formato); `em uso` volta ao fim de cada quadro
  const livres = []
  const emUso = []
  function alvo(w, h, formato) {
    const i = livres.findIndex((a) => a.w === w && a.h === h && a.formato === formato)
    let a
    if (i >= 0) a = livres.splice(i, 1)[0]
    else {
      const [interno, fmt, tipo] = FORMATOS[formato]
      const tex = novaTextura()
      gl.texImage2D(gl.TEXTURE_2D, 0, interno, w, h, 0, fmt, tipo, null)
      const fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      const estado = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
      if (estado !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new ErroGpu('fbo', `A placa não desenha em ${formato} (${estado}).`)
      a = { tex, fbo, w, h, formato }
    }
    emUso.push(a)
    return a
  }
  function devolver(a) {
    const i = emUso.indexOf(a)
    if (i >= 0) emUso.splice(i, 1)
    livres.push(a)
    // o pool não cresce sem limite: os mais antigos saem
    while (livres.length > 24) {
      const v = livres.shift()
      gl.deleteTexture(v.tex)
      gl.deleteFramebuffer(v.fbo)
    }
  }
  function devolverTudo(guardar = []) {
    for (const a of [...emUso]) if (!guardar.includes(a)) devolver(a)
  }

  // ─────────── estado da base ───────────

  let base = null
  let referencia = null // base para as medidas da foto inteira (branco auto, luz do ar, histograma da cena)
  let texBase = null
  let janela = null
  let pequena = null // a referência reduzida a 256 px
  const tabTom = novaTextura()
  const tabMatiz = novaTextura()
  let lookCarregado = null
  let texLook = null
  let ultimo = null // { saida, largura, altura, alvo }
  const guardaAntes = { chave: null, alvo: null }

  /**
   * Sobe a base (Base de prepararBase/baseDeImagem). `janela`: { x, y, largura, altura } quando `base.imagem.dados` traz
   * só esse pedaço da base (zoom de 100% e exportação em ladrilhos); `base.imagem.largura` e `altura` continuam sendo
   * os da base inteira. `referencia`: a base inteira (reduzida) para as medidas da foto toda. `corte`: o da máscara de
   * avisos (ver `corteDaBase`); sem ele, usa `base.corte`.
   */
  function carregarBase(nova, { janela: j = null, referencia: ref = null, corte = null } = {}) {
    if (gl.isContextLost()) throw new ErroGpu('contexto-perdido', 'A placa de vídeo foi reiniciada.')
    const w = j ? j.largura : nova.imagem.largura
    const h = j ? j.altura : nova.imagem.altura
    if (w > info.maxTextura || h > info.maxTextura) throw new ErroGpu('grande-demais', `A placa aceita no máximo ${info.maxTextura} px de lado.`)
    if (nova.imagem.dados.length < w * h * 3) throw new Error('carregarBase: dados menores que a janela')
    const pixels = nova.imagem.largura * nova.imagem.altura
    const meia = precisao !== 'alta' && pixels > 12e6
    if (!texBase) texBase = novaTextura()
    gl.bindTexture(gl.TEXTURE_2D, texBase)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, meia ? gl.RGB16F : gl.RGB32F, w, h, 0, gl.RGB, gl.FLOAT, nova.imagem.dados.subarray(0, w * h * 3))
    base = { ...nova, corte: corte ?? nova.corte ?? corteDaBase(nova) }
    janela = j ?? { x: 0, y: 0, largura: w, altura: h }
    if (!ref && j) throw new Error('carregarBase: janela pede a referência (a base inteira, reduzida)')
    if ((ref ?? nova) !== referencia) {
      referencia = ref ?? nova
      pequena = reduzida256(referencia)
    }
    guardaAntes.chave = null
    return { largura: nova.imagem.largura, altura: nova.imagem.altura, meiaPrecisao: meia }
  }

  function carregarLook(look) {
    if (look === lookCarregado) return
    lookCarregado = look
    if (!look) return
    const n = look.tamanho ?? look.lado
    if (!texLook) texLook = novaTextura(gl.TEXTURE_3D)
    gl.bindTexture(gl.TEXTURE_3D, texLook)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, n, n, n, 0, gl.RGB, gl.FLOAT, look.dados)
  }

  // ─────────── uniformes de cada parte ───────────

  function subirTabelas(u) {
    // a tabela tem TAM_TOM + 1 entradas (a última repete a ponta): (EV_MAX − EV_MIN)·passos + 2
    const larg = (u.tom.evMax - u.tom.evMin) * u.tom.passosPorEv + 2
    const tom = new Float32Array(larg * 4)
    if (u.tom.tabela) tom.set(u.tom.tabela.subarray(0, larg), 0)
    if (u.canais) for (let c = 0; c < 3; c++) tom.set(u.canais[c].subarray(0, larg), larg * (c + 1))
    gl.bindTexture(gl.TEXTURE_2D, tabTom)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, larg, 4, 0, gl.RED, gl.FLOAT, tom)
    const m = u.cor.matiz
    const linhas = m.tamanho + 1
    const matiz = new Float32Array(linhas * 2 * 4)
    if (m.tabela) {
      for (let i = 0; i < linhas; i++) {
        const o = i * m.colunas
        matiz.set([m.tabela[o], m.tabela[o + 1], m.tabela[o + 2], m.tabela[o + 3]], i * 4)
        matiz.set([m.tabela[o + 4], m.tabela[o + 5], 0, 0], (linhas + i) * 4)
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, tabMatiz)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, linhas, 2, 0, gl.RGBA, gl.FLOAT, matiz)
  }

  function ponto(u) {
    const P = u.passos
    U.m3('uEntrada', u.entrada)
    U.b('uTom', P.tom)
    U.b('uCanais', P.canais)
    U.b('uCalib', P.calibracao)
    U.b('uCor', P.cor)
    U.b('uMist', P.misturador)
    U.b('uTonal', P.tonalizacao)
    U.b('uPb', P.pb)
    U.b('uVeu', P.veu)
    U.b('uTemMatiz', !!u.cor.matiz.tabela)
    U.v3('uNormaPesos', u.norma.pesos)
    U.f('uNormaMax', u.norma.maximo)
    textura('uTabTom', tabTom)
    textura('uTabMatiz', tabMatiz)
    U.m3('uCalibracao', u.calibracao)
    U.m3('uParaLms', u.cor.paraLms)
    U.m3('uDeLms', u.cor.deLms)
    U.m3('uLmsParaLab', u.cor.lmsParaLab)
    U.m3('uLabParaLms', u.cor.labParaLms)
    U.f('uSombrasTinta', u.cor.sombrasTinta)
    U.f('uSaturacao', u.cor.saturacao)
    U.f('uVibracao', u.cor.vibracao)
    U.f('uIVib2', 1 / (u.cor.vibracaoRef * u.cor.vibracaoRef))
    U.f('uCroma2', u.cor.cromaRef * u.cor.cromaRef)
    U.f('uPele', u.cor.protecaoPele)
    const T = u.cor.tonalizacao
    const [zs, zm, za, zg] = T.zonas
    U.v3('uZonaS', [zs.a, zs.b, zs.luz])
    U.v3('uZonaM', [zm.a, zm.b, zm.luz])
    U.v3('uZonaA', [za.a, za.b, za.luz])
    U.v3('uZonaG', [zg.a, zg.b, zg.luz])
    U.b('uLuzZona', T.zonas.some((z) => z.luz !== 0))
    const inv = 1 / (T.mistura * T.largura + T.largura)
    gl.uniform4f(atual.local('uTonal4'), T.pivo, T.pivo - T.largura, inv, T.pivo - T.mistura * T.largura)
    U.f('uTonalMeioInv', 1 / T.largura)
    U.f('uVeuValor', u.veu)
  }

  function telaStruct(nome, tela) {
    const t = tela.uniformes
    U.m3(`${nome}.matriz`, t.matrizTela)
    U.m3(`${nome}.paraLms`, t.paraLms)
    U.m3(`${nome}.lmsParaTela`, t.lmsParaTela)
    U.v3(`${nome}.pesos`, t.pesosNorma)
    U.f(`${nome}.maximo`, t.pesoMaximo)
    U.f(`${nome}.c`, t.curva.c)
    U.f(`${nome}.k`, t.curva.k)
    U.f(`${nome}.a`, t.curva.a)
    U.f(`${nome}.lb`, t.curva.lb)
    U.f(`${nome}.xB`, t.curva.preto)
    U.f(`${nome}.xW`, t.curva.branco)
    U.f(`${nome}.preservar`, t.preservarMatiz)
    U.i(`${nome}.curva`, CURVAS[t.transferencia] ?? 0)
  }

  const Y2020 = luminancia('rec2020')
  const pesosNorma = Y2020.map((y) => y * (1 - PESO_MAXIMO))
  function norma() {
    U.v3('uPesosNorma', pesosNorma)
    U.f('uMaximoNorma', PESO_MAXIMO)
  }

  // ─────────── filtros de vizinhança ───────────

  // caixa separável em dois passos; devolve um alvo novo do mesmo formato
  function caixa(entrada, r) {
    if (r < 1) return entrada
    const meio = alvo(entrada.w, entrada.h, entrada.formato)
    usar('CAIXA')
    textura('uEntrada', entrada.tex)
    U.i('uRaio', r)
    U.b('uHorizontal', true)
    rodar(meio)
    const fim = alvo(entrada.w, entrada.h, entrada.formato)
    usar('CAIXA')
    textura('uEntrada', meio.tex)
    U.i('uRaio', r)
    U.b('uHorizontal', false)
    rodar(fim)
    devolver(meio)
    return fim
  }

  function minimo(entrada, r) {
    const meio = alvo(entrada.w, entrada.h, entrada.formato)
    usar('MINIMO')
    textura('uEntrada', entrada.tex)
    U.i('uRaio', r)
    U.b('uHorizontal', true)
    rodar(meio)
    const fim = alvo(entrada.w, entrada.h, entrada.formato)
    usar('MINIMO')
    textura('uEntrada', meio.tex)
    U.i('uRaio', r)
    U.b('uHorizontal', false)
    rodar(fim)
    devolver(meio)
    return fim
  }

  /**
   * Filtro guiado (local.js filtroGuiado) com I e p nos canais R e G de `entrada`. Devolve { coef (R = média de a,
   * G = média de b), fator } — fator > 1 quando rodou reduzido (raio acima de RAIO_MAXIMO).
   */
  function guiado(entrada, r, eps) {
    const fator = r > RAIO_MAXIMO ? Math.ceil(r / RAIO_MAXIMO) : 1
    // raio na reduzida: a janela s·(2r' + 1) mais perto de 2r + 1
    const rr = fator > 1 ? Math.max(1, Math.round(((2 * r + 1) / fator - 1) / 2)) : r
    const mom = alvo(entrada.w, entrada.h, 'rgba32f')
    usar('MOMENTOS')
    textura('uEntrada', entrada.tex)
    rodar(mom)
    let m = mom
    if (fator > 1) {
      const red = alvo(Math.ceil(entrada.w / fator), Math.ceil(entrada.h / fator), 'rgba32f')
      usar('REDUZIR')
      textura('uEntrada', mom.tex)
      U.i('uFator', fator)
      rodar(red)
      devolver(mom)
      m = red
    }
    const medias = caixa(m, rr)
    if (medias !== m) devolver(m)
    const ab = alvo(medias.w, medias.h, 'rg32f')
    usar('COEFICIENTES')
    textura('uEntrada', medias.tex)
    U.f('uEps', eps)
    rodar(ab)
    devolver(medias)
    const coef = caixa(ab, rr)
    if (coef !== ab) devolver(ab)
    return { coef, fator }
  }

  // ─────────── o quadro ───────────

  function cena(ajustes, contexto, geo, E, zoom) {
    const u = uniformesDoPonto(ajustes, contexto)
    subirTabelas(u)
    const S = alvo(E.w, E.h, precisao === 'alta' || !(base.imagem.largura * base.imagem.altura > 12e6) ? 'rgba32f' : 'rgba16f')
    usar('CENA')
    ponto(u)
    textura('uBase', texBase)
    U.i2('uBaseCheia', base.imagem.largura, base.imagem.altura)
    U.i2('uJanela0', janela.x, janela.y)
    U.i2('uJanelaTam', janela.largura, janela.altura)
    U.v3('uMapaX', geo.mapa.slice(0, 3))
    U.v3('uMapaY', geo.mapa.slice(3, 6))
    U.b('uExata', geo.exata)
    U.v2('uOrigem', E.x, E.y)
    U.f('uZoom', zoom)
    U.i('uAmostras', zoom < 1 ? Math.min(4, Math.ceil(1 / zoom - 1e-9)) : 1)
    U.b('uBicubicaNoZoom', true)
    // avisos medidos na base
    const corte = base.corte
    if (corte) {
      U.i('uCorteModo', 1)
      U.m3('uCorteMatriz', corte.matriz)
      U.v3('uCorteLimiar', corte.limiar)
    } else if (base.origem === 'imagem') {
      U.i('uCorteModo', 2)
      U.m3('uCorteMatriz', [1, 0, 0, 0, 1, 0, 0, 0, 1])
      U.v3('uCorteLimiar', [1, 1, 1])
    } else {
      U.i('uCorteModo', 0)
      U.m3('uCorteMatriz', [1, 0, 0, 0, 1, 0, 0, 0, 1])
      U.v3('uCorteLimiar', [1e30, 1e30, 1e30])
    }
    telaStruct('uTelaOriginal', criarTela(base.espaco ?? 'srgb', { altas: MARGENS.altas.padrao, sombras: MARGENS.sombras.padrao }))
    const abaixo = base.latitude?.margem?.abaixoDoCinza
    U.f('uPisoRuido', Number.isFinite(abaixo) ? 0.18 * 2 ** (-abaixo - (base.exposicaoBase ?? 0)) : 0)
    rodar(S)
    return S
  }

  function vizinhanca(S, ajustes, ar, escala) {
    const p = ajustes.presenca
    const d = ajustes.detalhe
    const raio = (fracao) => Math.round(fracao * Math.max(quadroVista.largura, quadroVista.altura))
    let atualS = S
    const trocar = (novo) => {
      devolver(atualS)
      atualS = novo
    }
    // neblina
    if (p.neblina) {
      const q = p.neblina / 100
      if (q < 0) {
        const novo = alvo(S.w, S.h, S.formato)
        usar('NEBLINA_APLICAR')
        textura('uCena', atualS.tex)
        textura('uGuia', atualS.tex)
        textura('uCoef', atualS.tex)
        U.i('uFator', 1)
        U.v3('uAr', ar)
        U.f('uTMin', LOCAL.neblina.tMin)
        U.f('uVeu', 1 + q * LOCAL.neblina.veu)
        rodar(novo)
        trocar(novo)
      } else {
        const r = Math.max(1, raio(LOCAL.neblina.raio))
        const prep = alvo(S.w, S.h, 'rg32f')
        usar('NEBLINA_PREPARO')
        textura('uCena', atualS.tex)
        U.v3('uAr', ar)
        U.v3('uY', Y2020)
        rodar(prep)
        const canal = minimo(prep, r)
        const trans = alvo(S.w, S.h, 'rg32f')
        usar('NEBLINA_TRANSMISSAO')
        textura('uEntrada', canal.tex)
        U.f('uOmega', LOCAL.neblina.omega * q)
        rodar(trans)
        devolver(canal)
        const { coef, fator } = guiado(trans, r * 4, 1e-3)
        devolver(trans)
        const novo = alvo(S.w, S.h, S.formato)
        usar('NEBLINA_APLICAR')
        textura('uCena', atualS.tex)
        textura('uGuia', prep.tex)
        textura('uCoef', coef.tex)
        U.i('uFator', fator)
        U.v3('uAr', ar)
        U.f('uTMin', LOCAL.neblina.tMin)
        U.f('uVeu', 0)
        rodar(novo)
        devolver(prep)
        devolver(coef)
        trocar(novo)
      }
    }
    // clareza e textura
    if (p.textura || p.clareza) {
      const escalas = []
      for (const [valor, cfg, nome] of [
        [p.textura, LOCAL.textura, 'Textura'],
        [p.clareza, LOCAL.clareza, 'Clareza'],
      ]) {
        const r = raio(cfg.raio)
        if (!valor || r < 1) continue
        escalas.push({ nome, k: (valor / 100) * cfg.ganho, r, eps: cfg.limiarEv * cfg.limiarEv })
      }
      if (escalas.length) {
        const L = alvo(S.w, S.h, 'rg32f')
        usar('LUZ')
        norma()
        textura('uCena', atualS.tex)
        rodar(L)
        for (const e of escalas) Object.assign(e, guiado(L, e.r, e.eps))
        devolver(L)
        const novo = alvo(S.w, S.h, S.formato)
        usar('CONTRASTE')
        norma()
        textura('uCena', atualS.tex)
        for (const nome of ['Textura', 'Clareza']) {
          const e = escalas.find((x) => x.nome === nome)
          textura(`uCoef${nome}`, e ? e.coef.tex : atualS.tex)
          U.i(`uFator${nome}`, e ? e.fator : 1)
          U.f(`uK${nome}`, e ? e.k : 0)
        }
        rodar(novo)
        for (const e of escalas) devolver(e.coef)
        trocar(novo)
      }
    }
    // nitidez
    if (d.nitidez) {
      const sigma = d.raio * escala
      if (sigma >= 0.25) {
        const { ganho, limite } = limitesDaNitidez({ nitidez: d.nitidez, detalhe: d.detalhe })
        const L = alvo(S.w, S.h, 'rg32f')
        usar('LUZ')
        norma()
        textura('uCena', atualS.tex)
        rodar(L)
        const meio = alvo(S.w, S.h, 'rg32f')
        usar('GAUSS')
        textura('uEntrada', L.tex)
        U.f('uSigma', sigma)
        U.b('uHorizontal', true)
        rodar(meio)
        const borrado = alvo(S.w, S.h, 'rg32f')
        usar('GAUSS')
        textura('uEntrada', meio.tex)
        U.f('uSigma', sigma)
        U.b('uHorizontal', false)
        rodar(borrado)
        devolver(meio)
        devolver(L)
        let mascara = null
        if (d.mascara > 0) {
          const forca = alvo(S.w, S.h, 'rg32f')
          usar('NITIDEZ_FORCA')
          norma()
          textura('uCena', atualS.tex)
          textura('uBorrado', borrado.tex)
          rodar(forca)
          mascara = minimo(forca, Math.max(1, Math.round(2 * sigma)))
          devolver(forca)
        }
        const novo = alvo(S.w, S.h, S.formato)
        usar('NITIDEZ')
        norma()
        textura('uCena', atualS.tex)
        textura('uBorrado', borrado.tex)
        textura('uMascara', mascara ? mascara.tex : borrado.tex)
        U.b('uComMascara', !!mascara)
        U.f('uGanho', ganho)
        U.f('uLimite', limite)
        U.f('uE', (d.mascara / 100) * LOCAL.nitidez.mascaraEv)
        rodar(novo)
        devolver(borrado)
        if (mascara) devolver(mascara)
        trocar(novo)
      }
    }
    return atualS
  }

  let quadroVista = { largura: 1, altura: 1 }

  function final(S, ajustes, O, E, escala, tela, formato, { local, avisos, semente, look }) {
    const T = alvo(O.w, O.h, formato)
    usar('FINAL')
    textura('uCena', S.tex)
    U.i2('uDesloca', O.x - E.x, O.y - E.y)
    U.v2('uOrigemSaida', O.x, O.y)
    telaStruct('uTela', tela)
    const e = ajustes.efeitos
    // grão (local.js grao): os mesmos números
    const comGrao = local && e.grao > 0
    U.b('uGrao', comGrao)
    if (comGrao) {
      const Gr = LOCAL.grao
      const lado = Math.max(quadroVista.largura, quadroVista.altura) / escala
      const celulaCheia = Math.max(1, (Gr.celulaMin + (Gr.celulaMax - Gr.celulaMin) * (e.graoTamanho / 100)) * (lado / Gr.ladoRef))
      const f = 1 / escala
      const q = ((e.grao / 100) * Gr.ev) / Math.sqrt(1 + (0.8 * (f * f - 1)) / (celulaCheia * celulaCheia))
      const peso2 = e.graoAspereza / 100
      U.f('uGraoQ', q)
      U.f('uGraoNorma', 1 / Math.sqrt(1 + peso2 * peso2))
      U.f('uGraoCelula', Math.max(celulaCheia, f))
      U.f('uGraoF', f)
      U.f('uGraoPeso2', peso2)
      U.i('uGraoSemente', semente | 0)
    }
    const comVinheta = local && e.vinheta !== 0
    U.b('uVinheta', comVinheta)
    if (comVinheta) {
      const r0 = 0.8 * (e.vinhetaMeio / 100)
      U.f('uVinhetaEv', (e.vinheta / 100) * LOCAL.vinheta.ev)
      U.f('uVinhetaR0', r0)
      U.f('uVinhetaR1', r0 + 0.2 + 0.8 * (e.vinhetaSuavidade / 100))
      U.v2('uCentro', quadroVista.largura / 2, quadroVista.altura / 2)
    }
    const comLook = !!(look && ajustes.look.id)
    U.b('uLook', comLook)
    if (comLook) {
      carregarLook(look)
      textura('uLookLut', texLook, gl.TEXTURE_3D)
      U.f('uLookTam', look.tamanho ?? look.lado)
      U.v3('uLookMin', look.dominio?.min ?? [0, 0, 0])
      U.v3('uLookMax', look.dominio?.max ?? [1, 1, 1])
      U.f('uLookQuantidade', ajustes.look.quantidade / 100)
    } else {
      // a unidade do sampler3D precisa de uma textura 3D válida mesmo sem uso
      if (!texLook) carregarLook({ tamanho: 2, dados: new Float32Array(24) })
      textura('uLookLut', texLook, gl.TEXTURE_3D)
      U.v3('uLookMin', [0, 0, 0])
      U.v3('uLookMax', [1, 1, 1])
    }
    const bits = !avisos ? 0 : (avisos === true || avisos.altas !== false ? 1 : 0) | (avisos === true || avisos.sombras !== false ? 2 : 0)
    U.i('uAvisos', bits)
    U.v3('uCorPerdida', AVISOS.perdida)
    U.v3('uCorRecuperavel', AVISOS.recuperavel)
    U.v3('uCorSombra', AVISOS.sombra)
    rodar(T)
    return T
  }

  // um caminho inteiro: ajustes → textura de código da tela (O.w × O.h)
  function revelarNaPlaca(ajustes, { O, E, geo, zoom, idTela, formato, local, avisos, semente, look }) {
    const contexto = contextoDe(referencia, ajustes)
    contexto.branco = base.branco
    contexto.exposicaoBase = base.exposicaoBase ?? 0
    let S = cena(ajustes, contexto, geo, E, zoom)
    const escala = zoom / (base.reduzir ?? 1)
    if (local) {
      const ar = ajustes.presenca.neblina !== 0 ? luzDoArDaFoto(referencia, ajustes, contexto, pequena) : [1, 1, 1]
      S = vizinhanca(S, ajustes, ar, escala)
    }
    const tela = telaDe(idTela, ajustes, base)
    const T = final(S, ajustes, O, E, escala, tela, formato, { local, avisos, semente, look })
    devolver(S)
    return T
  }

  /**
   * Desenha os ajustes. `opcoes`:
   *   alvo       'tela' (o canvas do contexto, redimensionado para a saída) ou 'textura' (float32, para `ler`)
   *   regiao     { x, y, largura, altura } no quadro de saída (pixels da base depois da geometria); padrão: o quadro
   *   zoom       pixels da saída por pixel do quadro (1 = um para um; < 1 reduz com superamostragem)
   *   comparar   null | { posicao: 0..1 (onde fica a divisória), antes?: ajustes (padrão: o neutro, mesma geometria) }
   *   avisos     false | true | { altas, sombras }
   *   tela       'srgb' | 'p3' | 'rec2020'
   *   semLocal, semente, look (a LUT de src/estilo/look.js: { lado, dados: Float32Array RGB com o vermelho mais
   *              rápido, dominio? }; `tamanho` vale como `lado`), aplicada quando `ajustes.look.id` existe
   * Devolve { largura, altura, regiao, zoom, ms, ignorados: [o que a placa não fez] }.
   */
  function desenhar(ajustesCrus, opcoes = {}) {
    if (perdido || gl.isContextLost()) {
      perdido = true
      throw new ErroGpu('contexto-perdido', 'A placa de vídeo foi reiniciada.')
    }
    if (!base) throw new Error('desenhar: carregue uma base antes')
    const t0 = performance.now()
    const ajustes = normalizar(ajustesCrus)
    const zoom = opcoes.zoom ?? 1
    const idTela = opcoes.tela ?? 'srgb'
    const geo = geometria(base, ajustes)
    const regiao = opcoes.regiao ?? { x: 0, y: 0, largura: geo.largura, altura: geo.altura }
    quadroVista = { largura: geo.largura * zoom, altura: geo.altura * zoom }
    const O = {
      x: Math.round(regiao.x * zoom),
      y: Math.round(regiao.y * zoom),
      w: Math.max(1, Math.round(regiao.largura * zoom)),
      h: Math.max(1, Math.round(regiao.altura * zoom)),
    }
    const local = !opcoes.semLocal && temLocal(ajustes)
    const escala = zoom / (base.reduzir ?? 1)
    const margem = local ? margemLocal(ajustes, quadroVista, escala) : 0
    const limiteX = Math.ceil(quadroVista.largura - 1e-6)
    const limiteY = Math.ceil(quadroVista.altura - 1e-6)
    const E = { x: Math.max(0, O.x - margem), y: Math.max(0, O.y - margem) }
    E.w = Math.min(limiteX, O.x + O.w + margem) - E.x
    E.h = Math.min(limiteY, O.y + O.h + margem) - E.y
    if (E.w < O.w || E.h < O.h) {
      E.w = Math.max(E.w, O.x + O.w - E.x)
      E.h = Math.max(E.h, O.y + O.h - E.y)
    }
    if (E.w > info.maxTextura || E.h > info.maxTextura) throw new ErroGpu('grande-demais', `Área de ${E.w} × ${E.h} px passa do limite da placa.`)
    const paraTextura = opcoes.alvo === 'textura'
    const formato = paraTextura ? 'rgba32f' : 'rgba8'
    const comum = { O, E, geo, zoom, idTela, formato, local, avisos: opcoes.avisos ?? false, semente: opcoes.semente ?? 1, look: opcoes.look ?? null }
    const depois = revelarNaPlaca(ajustes, comum)
    let antes = null
    const comparar = opcoes.comparar
    if (comparar) {
      const a = normalizar(comparar.antes ?? {})
      a.geometria = ajustes.geometria
      const chave = JSON.stringify([a, O, E, zoom, idTela, formato, comum.semente, base.imagem.largura, janela])
      if (guardaAntes.chave === chave && guardaAntes.alvo) antes = guardaAntes.alvo
      else {
        if (guardaAntes.alvo) devolver(guardaAntes.alvo)
        antes = revelarNaPlaca(a, { ...comum, local: !opcoes.semLocal && temLocal(a), avisos: false })
        guardaAntes.chave = chave
        guardaAntes.alvo = antes
      }
    }
    // composição: antes | depois, e a saída
    let saida = null
    if (paraTextura) saida = alvo(O.w, O.h, 'rgba32f')
    else if (gl.canvas && (gl.canvas.width !== O.w || gl.canvas.height !== O.h)) {
      gl.canvas.width = O.w
      gl.canvas.height = O.h
    }
    usar('COMPOR')
    textura('uDepois', depois.tex)
    textura('uAntes', (antes ?? depois).tex)
    U.b('uComparar', !!antes)
    U.f('uDivisoria', comparar ? Math.max(0, Math.min(1, comparar.posicao ?? 0.5)) * O.w : 0)
    U.b('uDesvirar', !paraTextura)
    U.i('uAltura', O.h)
    rodar(saida)
    // guarda: a saída (para `ler`), o depois (para o histograma) e o antes em cache
    if (ultimo?.depois && ultimo.depois !== depois) devolver(ultimo.depois)
    if (ultimo?.saida && ultimo.saida !== saida) devolver(ultimo.saida)
    ultimo = { saida, depois, largura: O.w, altura: O.h, tela: idTela }
    devolverTudo([saida, depois, guardaAntes.alvo].filter(Boolean))
    const ignorados = []
    if (!opcoes.semLocal && temRuido(ajustes)) ignorados.push('ruido')
    return { largura: O.w, altura: O.h, regiao, zoom, ms: performance.now() - t0, ignorados }
  }

  /**
   * Lê a última saída: { largura, altura, dados } de cima para baixo. `tipo` 'float' (Float32Array RGBA, só depois de
   * `alvo: 'textura'`) ou 'uint8' (Uint8Array RGBA). `regiao` opcional dentro da saída.
   */
  function ler({ tipo = 'float', regiao = null } = {}) {
    if (!ultimo) throw new Error('ler: nada desenhado ainda')
    const r = regiao ?? { x: 0, y: 0, largura: ultimo.largura, altura: ultimo.altura }
    if (tipo === 'float' && !ultimo.saida) throw new Error("ler: 'float' só depois de desenhar com alvo: 'textura'")
    gl.bindFramebuffer(gl.FRAMEBUFFER, ultimo.saida ? ultimo.saida.fbo : null)
    const n = r.largura * r.altura * 4
    if (ultimo.saida) {
      const dados = tipo === 'float' ? new Float32Array(n) : new Uint8Array(n)
      if (tipo === 'float') gl.readPixels(r.x, r.y, r.largura, r.altura, gl.RGBA, gl.FLOAT, dados)
      else {
        const f = new Float32Array(n)
        gl.readPixels(r.x, r.y, r.largura, r.altura, gl.RGBA, gl.FLOAT, f)
        for (let i = 0; i < n; i++) dados[i] = Math.round(Math.min(1, Math.max(0, f[i])) * 255)
      }
      return { largura: r.largura, altura: r.altura, dados }
    }
    // canvas: o framebuffer conta as linhas de baixo para cima
    const bruto = new Uint8Array(n)
    gl.readPixels(r.x, ultimo.altura - r.y - r.altura, r.largura, r.altura, gl.RGBA, gl.UNSIGNED_BYTE, bruto)
    const dados = new Uint8Array(n)
    const linha = r.largura * 4
    for (let y = 0; y < r.altura; y++) dados.set(bruto.subarray((r.altura - 1 - y) * linha, (r.altura - y) * linha), y * linha)
    return { largura: r.largura, altura: r.altura, dados }
  }

  // leitura sem travar: PBO + fence, conferido a cada 4 ms
  function lerSemTravar(fonte, w, h) {
    const pbo = gl.createBuffer()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fonte.fbo)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    const cerca = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    gl.flush()
    return new Promise((ok, falhou) => {
      const conferir = () => {
        if (gl.isContextLost()) return falhou(new ErroGpu('contexto-perdido', 'A placa de vídeo foi reiniciada.'))
        const estado = gl.clientWaitSync(cerca, 0, 0)
        if (estado === gl.TIMEOUT_EXPIRED) return setTimeout(conferir, 4)
        gl.deleteSync(cerca)
        const dados = new Uint8Array(w * h * 4)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo)
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, dados)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        gl.deleteBuffer(pbo)
        ok(dados)
      }
      conferir()
    })
  }

  /**
   * Histogramas do último quadro: `tela` (o que se vê, de uma amostra de até `lado` px do depois, lida sem travar) e
   * `cena` (da base inteira reduzida, em EV com a exposição e a exposição base). Promise.
   */
  async function histograma(ajustesCrus, { lado = 256 } = {}) {
    if (!ultimo?.depois) throw new Error('histograma: nada desenhado ainda')
    const ajustes = normalizar(ajustesCrus)
    const k = Math.max(1, Math.max(ultimo.largura, ultimo.altura) / lado)
    const w = Math.max(1, Math.floor(ultimo.largura / k))
    const h = Math.max(1, Math.floor(ultimo.altura / k))
    const amostra = alvo(w, h, 'rgba8')
    usar('AMOSTRA')
    textura('uEntrada', ultimo.depois.tex)
    U.v2('uPasso', ultimo.largura / w, ultimo.altura / h)
    rodar(amostra)
    const rgba = await lerSemTravar(amostra, w, h)
    devolver(amostra)
    const dados = new Float32Array(w * h * 3)
    for (let i = 0, j = 0; i < w * h * 4; i += 4, j += 3) {
      dados[j] = rgba[i] / 255
      dados[j + 1] = rgba[i + 1] / 255
      dados[j + 2] = rgba[i + 2] / 255
    }
    const tela = histogramaDaTela({ largura: w, altura: h, dados }, { espaco: ultimo.tela })
    const cena = histogramaDaCena(pequena, { ev: ajustes.luz.exposicao + (base.exposicaoBase ?? 0) })
    return { tela, cena }
  }

  /**
   * Mostra uma imagem pronta no canvas (ImageBitmap, ImageData ou { largura, altura, dados: RGBA 8 bits }), esticada
   * para `largura` × `altura` (padrão: o tamanho dela). Não mexe na base: é a prévia embutida enquanto a base não chega.
   */
  let texImagem = null
  function mostrarImagem(fonte, { largura, altura } = {}) {
    if (perdido || gl.isContextLost()) throw new ErroGpu('contexto-perdido', 'A placa de vídeo foi reiniciada.')
    const w0 = fonte.width ?? fonte.largura
    const h0 = fonte.height ?? fonte.altura
    const w = Math.max(1, Math.round(largura ?? w0))
    const h = Math.max(1, Math.round(altura ?? h0))
    if (!texImagem) texImagem = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texImagem)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    if (fonte.dados) {
      const rgba = new Uint8Array(fonte.dados.buffer, fonte.dados.byteOffset, w0 * h0 * 4)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w0, h0, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
    }
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, fonte)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (gl.canvas && (gl.canvas.width !== w || gl.canvas.height !== h)) {
      gl.canvas.width = w
      gl.canvas.height = h
    }
    usar('IMAGEM')
    textura('uImagem', texImagem)
    U.v2('uTam', w, h)
    rodar(null)
    if (ultimo?.depois) devolver(ultimo.depois)
    if (ultimo?.saida) devolver(ultimo.saida)
    ultimo = { saida: null, depois: null, largura: w, altura: h, tela: 'srgb' }
    return { largura: w, altura: h }
  }

  function liberar() {
    gl.canvas?.removeEventListener?.('webglcontextlost', aoPerder)
    for (const a of [...livres, ...emUso]) {
      gl.deleteTexture(a.tex)
      gl.deleteFramebuffer(a.fbo)
    }
    livres.length = 0
    emUso.length = 0
    for (const t of [texBase, tabTom, tabMatiz, texLook, texImagem]) if (t) gl.deleteTexture(t)
    for (const p of Object.values(programas)) gl.deleteProgram(p.p)
    gl.deleteBuffer(vbo)
    gl.deleteVertexArray(vao)
    base = null
    referencia = null
    pequena = null
    ultimo = null
  }

  return {
    info,
    carregarBase,
    desenhar,
    mostrarImagem,
    ler,
    histograma,
    liberar,
    perdido: () => perdido || gl.isContextLost(),
    /** A base que está na placa (só os metadados mudam de dono; os dados continuam sendo de quem carregou). */
    base: () => base,
  }
}
