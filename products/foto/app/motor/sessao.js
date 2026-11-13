// A sessão de revelação: o que a tela Revelar usa. Junta o worker (abrir, base cheia, automático, exportar) e a placa
// de vídeo (src/motor/gpu/motor.js), e esconde de quem desenha a tela tudo que é placa, worker e memória.
//
//   const s = criarSessao({ canvas, aoMudar })
//   const info = await s.abrir(arquivo)          // File ou { bytes, nome }
//   s.ajustar(ajustes)                            // um quadro por requestAnimationFrame; só o último vale
//   s.ver({ zoom: 'encaixar' | 1, x, y, comparar: { posicao } | null, avisos: true })
//   await s.histograma()  /  await s.auto()  /  await s.exportarPixels(ajustes, { bits: 16 })
//   s.fechar()
//
// Abertura em dois tempos, para ninguém esperar olhando para o nada: primeiro a prévia que a câmera embutiu (ou o
// próprio JPEG), na hora; depois a base reduzida (reduzir 4, 2 ou 1: a menor que ainda cobre 2/3 do visor) e a
// revelação de verdade. A base cheia (demosaico 'qualidade') só é preparada quando o zoom passa do que a reduzida tem
// ou na exportação; no zoom, só a janela visível (com margem) sobe para a placa.
//
// Sem placa de vídeo de verdade (WebGL2 ausente, renderizador de software como SwiftShader ou llvmpipe, contexto
// perdido) a prévia sai do JS do worker, numa imagem de até 800 px, e `avisos` diz isso. Nunca tela preta. O antes/
// depois e os avisos de corte (recuperável × perdido, sombra abaixo do ruído) saem prontos do worker, da mesma base:
// ninguém precisa abrir o arquivo de novo.
//
// O canvas: a sessão escolhe o tamanho do desenho (pixels do aparelho) e escreve `style.width`/`style.height` em px de
// CSS; quem monta a tela só centraliza. O visor é o elemento pai do canvas (ou `ver({ largura, altura })` em pixels do
// aparelho).

import { ErroGpu, criarMotorGpu } from '../../src/motor/gpu/motor.js'
import { corteDaBase } from '../../src/motor/avisos.js'
import { neutro, normalizar } from '../../src/motor/ajustes.js'
import { margemLocal, temLocal } from '../../src/motor/local.js'
import { geometria } from '../../src/motor/revelar.js'

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i

/** O que fica guardado: no worker, as últimas 3 fotos (arquivo e base reduzida) e 1 base cheia; na placa, 1 base. */
export const MEMORIA = { fotos: 3, cheias: 1 }
/** Lado dos ladrilhos da exportação na placa (pixels de saída). */
export const LADRILHO = 2048
/** A partir de quanto zoom acima da base reduzida a janela da base cheia é pedida. */
const PEDE_CHEIA = 1.3

export const TEXTOS = {
  semGpu: 'Sem placa de vídeo neste navegador: a prévia sai do processador, menor e mais lenta.',
  software: 'A placa de vídeo é simulada por software aqui: a prévia sai do processador, menor e mais lenta.',
  perdeu: 'A placa de vídeo parou: a prévia seguiu no processador, menor.',
  voltou: 'A placa de vídeo voltou.',
  ruido: 'A redução de ruído aparece na exportação; a prévia não a mostra.',
  cheia: 'Preparando a foto em resolução cheia…',
}

/** Sonda a placa num contexto de 1 px, sem tocar no canvas da tela. */
export function sondarGpu() {
  try {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return { gpu: false, renderizador: '', motivo: TEXTOS.semGpu }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderizador = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '')
    const float = !!gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (!float) return { gpu: false, renderizador, motivo: TEXTOS.semGpu }
    if (SOFTWARE.test(renderizador)) return { gpu: false, renderizador, motivo: TEXTOS.software, software: true }
    return { gpu: true, renderizador, motivo: null }
  } catch {
    return { gpu: false, renderizador: '', motivo: TEXTOS.semGpu }
  }
}

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)

