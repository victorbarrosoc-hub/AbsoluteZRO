// Revela · reduz o quadro na placa de vídeo (WebGL2) para o Converter. Sem isto, o Mediabunny reduz num canvas 2D,
// que no iPhone e em aparelhos fracos copia o quadro 4K inteiro para a CPU a cada quadro: era o que deixava um clipe
// 4K → 720p andando a um quarto do tempo real. Aqui o quadro sobe como textura, a placa monta os mipmaps (média de
// caixa, sem serrilhado na redução forte) e desenha já no tamanho final; o quadro de saída sai do próprio canvas WebGL.
//
// Cobre o que o Converter pede: caber (contain) ou preencher (fill), com a rotação do celular (vídeo em pé). Recorte,
// espelho, falta de WebGL2 ou WebGL sem placa de vídeo (SwiftShader, llvmpipe: ali o canvas 2D é mais rápido): devolve
// null e o Mediabunny segue pelo caminho dele.

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
uniform vec4 caixa; // x, y, largura, altura da imagem dentro da saída (0–1, de cima para baixo)
uniform int giro;   // 0, 1, 2, 3 = 0°, 90°, 180°, 270° no sentido do relógio
void main() {
  vec2 s = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); // 0–1 na saída, de cima para baixo
  vec2 q = (s - caixa.xy) / caixa.zw;            // 0–1 dentro da imagem
  if (giro == 1) q = vec2(q.y, 1.0 - q.x);
  else if (giro == 2) q = vec2(1.0 - q.x, 1.0 - q.y);
  else if (giro == 3) q = vec2(1.0 - q.y, q.x);
  uv = q;
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 cor;
uniform sampler2D quadro;
void main() {
  // fora da imagem (faixas do contain): preto
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) cor = vec4(0.0, 0.0, 0.0, 1.0);
  else cor = vec4(texture(quadro, uv).rgb, 1.0);
}`

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo)
  gl.shaderSource(s, fonte)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

/** Onde a imagem (larguraFonte × alturaFonte, já girada) cai numa saída largura × altura, em frações 0–1. */
export function caixaDaImagem(larguraFonte, alturaFonte, largura, altura, fit) {
  if (fit !== 'contain') return [0, 0, 1, 1]
  const escala = Math.min(largura / larguraFonte, altura / alturaFonte)
  const w = (larguraFonte * escala) / largura
  const h = (alturaFonte * escala) / altura
  return [(1 - w) / 2, (1 - h) / 2, w, h]
}

/**
 * Transformador para `registerVideoSampleTransformer` do Mediabunny: `(amostra, descricao) → VideoSample | null`.
 * `VideoSample` é a classe do Mediabunny (passada para não carregar o pacote duas vezes).
 */
export function criarEscalaGpu(VideoSample, { aoUsar, forcar = false } = {}) {
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoFrame === 'undefined') return () => null
  let gl = null
  let tela = null
  let falhou = false
  let u = null
  let tQuadro = null

  function preparar() {
    tela = new OffscreenCanvas(16, 16)
    gl = tela.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('sem WebGL2')
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    if (!forcar && SOFTWARE.test(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))) {
      gl = null
      return false
    }
    const prog = gl.createProgram()
    gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'programa')
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const p = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(p)
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0)
    tQuadro = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tQuadro)
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ])
      gl.texParameteri(gl.TEXTURE_2D, k, v)
    gl.uniform1i(gl.getUniformLocation(prog, 'quadro'), 0)
    u = { caixa: gl.getUniformLocation(prog, 'caixa'), giro: gl.getUniformLocation(prog, 'giro') }
    return true
  }

  return (amostra, d) => {
    if (falhou || d.flip || !['contain', 'fill'].includes(d.fit)) return null
    const giro = ((d.rotation % 360) + 360) % 360
    const [rw, rh] = giro % 180 === 0 ? [amostra.squarePixelWidth, amostra.squarePixelHeight] : [amostra.squarePixelHeight, amostra.squarePixelWidth]
    if (d.crop.left !== 0 || d.crop.top !== 0 || d.crop.width !== rw || d.crop.height !== rh) return null
    try {
      if (!gl && !preparar()) {
        falhou = true
        return null
      }
      if (tela.width !== d.width || tela.height !== d.height) {
        tela.width = d.width
        tela.height = d.height
      }
      gl.viewport(0, 0, d.width, d.height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tQuadro)
      // o quadro decodificado sobe direto (YUV → RGB na placa, com a cor do próprio quadro)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, amostra.toCanvasImageSource())
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.uniform4f(u.caixa, ...caixaDaImagem(rw, rh, d.width, d.height, d.fit))
      gl.uniform1i(u.giro, giro / 90)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      const saida = new VideoSample(tela, { timestamp: amostra.timestamp, duration: amostra.duration, rotation: 0, flip: false })
      aoUsar?.()
      return saida
    } catch (e) {
      falhou = true // uma vez só: o resto do clipe vai pelo canvas do Mediabunny
      console.warn('escala na GPU indisponível, seguindo pelo canvas', e)
      return null
    }
  }
}
