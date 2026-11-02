// Remover fundo verde na placa de vídeo (WebGL2): a conta de src/chroma.js (FRAG_CHROMA) sobre o quadro, com alfa.
// Um Recorte desenha num canvas próprio (o da prévia, por cima do <video>, ou um OffscreenCanvas no render) e devolve
// esse canvas para quem compõe. Sem WebGL2 o recorte não roda e quem chamou diz isso (nunca some calado).

import { FRAG_CHROMA, canalDaChave, corDaBorda, rgb } from '../src/chroma.js'

const VERT = `#version 300 es
in vec2 a_pos;
uniform vec4 u_ret;
out vec2 v_uv;
void main() {
  v_uv = a_pos; // a linha 0 da imagem é o topo, e o topo da tela é y = 0 aqui
  vec2 p = u_ret.xy + a_pos * u_ret.zw;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`

export class Recorte {
  /** tela: canvas (do DOM ou OffscreenCanvas) onde o recorte é desenhado. */
  constructor(tela) {
    this.tela = tela
    const gl = tela.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })
    this.gl = gl
    if (!gl) return
    const sh = (tipo, src) => {
      const s = gl.createShader(tipo)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
      return s
    }
    const prog = gl.createProgram()
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG_CHROMA))
    gl.linkProgram(prog)
    gl.useProgram(prog)
    this.u = Object.fromEntries(['u_img', 'u_chave', 'u_canal', 'u_tol', 'u_suave', 'u_derr', 'u_ret'].map((n) => [n, gl.getUniformLocation(prog, n)]))
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    this.tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
  }

  get pronto() {
    return Boolean(this.gl)
  }

  /**
   * Desenha `fonte` (vídeo, canvas, bitmap) recortada no retângulo `ret` { x, y, w, h } da tela (pixels; padrão: a
   * tela inteira) e limpa o resto. aj: ajustes do clipe (src/chroma.js). Devolve a tela.
   */
  desenhar(fonte, aj, ret = { x: 0, y: 0, w: this.tela.width, h: this.tela.height }) {
    const gl = this.gl
    if (!gl) throw new Error('Sem WebGL2 neste computador: o recorte de fundo não roda aqui.')
    const W = this.tela.width
    const H = this.tela.height
    gl.viewport(0, 0, W, H)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte)
    const chave = rgb(aj.cor)
    gl.uniform1i(this.u.u_img, 0)
    gl.uniform3f(this.u.u_chave, ...chave)
    gl.uniform1i(this.u.u_canal, canalDaChave(chave))
    gl.uniform1f(this.u.u_tol, aj.tolerancia)
    gl.uniform1f(this.u.u_suave, aj.suavidade)
    gl.uniform1f(this.u.u_derr, aj.derramamento)
    gl.uniform4f(this.u.u_ret, ret.x / W, ret.y / H, ret.w / W, ret.h / H)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return this.tela
  }
}

/** A cor do fundo de um quadro (vídeo, canvas, bitmap), medida na borda numa miniatura de 160 px. */
export function medirCor(fonte, w, h) {
  const k = Math.min(1, 160 / Math.max(w, h))
  const mw = Math.max(8, Math.round(w * k))
  const mh = Math.max(8, Math.round(h * k))
  const c = new OffscreenCanvas(mw, mh)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(fonte, 0, 0, mw, mh)
  return corDaBorda(ctx.getImageData(0, 0, mw, mh).data, mw, mh)
}
