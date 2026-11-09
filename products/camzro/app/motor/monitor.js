// CAMZRO · o monitor. A imagem da câmera passa por um shader (WebGL2) que, num passo só, na placa de vídeo:
// aplica a LUT de monitor (textura 3D, trilinear), mostra a falsa cor, a zebra, o focus peaking (Sobel na luma), o
// preto e branco e a lupa de foco. As medidas saem do sinal GRAVADO (antes da LUT): o que a tela diz é o que o
// arquivo tem. Uma cópia pequena (192×108) volta para a CPU ~10 vezes por segundo para os scopes.
// Sem WebGL2, o vídeo aparece direto e as ferramentas somem (a tela diz por quê).

import { faixasParaShader } from '../nucleo/cor.js'

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 uv;
out vec4 cor;
uniform sampler2D video;
uniform sampler3D lut;
uniform vec2 texel;        // 1 / tamanho do vídeo
uniform float usaLut;      // 0 ou 1
uniform vec2 lutEscala;    // (n − 1) / n, 0,5 / n
uniform float modoFalsa;   // 0 desligada, 1 ligada
uniform float faixas[40];  // 8 × [de, até, r, g, b] em 0–1
uniform float zebraModo;   // 0 desligada, 1 acima, 2 faixa
uniform float zebraNivel;  // 0–1
uniform float pico;        // 0 desligado, senão o limiar
uniform vec3 picoCor;
uniform float picoPasso;   // em texels do vídeo
uniform float mono;
uniform vec3 lupa;         // x, y (0–1) e zoom (1 = sem lupa)
uniform float tempo;
uniform float escalaY;     // 1 normal, −1 espelhado (câmera da frente)

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 st = vec2(uv.x, 1.0 - uv.y);
  if (escalaY < 0.0) st.x = 1.0 - st.x;
  st = lupa.xy + (st - lupa.xy) / lupa.z;
  vec3 c = texture(video, st).rgb;
  float y = luma(c);
  vec3 saida = c;
  if (usaLut > 0.5) saida = texture(lut, clamp(c, 0.0, 1.0) * lutEscala.x + lutEscala.y).rgb;
  if (mono > 0.5) saida = vec3(luma(saida));
  if (modoFalsa > 0.5) {
    vec3 cinza = vec3(y * 0.85 + 0.05);
    saida = cinza;
    for (int i = 7; i >= 0; i--) {
      float de = faixas[i * 5];
      float ate = faixas[i * 5 + 1];
      if (de <= ate && y >= de && (y < ate || ate >= 9.0)) saida = vec3(faixas[i * 5 + 2], faixas[i * 5 + 3], faixas[i * 5 + 4]);
    }
  }
  if (zebraModo > 0.5) {
    bool z = zebraModo < 1.5 ? y >= zebraNivel : abs(y - zebraNivel) <= 0.05;
    float listra = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y - tempo * 24.0) / 10.0));
    if (z) saida = mix(saida, vec3(listra), 0.85);
  }
  if (pico > 0.0) {
    vec2 d = texel * picoPasso;
    float a = luma(texture(video, st + vec2(-d.x, -d.y)).rgb);
    float b = luma(texture(video, st + vec2(0.0, -d.y)).rgb);
    float e = luma(texture(video, st + vec2(d.x, -d.y)).rgb);
    float f = luma(texture(video, st + vec2(-d.x, 0.0)).rgb);
    float h = luma(texture(video, st + vec2(d.x, 0.0)).rgb);
    float i = luma(texture(video, st + vec2(-d.x, d.y)).rgb);
    float j = luma(texture(video, st + vec2(0.0, d.y)).rgb);
    float k = luma(texture(video, st + vec2(d.x, d.y)).rgb);
    float gx = -a - 2.0 * f - i + e + 2.0 * h + k;
    float gy = -a - 2.0 * b - e + i + 2.0 * j + k;
    float g = sqrt(gx * gx + gy * gy);
    if (g > pico) saida = mix(saida, picoCor, smoothstep(pico, pico * 1.6, g));
  }
  cor = vec4(saida, 1.0);
}`

// cópia pequena para os scopes: o sinal gravado, sem nada por cima
const FRAG_SCOPE = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 cor;
uniform sampler2D video;
void main() { cor = vec4(texture(video, vec2(uv.x, 1.0 - uv.y)).rgb, 1.0); }`

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo)
  gl.shaderSource(s, fonte)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}
function programa(gl, frag) {
  const p = gl.createProgram()
  gl.attachShader(p, compilar(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, compilar(gl, gl.FRAGMENT_SHADER, frag))
  gl.bindAttribLocation(p, 0, 'p')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'programa')
  return p
}

export const SCOPE_L = 192
export const SCOPE_A = 108

/**
 * Cria o monitor num <canvas> para o <video> da câmera. opcoes() devolve as ferramentas ligadas a cada quadro:
 * { lut (textura do nucleo/lut.js paraTextura, ou null), falsaCor: escala|null, zebra: { modo, nivel }|null,
 *   pico: { sensibilidade 0–1, cor [r,g,b] }|null, mono, lupa: { x, y, zoom }|null, espelho }.
 * aoScope(rgba, largura, altura) recebe a cópia pequena (~10 por segundo).
 */
