// Relay · redução e ampliação em Lanczos-3 na placa de vídeo (WebGL2), o mesmo filtro do HandBrake e do ffmpeg.
//
// Por quê: o canvas do navegador reduz com mipmaps/bilinear, que borra (4K → 1080p perde a textura fina) ou
// serrilha. Aqui são duas passadas separáveis (horizontal e vertical) com o núcleo alargado na redução (antialias,
// raio 3 / escala), pesos normalizados e a passada do meio em ponto flutuante (sem banding dos lóbulos negativos).
// A rotação do celular (vídeo em pé gravado deitado) entra na primeira passada; caber (contain, com faixas), preencher
// (cover, corta) e esticar (fill) saem do mesmo mapa.
//
// Saída em I420 BT.709 de faixa de TV, montada aqui (duas passadas a mais: luma e croma empacotadas em RGBA e lidas de
// volta): o navegador não converte RGB → YUV por conta própria (cada um usa uma matriz e marca a transferência como
// sRGB). Largura que não divide por 8 sai pelo canvas, em RGBA.
//
// Sem WebGL2, com recorte ou espelho, ou em WebGL de software (SwiftShader, llvmpipe: lento demais), devolve null e o
// Mediabunny segue pelo canvas dele. `forcar` usa a placa mesmo em software (testes e laboratório).

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`

// Passada 1: lê o quadro (com a rotação) e filtra no eixo X da saída. Passada 2: filtra no eixo Y.
// `escala` = saída / fonte no eixo; `desloc` = onde a imagem começa na saída (px); `n` = tamanho da fonte no eixo.
const FRAG = (passada) => `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D fonte;
uniform float escala;
uniform float desloc;
uniform int n;
uniform int giro;        // só na passada 1: 0, 1, 2, 3 = 0°, 90°, 180°, 270° no sentido do relógio
uniform ivec2 tamFonte;  // largura e altura da textura de origem
uniform float alturaSaida; // passada 2 no canvas: ele conta as linhas de baixo para cima
uniform float inverter;    // 1 = canvas (desvira), 0 = textura (linha k = linha k da imagem)
out vec4 cor;
const float PI = 3.141592653589793;
float lanczos(float x) {
  x = abs(x);
  if (x < 1e-5) return 1.0;
  if (x >= 3.0) return 0.0;
  float px = PI * x;
  return 3.0 * sin(px) * sin(px / 3.0) / (px * px);
}
vec4 ler(int i, int j) {
  ${
    passada === 1
      ? `// (i, j) na imagem girada → texel no quadro decodificado
  ivec2 t;
  if (giro == 0) t = ivec2(i, j);
  else if (giro == 1) t = ivec2(j, tamFonte.y - 1 - i);
  else if (giro == 2) t = ivec2(tamFonte.x - 1 - i, tamFonte.y - 1 - j);
  else t = ivec2(tamFonte.x - 1 - j, i);
  return texelFetch(fonte, t, 0);`
      : `return texelFetch(fonte, ivec2(j, i), 0);`
  }
}
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  float pos = ${passada === 1 ? 'gl_FragCoord.x' : 'inverter > 0.5 ? alturaSaida - gl_FragCoord.y : gl_FragCoord.y'};
  int outro = ${passada === 1 ? 'o.y' : 'o.x'};
  // centro do pixel de saída na fonte
  float c = (pos - desloc) / escala - 0.5;
  if (c < -0.5 || c > float(n) - 0.5) { cor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float s = min(escala, 1.0);           // na redução, o núcleo alarga (antialias)
  float raio = 3.0 / s;
  int a = int(floor(c - raio)) + 1;
  int b = int(floor(c + raio));
  vec4 soma = vec4(0.0);
  float pesos = 0.0;
  for (int i = a; i <= b; i++) {
    float w = lanczos((float(i) - c) * s);
    soma += w * ler(clamp(i, 0, n - 1), outro);
    pesos += w;
  }
  cor = vec4(clamp(soma.rgb / pesos, 0.0, 1.0), 1.0);
}`

// RGB (0–1) → Y'CbCr BT.709 de faixa de TV (H.273 matriz 1), em 0–1 para o RGBA8 arredondar
const YUV = `
float luma(vec3 c) { return (16.0 + 219.0 * dot(c, vec3(0.2126, 0.7152, 0.0722))) / 255.0; }
float cb(vec3 c) { return (128.0 + 224.0 * dot(c, vec3(-0.114572, -0.385428, 0.5))) / 255.0; }
float cr(vec3 c) { return (128.0 + 224.0 * dot(c, vec3(0.5, -0.454153, -0.045847))) / 255.0; }`

// Luma: cada texel de saída leva 4 pixels vizinhos da linha (largura / 4)
const FRAG_Y = `#version 300 es
precision highp float;
uniform sampler2D fonte;
out vec4 cor;
${YUV}
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  vec4 r;
  for (int k = 0; k < 4; k++) r[k] = luma(texelFetch(fonte, ivec2(o.x * 4 + k, o.y), 0).rgb);
  cor = r;
}`

// Croma 4:2:0: média do bloco 2×2 (o Cb e o Cr são lineares no RGB), 4 amostras por texel (largura / 8)
const FRAG_UV = `#version 300 es
precision highp float;
uniform sampler2D fonte;
uniform int canal; // 0 = Cb, 1 = Cr
out vec4 cor;
${YUV}
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  vec4 r;
  for (int k = 0; k < 4; k++) {
    ivec2 p = ivec2((o.x * 4 + k) * 2, o.y * 2);
    vec3 m = (texelFetch(fonte, p, 0).rgb + texelFetch(fonte, p + ivec2(1, 0), 0).rgb + texelFetch(fonte, p + ivec2(0, 1), 0).rgb + texelFetch(fonte, p + ivec2(1, 1), 0).rgb) * 0.25;
    r[k] = canal == 0 ? cb(m) : cr(m);
  }
  cor = r;
}`

/** A cor da saída em I420. */
export const COR_SAIDA = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo)
  gl.shaderSource(s, fonte)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

/**
 * Onde a imagem (rw × rh, já girada) cai numa saída largura × altura: escala e deslocamento por eixo, em pixels.
 * contain: cabe inteira (faixas); cover: preenche (corta); fill: estica nos dois eixos.
 */
export function mapa(rw, rh, largura, altura, fit) {
  if (fit === 'fill') return { ex: largura / rw, ey: altura / rh, dx: 0, dy: 0 }
  const e = fit === 'cover' ? Math.max(largura / rw, altura / rh) : Math.min(largura / rw, altura / rh)
  return { ex: e, ey: e, dx: (largura - rw * e) / 2, dy: (altura - rh * e) / 2 }
}

/** Pesos de Lanczos-3 (para os testes conferirem o núcleo sem placa de vídeo). */
export function lanczos(x) {
  x = Math.abs(x)
  if (x < 1e-5) return 1
  if (x >= 3) return 0
  const px = Math.PI * x
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px)
}

/**
 * Transformador para `registerVideoSampleTransformer` do Mediabunny. Devolve { transformar, usada(), zerar() }:
 * `usada()` = 'lanczos' se algum quadro passou pela placa desde o último `zerar()`, senão 'canvas'.
 */
export function criarEscala(VideoSample, { forcar = false } = {}) {
  let usou = false
  const resultado = { transformar: () => null, usada: () => (usou ? 'lanczos' : 'canvas'), zerar: () => (usou = false) }
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoFrame === 'undefined') return resultado
  let gl = null
  let tela = null
  let falhou = false
  let p1 = null
  let p2 = null
  let tQuadro = null
  let tMeio = null
  let fbMeio = null
  let flutuante = false
  let meioTam = [0, 0]
  let pY = null
  let pUV = null
  let tFinal = null
  let fbFinal = null
  let planos = null // { w, h, tY, tU, tV, fbY, fbU, fbV }

  function programa(fonteFrag) {
    const prog = gl.createProgram()
    gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, fonteFrag))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'programa')
    const u = (n) => gl.getUniformLocation(prog, n)
    const loc = gl.getAttribLocation(prog, 'p')
    return { prog, loc, fonte: u('fonte'), escala: u('escala'), desloc: u('desloc'), n: u('n'), giro: u('giro'), tamFonte: u('tamFonte'), alturaSaida: u('alturaSaida'), inverter: u('inverter'), canal: u('canal') }
  }

  function textura() {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
      [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ])
      gl.texParameteri(gl.TEXTURE_2D, k, v)
    return t
  }

  function montarGl() {
    tela = new OffscreenCanvas(16, 16)
    gl = tela.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('sem WebGL2')
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    if (!forcar && SOFTWARE.test(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))) {
      gl = null
      return false
    }
    flutuante = Boolean(gl.getExtension('EXT_color_buffer_float'))
    p1 = programa(FRAG(1))
    p2 = programa(FRAG(2))
    pY = programa(FRAG_Y)
    pUV = programa(FRAG_UV)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    tQuadro = textura()
    tMeio = textura()
    fbMeio = gl.createFramebuffer()
    tFinal = textura()
    fbFinal = gl.createFramebuffer()
    return true
  }

  /** Textura de `w × h` presa a um framebuffer (RGBA16F se der, para o meio; RGBA8 para os planos lidos de volta). */
  function alvo(t, fb, w, h, flut) {
    gl.bindTexture(gl.TEXTURE_2D, t)
    if (flut) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
  }

  /** Lê o quadro final (em tFinal) como I420: Y, Cb e Cr empacotados em RGBA8, um plano por passada. */
  function lerI420(w, h) {
    if (!planos || planos.w !== w || planos.h !== h) {
      planos = { w, h, tY: textura(), tU: textura(), tV: textura(), fbY: gl.createFramebuffer(), fbU: gl.createFramebuffer(), fbV: gl.createFramebuffer() }
      alvo(planos.tY, planos.fbY, w / 4, h, false)
      alvo(planos.tU, planos.fbU, w / 8, h / 2, false)
      alvo(planos.tV, planos.fbV, w / 8, h / 2, false)
    }
    const dados = new Uint8Array((w * h * 3) / 2)
    gl.activeTexture(gl.TEXTURE0)
    usar(pY)
    gl.bindTexture(gl.TEXTURE_2D, tFinal)
    gl.bindFramebuffer(gl.FRAMEBUFFER, planos.fbY)
    gl.viewport(0, 0, w / 4, h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.readPixels(0, 0, w / 4, h, gl.RGBA, gl.UNSIGNED_BYTE, dados.subarray(0, w * h))
    usar(pUV)
    for (const [canal, fb, inicio] of [
      [0, planos.fbU, w * h],
      [1, planos.fbV, (w * h * 5) / 4],
    ]) {
      gl.bindTexture(gl.TEXTURE_2D, tFinal)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.viewport(0, 0, w / 8, h / 2)
      gl.uniform1i(pUV.canal, canal)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.readPixels(0, 0, w / 8, h / 2, gl.RGBA, gl.UNSIGNED_BYTE, dados.subarray(inicio, inicio + (w * h) / 4))
    }
    return dados
  }

  function usar(p) {
    gl.useProgram(p.prog)
    gl.enableVertexAttribArray(p.loc)
    gl.vertexAttribPointer(p.loc, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1i(p.fonte, 0)
  }

  /**
   * `preparar(amostra)`: quem chama pode trocar a amostra antes de subir (a cor certa do arquivo); se devolver outra,
   * ela é fechada aqui depois de usada.
   */
  resultado.transformar = async (amostra, d, preparar = null) => {
    if (falhou || d.flip || !['contain', 'fill', 'cover'].includes(d.fit)) return null
    const giro = (((d.rotation % 360) + 360) % 360) / 90
    const [rw, rh] = giro % 2 === 0 ? [amostra.squarePixelWidth, amostra.squarePixelHeight] : [amostra.squarePixelHeight, amostra.squarePixelWidth]
    if (d.crop.left !== 0 || d.crop.top !== 0 || d.crop.width !== rw || d.crop.height !== rh) return null
    let usada = amostra
    try {
      if (!gl && !montarGl()) {
        falhou = true
        return null
      }
      usada = (await preparar?.(amostra)) ?? amostra
      const fonte = usada.toCanvasImageSource()
      // o quadro decodificado sobe como textura (YUV → RGB na placa, com a cor do quadro); 10 bits sobe em meia
      // precisão quando a placa deixa, para não perder os 2 bits na subida
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tQuadro)
      if (flutuante && /P1[02]/.test(usada.format ?? '')) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, fonte)
        } catch {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte)
        }
      } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte)
      const tw = fonte.displayWidth ?? fonte.width
      const th = fonte.displayHeight ?? fonte.height
      // largura/altura da imagem girada em texels (pode diferir de rw/rh se o pixel não for quadrado)
      const [gw, gh] = giro % 2 === 0 ? [tw, th] : [th, tw]
      const m = mapa(gw, gh, d.width, d.height, d.fit)

      // passada 1: largura final × altura da imagem girada
      if (meioTam[0] !== d.width || meioTam[1] !== gh) {
        alvo(tMeio, fbMeio, d.width, gh, flutuante)
        meioTam = [d.width, gh]
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbMeio)
      gl.viewport(0, 0, d.width, gh)
      usar(p1)
      gl.bindTexture(gl.TEXTURE_2D, tQuadro)
      gl.uniform1f(p1.escala, m.ex)
      gl.uniform1f(p1.desloc, m.dx)
      gl.uniform1i(p1.n, gw)
      gl.uniform1i(p1.giro, giro)
      gl.uniform2i(p1.tamFonte, tw, th)
      // a linha k da textura do meio é a linha k da imagem (as duas contadas do mesmo jeito)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // passada 2: tamanho final, numa textura (I420) ou no canvas (RGBA, quando a largura não divide por 8)
      const i420 = d.width % 8 === 0 && d.height % 2 === 0
      if (i420) {
        if (tela.width !== d.width || tela.height !== d.height) {
          tela.width = d.width
          tela.height = d.height
          alvo(tFinal, fbFinal, d.width, d.height, flutuante)
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbFinal)
      } else {
        if (tela.width !== d.width || tela.height !== d.height) {
          tela.width = d.width
          tela.height = d.height
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      }
      gl.viewport(0, 0, d.width, d.height)
      usar(p2)
      gl.bindTexture(gl.TEXTURE_2D, tMeio)
      gl.uniform1f(p2.escala, m.ey)
      gl.uniform1f(p2.desloc, m.dy)
      gl.uniform1i(p2.n, gh)
      gl.uniform1f(p2.alturaSaida, d.height)
      gl.uniform1f(p2.inverter, i420 ? 0 : 1)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      const tempo = { timestamp: amostra.timestamp, duration: amostra.duration }
      const saida = i420
        ? new VideoSample(lerI420(d.width, d.height), { format: 'I420', codedWidth: d.width, codedHeight: d.height, ...tempo, colorSpace: COR_SAIDA })
        : new VideoSample(tela, { ...tempo, rotation: 0, flip: false })
      usou = true
      return saida
    } catch (e) {
      falhou = true // uma vez só: o resto do clipe vai pelo canvas do Mediabunny
      console.warn('Lanczos na placa indisponível, seguindo pelo canvas', e)
      return null
    } finally {
      if (usada !== amostra) usada.close()
    }
  }
  return resultado
}