// semente do grão: estável por foto (nome e tamanho), para a prévia e a exportação terem o mesmo grão
function sementeDe(texto) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  return (h >>> 0) % 1000003
}

/**
 * Cria a sessão. `canvas`: o elemento onde a foto aparece. `motor`: 'auto' (placa quando é de verdade), 'gpu' (placa
 * mesmo em software: testes e laboratório) ou 'js'. `aoMudar(evento)`: { tipo: 'previa' | 'base' | 'cheia' | 'quadro' |
 * 'motor' | 'erro', ms?, ... } para a tela mostrar o estado. `guardarQuadro`: mantém o último quadro legível (testes).
 */
export function criarSessao({ canvas, motor: preferencia = 'auto', aoMudar = () => {}, guardarQuadro = false } = {}) {
  if (!canvas) throw new Error('criarSessao: passe o canvas')
  const avisos = []
  const avisar = (texto) => {
    if (texto && !avisos.includes(texto)) avisos.push(texto)
  }
  const emitir = (evento) => {
    try {
      aoMudar(evento)
    } catch {
      // a tela não derruba a sessão
    }
  }

  // ─────────── o worker ───────────

  const worker = new Worker(new URL('./motor-worker.js', import.meta.url), { type: 'module' })
  let seq = 0
  const pendentes = new Map()
  worker.onmessage = (e) => {
    const m = e.data
    const p = pendentes.get(m.id)
    if (!p) return
    if ('progresso' in m) return p.progresso?.(m.progresso)
    pendentes.delete(m.id)
    if (m.ok) p.ok(m.resultado)
    else p.falhou(Object.assign(new Error(m.erro.mensagem), { name: m.erro.nome, codigo: m.erro.codigo }))
  }
  worker.onerror = (e) => {
    const erro = new Error(`O worker da revelação não carregou: ${e.message || 'erro'}`)
    for (const p of pendentes.values()) p.falhou(erro)
    pendentes.clear()
  }
  function pedir(tipo, dados, { progresso, sinal, transferir = [] } = {}) {
    const id = ++seq
    return new Promise((ok, falhou) => {
      pendentes.set(id, { ok, falhou, progresso })
      worker.postMessage({ id, tipo, dados }, transferir)
      // cancelado: o worker para na próxima faixa e quem pediu já recebe AbortError
      sinal?.addEventListener(
        'abort',
        () => {
          worker.postMessage({ cancelar: id })
          if (pendentes.delete(id)) falhou(new DOMException('Cancelado.', 'AbortError'))
        },
        { once: true },
      )
    })
  }

  // ─────────── a superfície: placa ou 2D ───────────

  const sonda = preferencia === 'js' ? null : sondarGpu()
  let modo = preferencia === 'gpu' || (preferencia === 'auto' && sonda?.gpu) ? 'gpu' : 'js'
  if (preferencia === 'auto' && sonda && !sonda.gpu) avisar(sonda.motivo)
  let gl = null
  let motor = null
  let ctx2d = null
  let auxiliar = null // canvas 2D posto ao lado quando a placa cai depois de o canvas já ter contexto WebGL2

  function ligarPlaca() {
    gl ??= canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: guardarQuadro })
    if (!gl) throw new ErroGpu('sem-webgl2', TEXTOS.semGpu)
    motor = criarMotorGpu(gl)
  }
  if (modo === 'gpu') {
    try {
      ligarPlaca()
    } catch (erro) {
      modo = 'js'
      const semPlaca = erro?.codigo === 'sem-float' || erro?.codigo === 'sem-webgl2'
      avisar(semPlaca ? TEXTOS.semGpu : `A placa de vídeo recusou o motor (${erro.message}). A prévia sai do processador.`)
    }
  }

  function superficie2d() {
    if (ctx2d) return ctx2d
    if (!gl) {
      ctx2d = canvas.getContext('2d')
      return ctx2d
    }
    // o canvas já é WebGL2 (e a placa caiu): um canvas 2D irmão toma o lugar dele na tela
    auxiliar = document.createElement('canvas')
    auxiliar.className = canvas.className
    auxiliar.setAttribute('aria-hidden', 'true')
    auxiliar.dataset.motor = 'js'
    canvas.after(auxiliar)
    canvas.hidden = true
    ctx2d = auxiliar.getContext('2d')
    return ctx2d
  }
  function soltarAuxiliar() {
    if (!auxiliar) return
    auxiliar.remove()
    auxiliar = null
    ctx2d = null
    canvas.hidden = false
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    if (modo !== 'gpu') return
    modo = 'js'
    motor = null
    naPlaca = null
    avisar(TEXTOS.perdeu)
    emitir({ tipo: 'motor', modo, aviso: TEXTOS.perdeu })
    agendar()
  })
  canvas.addEventListener('webglcontextrestored', () => {
    if (preferencia === 'js' || fechada) return
    try {
      motor = criarMotorGpu(gl)
      modo = 'gpu'
      const i = avisos.indexOf(TEXTOS.perdeu)
      if (i >= 0) avisos.splice(i, 1)
      soltarAuxiliar()
      naPlaca = null
      emitir({ tipo: 'motor', modo, aviso: TEXTOS.voltou })
      agendar()
    } catch {
      // continua no JS
    }
  })

  // ─────────── estado ───────────

  let foto = null // { id, nome, base, latitude, exif, camera, avisos, origem, reduzir, semente, corte, cheia }
  let geracao = 0
  let ajustes = neutro()
  let lookAtual = null // a LUT do look (src/estilo/look.js) quando ajustes.look.id existe
  const vista = { zoom: 'encaixar', x: 0.5, y: 0.5, comparar: null, avisos: false, tela: 'srgb', largura: null, altura: null }
  let pedido = 0
  let fechada = false
  let naPlaca = null // 'reduzida' | chave da janela da base cheia
  let janela = null // { chave, janela, dados, meta }
  let pedindoJanela = null
  let jsOcupado = false
  let jsPendente = false

  function visor() {
    const dpr = globalThis.devicePixelRatio || 1
    if (vista.largura && vista.altura) return { largura: vista.largura, altura: vista.altura, dpr }
    const pai = canvas.parentElement
    const r = pai?.getBoundingClientRect?.()
    const w = r?.width || canvas.clientWidth || canvas.width || 800
    const h = r?.height || canvas.clientHeight || canvas.height || 600
    return { largura: Math.max(1, Math.round(w * dpr)), altura: Math.max(1, Math.round(h * dpr)), dpr }
  }

  function tamanhoCss(el, w, h) {
    const { dpr } = visor()
    if (!el.style) return
    el.style.width = `${w / dpr}px`
    el.style.height = `${h / dpr}px`
  }

  // a área visível de um nível da base: { regiao (no quadro daquele nível), zoom (px do visor por px do quadro), geo }
  function enquadrar(meta, reduzir, a) {
    const geo = geometria(meta, a)
    const { largura: W, altura: H } = visor()
    const encaixe = Math.min(W / geo.largura, H / geo.altura)
    const zoom = typeof vista.zoom === 'number' && vista.zoom > 0 ? Math.max(encaixe, vista.zoom * reduzir) : encaixe
    const w = Math.min(geo.largura, W / zoom)
    const h = Math.min(geo.altura, H / zoom)
    const x = limitar(vista.x * geo.largura - w / 2, 0, geo.largura - w)
    const y = limitar(vista.y * geo.altura - h / 2, 0, geo.altura - h)
    return { regiao: { x, y, largura: w, altura: h }, zoom, geo }
  }

  // o retângulo da base (cheia) que um pedaço do quadro lê, com margem: os quatro cantos pelo mapa afim da geometria
  function retanguloNaBase(geo, regiao, margem) {
    const [a, b, c, d, e, f] = geo.mapa
    const xs = []
    const ys = []
    for (const [u, v] of [
      [regiao.x, regiao.y],
      [regiao.x + regiao.largura, regiao.y],
      [regiao.x, regiao.y + regiao.altura],
      [regiao.x + regiao.largura, regiao.y + regiao.altura],
    ]) {
      xs.push(a * u + b * v + c)
      ys.push(d * u + e * v + f)
    }
    return {
      x: Math.floor(Math.min(...xs) - margem),
      y: Math.floor(Math.min(...ys) - margem),
      x1: Math.ceil(Math.max(...xs) + margem),
      y1: Math.ceil(Math.max(...ys) + margem),
    }
  }

  function prenderNaBase(r, meta) {
    const x = Math.max(0, r.x)
    const y = Math.max(0, r.y)
    return { x, y, largura: Math.min(meta.imagem.largura, r.x1) - x, altura: Math.min(meta.imagem.altura, r.y1) - y }
  }

  async function metaCheia() {
    if (!foto) throw new Error('Nenhuma foto aberta.')
    if (!foto.cheia) {
      const t0 = performance.now()
      const f = foto
      f.cheia = pedir('cheia', { id: f.id }).then((r) => {
        emitir({ tipo: 'cheia', ms: performance.now() - t0 })
        return r.base
      })
      f.cheia.catch(() => {
        if (f.cheia) f.cheia = null
      })
    }
    return foto.cheia
  }

  // ─────────── quadros ───────────

  function agendar() {
    if (pedido || fechada || !foto) return
    pedido = requestAnimationFrame(() => {
      pedido = 0
      quadro()
    })
  }

  function quadro() {
    if (!foto || fechada) return
    if (modo === 'gpu') {
      try {
        quadroNaPlaca()
        return
      } catch (erro) {
        if (!(erro instanceof ErroGpu) || erro.codigo !== 'contexto-perdido') {
          emitir({ tipo: 'erro', mensagem: erro.message })
          throw erro
        }
        modo = 'js'
        motor = null
        naPlaca = null
        avisar(TEXTOS.perdeu)
        emitir({ tipo: 'motor', modo, aviso: TEXTOS.perdeu })
      }
    }
    quadroNoJs()
  }

  function quadroNaPlaca() {
    const a = normalizar(ajustes)
    const t0 = performance.now()
    const opcoes = { comparar: vista.comparar, avisos: vista.avisos, semente: foto.semente, tela: vista.tela, look: lookAtual }
    // zoom acima do que a reduzida tem: a janela da base cheia, quando já chegou; senão a reduzida ampliada
    const querCheia = foto.reduzir > 1 && typeof vista.zoom === 'number' && vista.zoom * foto.reduzir > PEDE_CHEIA
    if (querCheia) {
      const pronta = janela && janela.fotoId === foto.id ? janela : null
      if (pronta) {
        const v = enquadrar(pronta.meta, 1, a)
        const precisa = prenderNaBase(retanguloNaBase(v.geo, v.regiao, margemDaVista(a, v) + 3), pronta.meta)
        const cobre =
          precisa.x >= pronta.janela.x &&
          precisa.y >= pronta.janela.y &&
          precisa.x + precisa.largura <= pronta.janela.x + pronta.janela.largura &&
          precisa.y + precisa.altura <= pronta.janela.y + pronta.janela.altura
        if (cobre) {
          if (naPlaca !== pronta.chave) {
            motor.carregarBase(
              { ...pronta.meta, imagem: { ...pronta.meta.imagem, dados: pronta.dados } },
              { janela: pronta.janela, referencia: foto.base, corte: corteDaBase(pronta.meta) },
            )
            naPlaca = pronta.chave
          }
          const r = motor.desenhar(a, { ...opcoes, regiao: v.regiao, zoom: v.zoom })
          depoisDoQuadro(r, t0, 'cheia')
          return
        }
      }
      pedirJanela(a)
    }
    if (naPlaca !== 'reduzida') {
      motor.carregarBase(foto.base, { corte: foto.corte })
      naPlaca = 'reduzida'
    }
    const v = enquadrar(foto.base, foto.reduzir, a)
    const r = motor.desenhar(a, { ...opcoes, regiao: v.regiao, zoom: v.zoom })
    depoisDoQuadro(r, t0, 'reduzida')
  }

  function margemDaVista(a, v) {
    if (!temLocal(a)) return 0
    return margemLocal(a, { largura: v.geo.largura * v.zoom, altura: v.geo.altura * v.zoom }, v.zoom) / v.zoom
  }

  function depoisDoQuadro(r, t0, nivel) {
    tamanhoCss(canvas, r.largura, r.altura)
    if (r.ignorados.includes('ruido')) avisar(TEXTOS.ruido)
    emitir({ tipo: 'quadro', motor: 'gpu', nivel, ms: performance.now() - t0, largura: r.largura, altura: r.altura })
  }

  function pedirJanela(a) {
    if (pedindoJanela) return
    const f = foto
    pedindoJanela = (async () => {
      const meta = await metaCheia()
      if (foto !== f) return
      const v = enquadrar(meta, 1, a)
      // a janela pedida é a área visível com folga de meia tela para cada lado (arrastar não pede outra na hora)
      const folga = Math.max(v.regiao.largura, v.regiao.altura) / 2
      const r = prenderNaBase(retanguloNaBase(v.geo, v.regiao, margemDaVista(a, v) + 3 + folga), meta)
      const lado = motor?.info.maxTextura ?? 4096
      r.largura = Math.min(r.largura, lado)
      r.altura = Math.min(r.altura, lado)
      const j = await pedir('janela', { id: f.id, ...r })
      if (foto !== f) return
      janela = { fotoId: f.id, chave: `${f.id}:${j.janela.x},${j.janela.y},${j.janela.largura},${j.janela.altura}`, janela: j.janela, dados: j.dados, meta }
    })()
      .catch((erro) => emitir({ tipo: 'erro', mensagem: erro.message }))
      .finally(() => {
        pedindoJanela = null
        agendar()
      })
  }

  async function quadroNoJs() {
    if (jsOcupado) {
      jsPendente = true
      return
    }
    jsOcupado = true
    jsPendente = false
    const t0 = performance.now()
    const f = foto
    try {
      const a = normalizar(ajustes)
      // zoom de verdade (acima do encaixe) no JS: o pedaço visível da base cheia; senão a prévia menor inteira
      const comparar = vista.comparar ? { posicao: vista.comparar.posicao ?? 0.5, antes: vista.comparar.antes ?? null } : null
      let pedidoJs = { id: f.id, ajustes: a, tela: vista.tela, semente: f.semente, nivel: 'menor', look: a.look.id ? lookAtual : null, comparar, avisos: vista.avisos }
      if (typeof vista.zoom === 'number' && vista.zoom * f.reduzir > PEDE_CHEIA) {
        const meta = await metaCheia()
        const v = enquadrar(meta, 1, a)
        const { largura: W, altura: H } = visor()
        const w = Math.min(v.geo.largura, Math.round(W / vista.zoom))
        const h = Math.min(v.geo.altura, Math.round(H / vista.zoom))
        const x = Math.round(limitar(vista.x * v.geo.largura - w / 2, 0, v.geo.largura - w))
        const y = Math.round(limitar(vista.y * v.geo.altura - h / 2, 0, v.geo.altura - h))
        pedidoJs = { ...pedidoJs, nivel: 'cheia', regiao: { x, y, largura: w, altura: h } }
      }
      const r = await pedir('revelar', pedidoJs)
      // a placa voltou (ou a foto mudou) enquanto o worker revelava: este quadro não vale mais
      if (fechada || foto !== f || modo !== 'js') return
      const ctx = superficie2d()
      const alvo = ctx.canvas
      if (alvo.width !== r.largura || alvo.height !== r.altura) {
        alvo.width = r.largura
        alvo.height = r.altura
      }
      ctx.putImageData(new ImageData(r.rgba, r.largura, r.altura), 0, 0)
      // a prévia menor ocupa o visor inteiro (o navegador amplia)
      const { largura: W, altura: H } = visor()
      const k = pedidoJs.nivel === 'menor' ? Math.min(W / r.largura, H / r.altura) : vista.zoom
      tamanhoCss(alvo, r.largura * k, r.altura * k)
      emitir({ tipo: 'quadro', motor: 'js', nivel: pedidoJs.nivel, ms: performance.now() - t0, largura: r.largura, altura: r.altura })
    } catch (erro) {
      emitir({ tipo: 'erro', mensagem: erro.message })
    } finally {
      jsOcupado = false
      if (jsPendente && !fechada) agendar()
    }
  }

  async function mostrarPrevia(jpeg, g) {
    let bitmap
    try {
      bitmap = await createImageBitmap(jpeg instanceof Blob ? jpeg : new Blob([jpeg], { type: 'image/jpeg' }))
    } catch {
      return
    }
    // a base já chegou (ou outra foto foi aberta): a prévia embutida não passa por cima
    if (g !== geracao || foto) return bitmap.close()
    const { largura: W, altura: H } = visor()
    const k = Math.min(1, W / bitmap.width, H / bitmap.height)
    const w = Math.max(1, Math.round(bitmap.width * k))
    const h = Math.max(1, Math.round(bitmap.height * k))
    if (modo === 'gpu' && motor) {
      try {
        motor.mostrarImagem(bitmap, { largura: w, altura: h })
        tamanhoCss(canvas, w, h)
      } catch {
        // a placa caiu no meio: a base chega logo
      }
    } else {
      const ctx = superficie2d()
      ctx.canvas.width = w
      ctx.canvas.height = h
      ctx.drawImage(bitmap, 0, 0, w, h)
      tamanhoCss(ctx.canvas, w, h)
    }
    bitmap.close()
  }

  // ─────────── a API ───────────

  /**
   * Abre um arquivo (File) ou { bytes, nome }. Resolve quando a base reduzida está na tela:
   * { latitude, exif, camera, avisos, largura, altura (do quadro em resolução cheia), origem, motor,
   *   branco: { kelvin, tinta, neutro } (a luz da foto como a câmera gravou; `neutro` = o neutro da câmera, ou null),
   *   folgaAltas (EV que a reconstrução de altas luzes recuperou acima da saturação; 0 sem RAW) }.
   * Erro de leitura rejeita com a mensagem pronta e `codigo` ('nao-e-raw', 'sem-suporte', 'corrompido').
   */
  async function abrir(arquivo) {
    if (fechada) throw new Error('A sessão foi fechada.')
    const g = ++geracao
    const t0 = performance.now()
    const ehArquivo = typeof Blob !== 'undefined' && arquivo instanceof Blob
    const nome = arquivo.name ?? arquivo.nome ?? ''
    const tamanho = ehArquivo ? arquivo.size : arquivo.bytes.byteLength
    const id = `${nome}|${tamanho}|${arquivo.lastModified ?? ''}`
    foto = null
    janela = null
    naPlaca = null
    const dados = ehArquivo ? { id, arquivo, nome } : { id, bytes: arquivo.bytes instanceof ArrayBuffer ? arquivo.bytes : arquivo.bytes.slice().buffer, nome }
    const { largura: W, altura: H } = visor()
    const r = await pedir(
      'abrir',
      { ...dados, visor: Math.max(W, H) },
      {
        progresso: (p) => {
          if (p?.etapa !== 'previa' || g !== geracao) return
          emitir({ tipo: 'previa', ms: performance.now() - t0 })
          mostrarPrevia(p.jpeg, g)
        },
      },
    )
    if (g !== geracao || fechada) throw Object.assign(new Error('Outra foto foi aberta.'), { codigo: 'substituida' })
    const base = r.base
    foto = {
      id,
      nome,
      base,
      latitude: r.latitude,
      exif: r.exif,
      camera: r.camera,
      avisos: r.avisos,
      origem: r.origem,
      reduzir: r.reduzir ?? base.reduzir ?? 1,
      semente: sementeDe(`${nome}|${tamanho}`),
      corte: corteDaBase(base),
      cheia: null,
    }
    emitir({ tipo: 'base', ms: performance.now() - t0, largura: base.imagem.largura, altura: base.imagem.altura, reduzir: foto.reduzir })
    quadro()
    const geo = geometria(base, normalizar(ajustes))
    return {
      latitude: r.latitude,
      exif: r.exif,
      camera: r.camera,
      avisos: [...(r.avisos ?? []), ...avisos],
      largura: Math.round(geo.largura * foto.reduzir),
      altura: Math.round(geo.altura * foto.reduzir),
      origem: r.origem,
      motor: modo,
      branco: base.branco ? { kelvin: base.branco.kelvin, tinta: base.branco.tinta, neutro: base.branco.neutroCamera ?? null } : null,
      folgaAltas: base.folgaAltas ?? 0,
    }
  }

  /**
   * Troca os ajustes. Desenha no próximo quadro de animação; chamadas no meio do caminho valem só pela última.
   * `look`: a LUT do look da predefinição ({ lado, dados, dominio? }, de src/estilo/look.js `descompactar`), usada
   * quando `ajustes.look.id` existe; sem passar, fica a última.
   */
  function ajustar(novos, { look } = {}) {
    ajustes = novos ?? neutro()
    if (look !== undefined) lookAtual = look
    agendar()
  }

  /**
   * Muda a vista: `zoom` ('encaixar' ou número: 1 = 100%, um pixel da foto por pixel do aparelho), `x` e `y` (o centro,
   * de 0 a 1 do quadro), `comparar` (null ou { posicao: 0..1, antes?: ajustes }), `avisos` (bool ou { altas, sombras }),
   * `tela` ('srgb' | 'p3' | 'rec2020') e, opcional, `largura` e `altura` do visor em pixels do aparelho.
   */
  function ver(mudancas = {}) {
    Object.assign(vista, mudancas)
    agendar()
  }

  /** Histogramas do que está na tela: { tela, cena } (ver src/motor/histograma.js). Lidos sem travar o quadro. */
  async function histograma() {
    if (!foto) throw new Error('Nenhuma foto aberta.')
    if (modo === 'gpu' && motor) {
      try {
        return await motor.histograma(ajustes)
      } catch (erro) {
        if (!(erro instanceof ErroGpu)) throw erro
      }
    }
    return pedir('histograma', { id: foto.id })
  }

  /** Exposição e branco automáticos da foto aberta: { exposicao, branco: { temperatura, tinta, mudou }, porque }. */
  async function auto() {
    if (!foto) throw new Error('Nenhuma foto aberta.')
    return pedir('auto', { id: foto.id })
  }

  /**
   * Revela em resolução cheia: { largura, altura, dados (8 bits: Uint8ClampedArray RGBA; 16: Uint16Array RGB), espaco,
   * motor: 'gpu' | 'js', ms }. Na placa (de verdade) em ladrilhos de LADRILHO px lendo de volta; sem ela, no JS do
   * worker, em faixas. `opcoes`: tela, bits, lado (lado maior pedido), aoProgredir(0..1), sinal (AbortSignal), motor
   * ('auto' | 'gpu' | 'js'), look (padrão: o do último `ajustar`).
   */
  async function exportarPixels(ajustesE, opcoes = {}) {
    const { tela = 'srgb', bits = 8, lado = null, aoProgredir = null, sinal = null, motor: qual = 'auto', look = lookAtual } = opcoes
    if (!foto) throw new Error('Nenhuma foto aberta.')
    const t0 = performance.now()
    const naGpu = qual === 'gpu' ? modo === 'gpu' : qual === 'auto' && modo === 'gpu' && !motor?.info.software
    const a = normalizar(ajustesE)
    if (sinal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError')
    if (!naGpu) {
      const pedido = { id: foto.id, ajustes: a, tela, bits, lado, semente: foto.semente, look: a.look.id ? look : null }
      const r = await pedir('exportar', pedido, { progresso: aoProgredir, sinal })
      if (!r) throw new DOMException('Exportação cancelada.', 'AbortError')
      return { ...r, motor: 'js', ms: performance.now() - t0 }
    }
    const f = foto
    const meta = await metaCheia()
    const geo = geometria(meta, a)
    const zoom = lado ? Math.min(1, lado / Math.max(geo.largura, geo.altura)) : 1
    const W = Math.max(1, Math.round(geo.largura * zoom))
    const H = Math.max(1, Math.round(geo.altura * zoom))
    const canais = bits === 8 ? 4 : 3
    const dados = bits === 8 ? new Uint8ClampedArray(W * H * 4) : new Uint16Array(W * H * 3)
    const local = temLocal(a)
    const margem = local ? margemLocal(a, { largura: geo.largura * zoom, altura: geo.altura * zoom }, zoom) / zoom : 0
    const total = Math.ceil(W / LADRILHO) * Math.ceil(H / LADRILHO)
    let feitos = 0
    try {
      for (let ty = 0; ty < H; ty += LADRILHO) {
        for (let tx = 0; tx < W; tx += LADRILHO) {
          if (sinal?.aborted || fechada || foto !== f) throw new DOMException('Exportação cancelada.', 'AbortError')
          const w = Math.min(LADRILHO, W - tx)
          const h = Math.min(LADRILHO, H - ty)
          const regiao = { x: tx / zoom, y: ty / zoom, largura: w / zoom, altura: h / zoom }
          const r = prenderNaBase(retanguloNaBase(geo, regiao, margem + 3), meta)
          const j = await pedir('janela', { id: f.id, ...r })
          if (!motor) throw new ErroGpu('contexto-perdido', TEXTOS.perdeu)
          motor.carregarBase({ ...meta, imagem: { ...meta.imagem, dados: j.dados } }, { janela: j.janela, referencia: f.base, corte: corteDaBase(meta) })
          naPlaca = null
          motor.desenhar(a, { alvo: 'textura', regiao, zoom, semente: f.semente, tela, look })
          const lido = motor.ler({ tipo: 'float' })
          const fonte = lido.dados
          for (let y = 0; y < h; y++) {
            let o = ((ty + y) * W + tx) * canais
            for (let x = 0, i = y * w * 4; x < w; x++, i += 4, o += canais) {
              if (bits === 8) {
                dados[o] = Math.round(fonte[i] * 255)
                dados[o + 1] = Math.round(fonte[i + 1] * 255)
                dados[o + 2] = Math.round(fonte[i + 2] * 255)
                dados[o + 3] = 255
              } else {
                for (let c = 0; c < 3; c++) {
                  const v = fonte[i + c]
                  dados[o + c] = v <= 0 ? 0 : v >= 1 ? 65535 : (v * 65535 + 0.5) | 0
                }
              }
            }
          }
          feitos++
          aoProgredir?.(feitos / total)
          // devolve a vez ao navegador entre ladrilhos (a tela não congela)
          await new Promise((ok) => setTimeout(ok, 0))
        }
      }
    } finally {
      naPlaca = null
      agendar()
    }
    return { largura: W, altura: H, dados, espaco: tela, motor: 'gpu', ms: performance.now() - t0 }
  }

  /** O que está no canvas agora: { largura, altura, dados: RGBA 8 bits } (para testes e capturas). */
  function lerTela() {
    if (modo === 'gpu' && motor) return motor.ler({ tipo: 'uint8' })
    const ctx = superficie2d()
    const { width: w, height: h } = ctx.canvas
    return { largura: w, altura: h, dados: new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer) }
  }

  function fechar() {
    fechada = true
    if (pedido) cancelAnimationFrame(pedido)
    pedido = 0
    worker.terminate()
    for (const p of pendentes.values()) p.falhou(Object.assign(new Error('A sessão foi fechada.'), { codigo: 'fechada' }))
    pendentes.clear()
    try {
      motor?.liberar()
    } catch {
      // contexto já perdido
    }
    motor = null
    soltarAuxiliar()
    foto = null
  }

  /** O estado para a tela: motor em uso, renderizador, avisos da sessão e a vista. */
  function estado() {
    return {
      motor: modo,
      renderizador: motor?.info.renderizador ?? sonda?.renderizador ?? '',
      avisos: [...avisos],
      vista: { ...vista },
      aberta: !!foto,
      reduzir: foto?.reduzir ?? null,
      memoria: MEMORIA,
    }
  }

  return { abrir, ajustar, ver, histograma, auto, exportarPixels, lerTela, fechar, estado }
}