export function criarMonitor(canvas, video, { opcoes, aoScope = null } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
  if (!gl) return null
  let prog
  let progScope
  try {
    prog = programa(gl, FRAG)
    progScope = programa(gl, FRAG_SCOPE)
  } catch {
    return null
  }
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const texVideo = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texVideo)
  for (const [k, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, k, v)

  const texLut = gl.createTexture()
  let lutCarregada = null
  function subirLut(l) {
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_3D, texLut)
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE],
    ])
      gl.texParameteri(gl.TEXTURE_3D, k, v)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, l.tamanho, l.tamanho, l.tamanho, 0, gl.RGBA, gl.FLOAT, l.rgba)
    gl.activeTexture(gl.TEXTURE0)
    lutCarregada = l
  }

  // alvo pequeno dos scopes
  const texScope = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texScope)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SCOPE_L, SCOPE_A, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texScope, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  const pixels = new Uint8Array(SCOPE_L * SCOPE_A * 4)

  const u = {}
  for (const n of ['video', 'lut', 'texel', 'usaLut', 'lutEscala', 'modoFalsa', 'faixas', 'zebraModo', 'zebraNivel', 'pico', 'picoCor', 'picoPasso', 'mono', 'lupa', 'tempo', 'escalaY']) u[n] = gl.getUniformLocation(prog, n)
  const uScopeVideo = gl.getUniformLocation(progScope, 'video')
  let escalaFalsa = null
  let faixas = null
  let ultimoScope = 0
  let vivo = true
  let pedido = 0
  let quadros = 0
  let inicioQuadros = performance.now()
  let fpsMonitor = 0

  function desenhar(agora = performance.now()) {
    if (!vivo) return
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh || video.readyState < 2) return agendar()
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }
    const o = opcoes()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texVideo)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    if (o.lut && o.lut !== lutCarregada) subirLut(o.lut)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, cw, ch)
    gl.useProgram(prog)
    gl.uniform1i(u.video, 0)
    gl.uniform1i(u.lut, 1)
    gl.uniform2f(u.texel, 1 / vw, 1 / vh)
    const usaLut = Boolean(o.lut)
    gl.uniform1f(u.usaLut, usaLut ? 1 : 0)
    if (usaLut) gl.uniform2f(u.lutEscala, (o.lut.tamanho - 1) / o.lut.tamanho, 0.5 / o.lut.tamanho)
    if (o.falsaCor && o.falsaCor !== escalaFalsa) {
      escalaFalsa = o.falsaCor
      faixas = faixasParaShader(o.falsaCor).map((v) => (v >= 10 ? 10 : v))
    }
    gl.uniform1f(u.modoFalsa, o.falsaCor ? 1 : 0)
    if (o.falsaCor) gl.uniform1fv(u.faixas, faixas)
    gl.uniform1f(u.zebraModo, o.zebra ? (o.zebra.modo === 'faixa' ? 2 : 1) : 0)
    gl.uniform1f(u.zebraNivel, (o.zebra?.nivel ?? 95) / 100)
    // sensibilidade 0–1 → limiar do gradiente (mais sensível = limiar menor)
    gl.uniform1f(u.pico, o.pico ? 0.12 + (1 - o.pico.sensibilidade) * 0.6 : 0)
    gl.uniform3fv(u.picoCor, o.pico?.cor || [1, 0.2, 0.2])
    gl.uniform1f(u.picoPasso, Math.max(1, vw / Math.max(1, cw)))
    gl.uniform1f(u.mono, o.mono ? 1 : 0)
    gl.uniform3f(u.lupa, o.lupa?.x ?? 0.5, o.lupa?.y ?? 0.5, o.lupa?.zoom ?? 1)
    gl.uniform1f(u.tempo, agora / 1000)
    gl.uniform1f(u.escalaY, o.espelho ? -1 : 1)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    if (aoScope && agora - ultimoScope > 100) {
      ultimoScope = agora
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.viewport(0, 0, SCOPE_L, SCOPE_A)
      gl.useProgram(progScope)
      gl.uniform1i(uScopeVideo, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.readPixels(0, 0, SCOPE_L, SCOPE_A, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      aoScope(pixels, SCOPE_L, SCOPE_A)
    }
    quadros++
    if (agora - inicioQuadros > 1000) {
      fpsMonitor = (quadros * 1000) / (agora - inicioQuadros)
      quadros = 0
      inicioQuadros = agora
    }
    agendar()
  }
  const temRvfc = typeof video.requestVideoFrameCallback === 'function'
  function agendar() {
    if (!vivo) return
    // zebra anda mesmo com a imagem parada; o resto só redesenha quando chega quadro novo
    pedido = temRvfc ? video.requestVideoFrameCallback((t) => desenhar(t)) : requestAnimationFrame(desenhar)
  }
  agendar()

  return {
    gl,
    fps: () => fpsMonitor,
    /** Lê a cor média de um ponto (0–1) do sinal gravado (conta-gotas do balanço de branco). */
    amostra(x, y) {
      const i = (Math.min(SCOPE_A - 1, Math.floor((1 - y) * SCOPE_A)) * SCOPE_L + Math.min(SCOPE_L - 1, Math.floor(x * SCOPE_L))) * 4
      return [pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255]
    },
    destruir() {
      vivo = false
      if (temRvfc) video.cancelVideoFrameCallback?.(pedido)
      else cancelAnimationFrame(pedido)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
