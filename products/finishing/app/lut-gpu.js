// Revela · aplica uma LUT 3D em cada quadro de vídeo na placa de vídeo (WebGL2), para o Converter levar o log da câmera
// ao Rec.709 sem custo de CPU por pixel. A LUT vai numa textura 3D de meia precisão (sem degraus); o filtro linear do
// hardware faz a interpolação trilinear.
//
// Nível de dados: o navegador entrega o quadro decodificado com a faixa de vídeo (16–235) já esticada para 0–1. As
// curvas log das câmeras são definidas sobre o código cheio (÷1023), então o shader desfaz o esticamento antes de ler
// a LUT quando o arquivo é de faixa de vídeo.

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  // y invertido: o readPixels lê de baixo para cima, então o quadro sai de pé no buffer
  uv = vec2(p.x * 0.5 + 0.5, 0.5 + p.y * 0.5);
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 uv;
out vec4 cor;
uniform sampler2D quadro;
uniform sampler3D lut;
uniform float n;
uniform bool faixaVideo;
void main() {
  vec3 c = texture(quadro, uv).rgb;
  if (faixaVideo) c = (c * 876.0 + 64.0) / 1023.0;
  vec3 t = clamp(c, 0.0, 1.0) * ((n - 1.0) / n) + 0.5 / n;
  cor = vec4(texture(lut, t).rgb, 1.0);
}`

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo)
  gl.shaderSource(s, fonte)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

/** `lut` no formato de `assar()` (src/cor/cube.js). Devolve `aplicar(fonte, largura, altura, faixaVideo) → Uint8Array RGBA`. */
export function criarAplicadorLut(lut) {
  const tela = new OffscreenCanvas(16, 16)
  const gl = tela.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: false })
  if (!gl) throw new Error('Este navegador não tem WebGL2 para aplicar a LUT.')
  const prog = gl.createProgram()
  gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'programa')
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const p = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(p)
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0)

  // LUT: textura 3D RGB16F (meia precisão, filtrável), o vermelho variando mais rápido como no .cube
  const n = lut.tamanho
  const tLut = gl.createTexture()
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_3D, tLut)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, n, n, n, 0, gl.RGB, gl.FLOAT, lut.dados)
  for (const [k, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_3D, k, v)

  const tQuadro = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tQuadro)
  for (const [k, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, k, v)

  gl.uniform1i(gl.getUniformLocation(prog, 'quadro'), 0)
  gl.uniform1i(gl.getUniformLocation(prog, 'lut'), 1)
  gl.uniform1f(gl.getUniformLocation(prog, 'n'), n)
  const uFaixa = gl.getUniformLocation(prog, 'faixaVideo')

  return {
    aplicar(fonte, largura, altura, faixaVideo) {
      if (tela.width !== largura || tela.height !== altura) {
        tela.width = largura
        tela.height = altura
      }
      gl.viewport(0, 0, largura, altura)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tQuadro)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte)
      gl.uniform1i(uFaixa, faixaVideo ? 1 : 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      const saida = new Uint8Array(largura * altura * 4)
      gl.readPixels(0, 0, largura, altura, gl.RGBA, gl.UNSIGNED_BYTE, saida)
      return saida
    },
  }
}
