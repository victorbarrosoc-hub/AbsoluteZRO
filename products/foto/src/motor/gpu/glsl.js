// Os shaders do espelho do motor Latitude em WebGL2 (GLSL ES 3.00). Cada função aqui é a tradução, passo a passo, de
// uma função do JS — e o comentário diz qual. Os números chegam por `uniformes()` de ponto.js e de tela.js, os mesmos
// que o JS usa: a GPU não decide nada sozinha.
//
// Convenções:
// - Toda textura intermediária guarda a imagem de cima para baixo (linha 0 = topo), como os Float32Array do JS. Só o
//   último passo, o que desenha no canvas, desvira (o framebuffer do canvas conta as linhas de baixo para cima).
// - Matrizes 3×3 sobem em lista plana por linha (como cor/matriz.js) com `transpose = true`.
// - O alfa das texturas de cena carrega os avisos medidos na base (ver AVISO_*), e todo passo de vizinhança o preserva.

export const VERTICE = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const CABECA = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
vec3 cbrt3(vec3 v) { return sign(v) * pow(abs(v), vec3(1.0 / 3.0)); }
`

// ─────────── a cadeia por pixel (ponto.js: nucleo) ───────────

const PONTO = `
uniform mat3 uEntrada;
uniform bool uTom, uCanais, uCalib, uCor, uMist, uTonal, uPb, uVeu, uTemMatiz;
uniform vec3 uNormaPesos;
uniform float uNormaMax;
uniform sampler2D uTabTom;     // R32F: linha 0 = tom, linhas 1 a 3 = canais R, G, B
uniform sampler2D uTabMatiz;   // RGBA32F: linha 0 = (cos Δ, sen Δ, saturação, luz), linha 1 = (P&B, pele, 0, 0)
uniform mat3 uCalibracao, uParaLms, uDeLms, uLmsParaLab, uLabParaLms;
uniform float uSombrasTinta, uSaturacao, uVibracao, uIVib2, uCroma2, uPele;
uniform vec3 uZonaS, uZonaM, uZonaA, uZonaG;   // (a, b, luz) por zona
uniform bool uLuzZona;
uniform vec4 uTonal4;          // (pivô, sombra0, 1/(mistura·largura + largura), alta0)
uniform float uTonalMeioInv;
uniform float uVeuValor;

const float CINZA = 0.18;
const float EPS_PONTO = 0.18 * 1.52587890625e-5;  // 0,18·2^−16 (ponto.js EPS)
const float EV_MIN = -16.0;
const float PASSOS_POR_EV = 64.0;
const float MAX_INDICE = 2048.0;                  // TAM_TOM − 1

// ponto.js ganhoDe: posição na tabela por log2(v/0,18), interpolação linear entre casas
float ganhoDe(int linha, float valor) {
  float pos = clamp((log2(valor / CINZA) - EV_MIN) * PASSOS_POR_EV, 0.0, MAX_INDICE);
  int i = int(pos);
  float a = texelFetch(uTabTom, ivec2(i, linha), 0).r;
  float b = texelFetch(uTabTom, ivec2(i + 1, linha), 0).r;
  return a + (b - a) * (pos - float(i));
}

vec3 aplicarPonto(vec3 v) {
  // 1. entrada: exposição e branco
  v = uEntrada * v;
  // 2. tom pela norma (abaixo de EPS o pixel sobe por soma até a norma EPS)
  if (uTom) {
    float mx = max(v.r, max(v.g, v.b));
    float n = dot(uNormaPesos, v) + uNormaMax * mx;
    float sobe = n < EPS_PONTO ? EPS_PONTO - n : 0.0;
    float k = ganhoDe(0, n < EPS_PONTO ? EPS_PONTO : n);
    v = k * (v + sobe);
  }
  // 3. curva de pontos por canal
  if (uCanais) {
    v = max(v, vec3(EPS_PONTO));
    v = vec3(v.r * ganhoDe(1, v.r), v.g * ganhoDe(2, v.g), v.b * ganhoDe(3, v.b));
  }
  // 4. calibração
  if (uCalib) v = uCalibracao * v;
  // 5. cor em Oklab
  if (uCor) {
    vec3 lab = uLmsParaLab * cbrt3(uParaLms * v);
    float L = lab.x;
    float A = lab.y;
    float B = lab.z;
    float Lp = L > 1e-9 ? L : 1e-9;
    if (uSombrasTinta != 0.0) A += uSombrasTinta * Lp * (1.0 - smoothstep(0.15, 0.5, L));
    float croma = uSaturacao;
    if (uTemMatiz) {
      float dsoma = abs(A) + abs(B);
      float t = dsoma > 1e-30 ? B / dsoma : 0.0;
      float pos = (A >= 0.0 ? (B >= 0.0 ? t : 4.0 + t) : 2.0 - t) * 180.0;
      int casa = min(int(pos), 719);
      float f = pos - float(casa);
      vec4 m = mix(texelFetch(uTabMatiz, ivec2(casa, 0), 0), texelFetch(uTabMatiz, ivec2(casa + 1, 0), 0), f);
      vec4 q = mix(texelFetch(uTabMatiz, ivec2(casa, 1), 0), texelFetch(uTabMatiz, ivec2(casa + 1, 1), 0), f);
      float x2 = (A * A + B * B) / (Lp * Lp);
      float peso = x2 / (x2 + uCroma2);
      if (uMist) {
        float na = A * m.x - B * m.y;
        B = A * m.y + B * m.x;
        A = na;
        croma *= m.z;
        float ev = m.w;
        if (uPb) ev += q.x;
        if (ev != 0.0) L *= exp2(ev * peso);
      }
      if (uVibracao != 0.0) croma *= 1.0 + (uVibracao * (1.0 - uPele * q.y)) / (1.0 + x2 * uIVib2);
    }
    if (uPb) {
      A = 0.0;
      B = 0.0;
    } else {
      A *= croma;
      B *= croma;
    }
    if (uTonal) {
      float t = clamp((L - uTonal4.y) * uTonal4.z, 0.0, 1.0);
      float ws = 1.0 - t * t * (3.0 - 2.0 * t);
      t = clamp((L - uTonal4.w) * uTonal4.z, 0.0, 1.0);
      float wh = t * t * (3.0 - 2.0 * t);
      t = min(abs(L - uTonal4.x) * uTonalMeioInv, 1.0);
      float wm = 1.0 - t * t * (3.0 - 2.0 * t);
      float base = max(L, 0.0);
      A += base * (ws * uZonaS.x + wm * uZonaM.x + wh * uZonaA.x + uZonaG.x);
      B += base * (ws * uZonaS.y + wm * uZonaM.y + wh * uZonaA.y + uZonaG.y);
      if (uLuzZona) L *= exp2(ws * uZonaS.z + wm * uZonaM.z + wh * uZonaA.z + uZonaG.z);
    }
    vec3 lms = uLabParaLms * vec3(L, A, B);
    v = uDeLms * (lms * lms * lms);
    if (uPb && !uTonal) v = vec3(L * L * L);
  }
  // 6. desbotar
  if (uVeu) v += vec3(uVeuValor);
  return v;
}
`

// ─────────── a tela (tela.js: nucleo) ───────────

const TELA = `
struct Tela {
  mat3 matriz;          // Rec.2020 → espaço da tela
  mat3 paraLms;         // Rec.2020 → LMS (Oklab)
  mat3 lmsParaTela;
  vec3 pesos;           // norma: 0,75·Y
  float maximo;         // norma: 0,25·max
  float c, k, a, lb, xB, xW;
  float preservar;
  int curva;            // 0 sRGB, 1 BT.2020, 2 gama 563/256, 3 linear
};
const float EPS_TELA = 0.18 * 9.5367431640625e-7;  // 0,18·2^−20
const float BRANCO_K = 0.6;
const float BRANCO_H0 = 0.6;
const float TOL_GAMUT = 1e-6;
const mat3 LAB_PARA_LMS = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480);
const mat3 LMS_PARA_LAB_T = mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662,
                                 -0.0040720468, 0.4505937099, -0.8086757660);

float tomDe(Tela T, float n) {
  float x = n / 0.18;
  if (!(x > T.xB)) return 0.0;
  if (x >= T.xW) return 1.0;
  float u = exp2(T.c * log2(x));
  return clamp(T.a * (u / (u + T.k) - T.lb), 0.0, 1.0);
}

float codificar(int curva, float v) {
  if (curva == 0) return v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
  if (curva == 1) return v < 0.018053968510807 ? 4.5 * v : 1.09929682680944 * pow(v, 0.45) - 0.09929682680944;
  if (curva == 2) return v <= 0.0 ? 0.0 : pow(v, 256.0 / 563.0);
  return v;
}

// tela.js comprimir: mesma luz e mesmo matiz em Oklab, croma por bisseção de 14 passos até caber no cubo
vec3 comprimir(Tela T, vec3 o) {
  vec3 lab = LMS_PARA_LAB_T * cbrt3(T.paraLms * o);
  float L = clamp(lab.x, 0.0, 1.0);
  float lo = 0.0;
  float hi = 1.0;
  vec3 melhor = vec3(L * L * L);
  for (int i = 0; i < 14; i++) {
    float s = (lo + hi) * 0.5;
    vec3 lms = LAB_PARA_LMS * vec3(L, lab.y * s, lab.z * s);
    vec3 t = T.lmsParaTela * (lms * lms * lms);
    if (all(greaterThanEqual(t, vec3(-TOL_GAMUT))) && all(lessThanEqual(t, vec3(1.0 + TOL_GAMUT)))) {
      lo = s;
      melhor = t;
    } else hi = s;
  }
  return melhor;
}

// cena Rec.2020 → código da tela 0..1
vec3 aplicarTela(Tela T, vec3 v) {
  float mx = max(v.r, max(v.g, v.b));
  float n = dot(T.pesos, v) + T.maximo * mx;
  float nc = n > EPS_TELA ? n : EPS_TELA;
  float h = tomDe(T, nc);
  float s = h / nc;
  float desloca = h - s * n;
  float kb = 1.0;
  if (h > BRANCO_H0) {
    float t = h >= 1.0 ? 1.0 : (h - BRANCO_H0) / (1.0 - BRANCO_H0);
    float st = t * t * (3.0 - 2.0 * t);
    kb = 1.0 - BRANCO_K * st * st;
  }
  vec3 o = h + (s * v + desloca - h) * kb;
  if (T.preservar < 1.0) {
    vec3 p = vec3(tomDe(T, v.r), tomDe(T, v.g), tomDe(T, v.b));
    o = p + (o - p) * T.preservar;
  }
  vec3 t = T.matriz * o;
  if (any(lessThan(t, vec3(-TOL_GAMUT))) || any(greaterThan(t, vec3(1.0 + TOL_GAMUT)))) t = comprimir(T, o);
  t = clamp(t, 0.0, 1.0);
  return vec3(codificar(T.curva, t.r), codificar(T.curva, t.g), codificar(T.curva, t.b));
}
`

// ─────────── amostragem da base (revelar.js: geometria e amostrar) ───────────

const AMOSTRAR = `
uniform sampler2D uBase;       // RGB32F ou RGB16F: a base (ou a janela dela que está na placa)
uniform ivec2 uBaseCheia;      // tamanho da base inteira
uniform ivec2 uJanela0;        // onde a janela começa na base
uniform ivec2 uJanelaTam;
uniform vec3 uMapaX, uMapaY;   // ponto do quadro → base: x = a·u + b·v + c; y = d·u + e·v + f
uniform bool uExata;

vec3 texel(ivec2 p) {
  p = clamp(p, ivec2(0), uBaseCheia - 1) - uJanela0;
  return texelFetch(uBase, clamp(p, ivec2(0), uJanelaTam - 1), 0).rgb;
}

// Catmull-Rom (Keys, 1981) preso entre o menor e o maior dos quatro vizinhos (revelar.js amostrar)
vec4 pesosCubica(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2);
}
vec3 bicubica(vec2 f) {
  f -= 0.5;
  vec2 i = floor(f);
  vec4 kx = pesosCubica(f.x - i.x);
  vec4 ky = pesosCubica(f.y - i.y);
  ivec2 b = ivec2(i);
  vec3 soma = vec3(0.0);
  vec3 lo = vec3(1e30);
  vec3 hi = vec3(-1e30);
  for (int j = 0; j < 4; j++) {
    vec3 linha = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      vec3 v = texel(b + ivec2(k - 1, j - 1));
      linha += kx[k] * v;
      if ((k == 1 || k == 2) && (j == 1 || j == 2)) {
        lo = min(lo, v);
        hi = max(hi, v);
      }
    }
    soma += ky[j] * linha;
  }
  return clamp(soma, lo, hi);
}

vec2 naBase(vec2 q) { return vec2(dot(uMapaX, vec3(q, 1.0)), dot(uMapaY, vec3(q, 1.0))); }

vec3 amostrarBase(vec2 q, bool exata) {
  vec2 f = naBase(q);
  return exata ? texel(ivec2(floor(f))) : bicubica(f);
}
`

// ─────────── passo 1: base → cena (geometria, cadeia de ponto, avisos medidos na base) ───────────

export const CENA = `${CABECA}${PONTO}${TELA}${AMOSTRAR}
uniform vec2 uOrigem;          // canto da área calculada, em pixels da vista
uniform float uZoom;           // pixels da vista por pixel do quadro
uniform int uAmostras;         // superamostragem por eixo (zoom < 1)
uniform bool uBicubicaNoZoom;
// avisos: o que o ARQUIVO tem
uniform int uCorteModo;        // 0 nenhum, 1 RAW (matriz para a câmera e limiar por canal), 2 foto pronta (código original)
uniform mat3 uCorteMatriz;
uniform vec3 uCorteLimiar;
uniform Tela uTelaOriginal;
uniform float uPisoRuido;      // norma da base abaixo da qual é ruído (0 = sem medida)
out vec4 saida;

void main() {
  vec2 pixel = uOrigem + floor(gl_FragCoord.xy);
  vec3 soma = vec3(0.0);
  float corte = 0.0;
  float sombra = 0.0;
  float n = float(uAmostras);
  bool exata = uExata && !(uBicubicaNoZoom && uZoom > 1.0);
  for (int j = 0; j < uAmostras; j++) {
    for (int i = 0; i < uAmostras; i++) {
      vec2 q = (pixel + (vec2(float(i), float(j)) + 0.5) / n) / uZoom;
      vec3 v = amostrarBase(q, exata);
      soma += v;
      if (uCorteModo == 1) {
        vec3 cam = uCorteMatriz * v;
        corte = max(corte, dot(vec3(greaterThanEqual(cam, uCorteLimiar)), vec3(1.0)));
      } else if (uCorteModo == 2) {
        vec3 c = aplicarTela(uTelaOriginal, v);
        corte = max(corte, any(greaterThanEqual(c, vec3(254.5 / 255.0))) ? 3.0 : 0.0);
        if (all(lessThanEqual(c, vec3(0.5 / 255.0)))) sombra = 1.0;
      }
      if (uPisoRuido > 0.0) {
        float norma = dot(uNormaPesos, v) + uNormaMax * max(v.r, max(v.g, v.b));
        if (norma < uPisoRuido) sombra = 1.0;
      }
    }
  }
  vec3 v = soma / (n * n);
  // alfa = 1 + cortados (0 a 3) + 4·sombra: sobrevive aos passos de vizinhança, que o copiam
  saida = vec4(aplicarPonto(v), 1.0 + corte + 4.0 * sombra);
}
`

// ─────────── vizinhança (local.js) ───────────

// Pesos da norma do mapa de tons (75% luminância + 25% maior canal) e o piso do log da luz de local.js.
const NORMA = `
uniform vec3 uPesosNorma;
uniform float uMaximoNorma;
const float EPS_LOCAL = 0.18 * 1.52587890625e-5;
float luzEv(vec3 v) {
  float n = dot(uPesosNorma, v) + uMaximoNorma * max(v.r, max(v.g, v.b));
  return log2(max(n, EPS_LOCAL));
}
`

/** Média em janela de raio uRaio numa direção, com a janela encolhendo na beirada (local.js caixa). */
export const CAIXA = `${CABECA}
uniform sampler2D uEntrada;
uniform int uRaio;
uniform bool uHorizontal;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 tam = textureSize(uEntrada, 0);
  int c = uHorizontal ? p.x : p.y;
  int fim = (uHorizontal ? tam.x : tam.y) - 1;
  int a = max(0, c - uRaio);
  int b = min(fim, c + uRaio);
  vec4 s = vec4(0.0);
  for (int i = a; i <= b; i++) s += texelFetch(uEntrada, uHorizontal ? ivec2(i, p.y) : ivec2(p.x, i), 0);
  saida = s / float(b - a + 1);
}
`

/** Mínimo do canal R em janela de raio uRaio numa direção (local.js minimo: fora da imagem conta como infinito). G, B e A passam. */
export const MINIMO = `${CABECA}
uniform sampler2D uEntrada;
uniform int uRaio;
uniform bool uHorizontal;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 tam = textureSize(uEntrada, 0);
  int c = uHorizontal ? p.x : p.y;
  int fim = (uHorizontal ? tam.x : tam.y) - 1;
  float m = 1e30;
  for (int i = max(0, c - uRaio); i <= min(fim, c + uRaio); i++) m = min(m, texelFetch(uEntrada, uHorizontal ? ivec2(i, p.y) : ivec2(p.x, i), 0).r);
  vec4 centro = texelFetch(uEntrada, p, 0);
  saida = vec4(m, centro.gba);
}
`

/** Gaussiana separável no canal R (local.js gaussiano: núcleo exato até 3σ, normalizado, beirada repetida). G, B, A passam. */
export const GAUSS = `${CABECA}
uniform sampler2D uEntrada;
uniform float uSigma;
uniform bool uHorizontal;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 tam = textureSize(uEntrada, 0);
  int r = max(1, int(ceil(uSigma * 3.0)));
  int fim = (uHorizontal ? tam.x : tam.y) - 1;
  int c = uHorizontal ? p.x : p.y;
  float s = 0.0;
  float total = 0.0;
  for (int i = -r; i <= r; i++) {
    float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    int k = clamp(c + i, 0, fim);
    s += w * texelFetch(uEntrada, uHorizontal ? ivec2(k, p.y) : ivec2(p.x, k), 0).r;
    total += w;
  }
  vec4 centro = texelFetch(uEntrada, p, 0);
  saida = vec4(s / total, centro.gba);
}
`

/**
 * Média de um bloco s×s (redução por área). É o primeiro passo do filtro guiado em resolução reduzida: os momentos
 * (I, p, I², I·p) são reduzidos por área, a caixa roda com raio r/s, e a e b voltam por bilinear (He e Sun, 2015,
 * "Fast Guided Filter", arXiv:1505.00996 — aqui com a média dos momentos em vez da subamostra, que fica mais perto da
 * caixa de raio cheio).
 */
export const REDUZIR = `${CABECA}
uniform sampler2D uEntrada;
uniform int uFator;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 tam = textureSize(uEntrada, 0);
  ivec2 a = p * uFator;
  ivec2 b = min(a + uFator, tam) - 1;
  vec4 s = vec4(0.0);
  for (int y = a.y; y <= b.y; y++) for (int x = a.x; x <= b.x; x++) s += texelFetch(uEntrada, ivec2(x, y), 0);
  saida = s / float((b.x - a.x + 1) * (b.y - a.y + 1));
}
`

/** Os momentos do filtro guiado a partir de (I, p) nos canais R e G: (I, p, I², I·p). */
export const MOMENTOS = `${CABECA}
uniform sampler2D uEntrada;
out vec4 saida;
void main() {
  vec2 v = texelFetch(uEntrada, ivec2(gl_FragCoord.xy), 0).rg;
  saida = vec4(v.x, v.y, v.x * v.x, v.x * v.y);
}
`

/** Coeficientes do filtro guiado (local.js filtroGuiado): a = cov/(var + eps), b = média(p) − a·média(I). */
export const COEFICIENTES = `${CABECA}
uniform sampler2D uEntrada;
uniform float uEps;
out vec4 saida;
void main() {
  vec4 m = texelFetch(uEntrada, ivec2(gl_FragCoord.xy), 0);
  float v = m.z - m.x * m.x;
  float c = m.w - m.x * m.y;
  float a = c / (max(v, 0.0) + uEps);
  saida = vec4(a, m.y - a * m.x, 0.0, 0.0);
}
`

// Leitura de (média de a, média de b) no pixel cheio: igual quando o fator é 1, bilinear da reduzida quando não.
const COEF_NO_PIXEL = `
vec2 coefNoPixel(sampler2D t, int fator, ivec2 p) {
  if (fator == 1) return texelFetch(t, p, 0).rg;
  ivec2 tam = textureSize(t, 0);
  vec2 f = (vec2(p) + 0.5) / float(fator) - 0.5;
  vec2 i = floor(f);
  vec2 w = f - i;
  ivec2 a = clamp(ivec2(i), ivec2(0), tam - 1);
  ivec2 b = clamp(ivec2(i) + 1, ivec2(0), tam - 1);
  vec2 c00 = texelFetch(t, a, 0).rg;
  vec2 c10 = texelFetch(t, ivec2(b.x, a.y), 0).rg;
  vec2 c01 = texelFetch(t, ivec2(a.x, b.y), 0).rg;
  vec2 c11 = texelFetch(t, b, 0).rg;
  return mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
}
`

/** Plano da luz (local.js planoDeLuz): R = log2 da norma, G = R (para o filtro guiado por ele mesmo). */
export const LUZ = `${CABECA}${NORMA}
uniform sampler2D uCena;
out vec4 saida;
void main() {
  float l = luzEv(texelFetch(uCena, ivec2(gl_FragCoord.xy), 0).rgb);
  saida = vec4(l, l, 0.0, 0.0);
}
`

/**
 * Clareza e textura (local.js contrasteLocal): L' = L + Σ k·(1 − ā)²·(L − (ā·L + b̄)), aplicado como ganho 2^(L' − L)
 * nos três canais.
 */
export const CONTRASTE = `${CABECA}${NORMA}${COEF_NO_PIXEL}
uniform sampler2D uCena;
uniform sampler2D uCoefTextura, uCoefClareza;
uniform int uFatorTextura, uFatorClareza;
uniform float uKTextura, uKClareza;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uCena, p, 0);
  float L = luzEv(c.rgb);
  float novo = L;
  if (uKTextura != 0.0) {
    vec2 ab = coefNoPixel(uCoefTextura, uFatorTextura, p);
    float liso = 1.0 - ab.x;
    novo += uKTextura * liso * liso * (L - (ab.x * L + ab.y));
  }
  if (uKClareza != 0.0) {
    vec2 ab = coefNoPixel(uCoefClareza, uFatorClareza, p);
    float liso = 1.0 - ab.x;
    novo += uKClareza * liso * liso * (L - (ab.x * L + ab.y));
  }
  saida = vec4(c.rgb * exp2(novo - L), c.a);
}
`

/** Neblina, preparo (local.js tirarNeblina): R = canal escuro de I/A, G = guia √(luz relativa ao ar). */
export const NEBLINA_PREPARO = `${CABECA}
uniform sampler2D uCena;
uniform vec3 uAr;
uniform vec3 uY;
out vec4 saida;
void main() {
  vec3 v = texelFetch(uCena, ivec2(gl_FragCoord.xy), 0).rgb / uAr;
  float escuro = clamp(min(v.r, min(v.g, v.b)), 0.0, 1.0);
  float y = dot(uY, v);
  saida = vec4(escuro, sqrt(clamp(y, 0.0, 4.0)), 0.0, 0.0);
}
`

/** Neblina: (canal mínimo, guia) → (guia, 1 − ω·canal), a entrada do filtro guiado cruzado. */
export const NEBLINA_TRANSMISSAO = `${CABECA}
uniform sampler2D uEntrada;
uniform float uOmega;
out vec4 saida;
void main() {
  vec2 v = texelFetch(uEntrada, ivec2(gl_FragCoord.xy), 0).rg;
  saida = vec4(v.y, 1.0 - uOmega * v.x, 0.0, 0.0);
}
`

/** Neblina, aplicação: t = ā·guia + b̄;  J = (I − A)/máx(t, tMín) + A. Quantidade negativa: J = I·t + A·(1 − t). */
export const NEBLINA_APLICAR = `${CABECA}${COEF_NO_PIXEL}
uniform sampler2D uCena;
uniform sampler2D uGuia;
uniform sampler2D uCoef;
uniform int uFator;
uniform vec3 uAr;
uniform float uTMin;
uniform float uVeu;             // > 0: pôr neblina com t = uVeu
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uCena, p, 0);
  if (uVeu > 0.0) {
    saida = vec4(c.rgb * uVeu + uAr * (1.0 - uVeu), c.a);
    return;
  }
  vec2 ab = coefNoPixel(uCoef, uFator, p);
  float t = ab.x * texelFetch(uGuia, p, 0).g + ab.y;
  float ti = 1.0 / (t > uTMin ? (t < 1.0 ? t : 1.0) : uTMin);
  saida = vec4((c.rgb - uAr) * ti + uAr, c.a);
}
`

/** Nitidez (local.js nitidez): D = L − gauss(L); L' = L + k·m·lim·tanh(D/lim), m da máscara de borda (ou 1). */
export const NITIDEZ = `${CABECA}${NORMA}
uniform sampler2D uCena;
uniform sampler2D uBorrado;     // R = gauss(L)
uniform sampler2D uMascara;     // R = mínimo de −|D| na vizinhança
uniform bool uComMascara;
uniform float uGanho, uLimite, uE;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uCena, p, 0);
  float L = luzEv(c.rgb);
  float m = uComMascara ? smoothstep(0.5 * uE, 1.5 * uE, -texelFetch(uMascara, p, 0).r) : 1.0;
  float d = uLimite * tanh((L - texelFetch(uBorrado, p, 0).r) / uLimite);
  saida = vec4(c.rgb * exp2(uGanho * m * d), c.a);
}
`

/** Máscara da nitidez: R = −|L − gauss(L)|, para o mínimo em janela achar o maior desvio da vizinhança. */
export const NITIDEZ_FORCA = `${CABECA}${NORMA}
uniform sampler2D uCena;
uniform sampler2D uBorrado;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float L = luzEv(texelFetch(uCena, p, 0).rgb);
  saida = vec4(-abs(L - texelFetch(uBorrado, p, 0).r), 0.0, 0.0, 0.0);
}
`

// ─────────── passo final: grão, vinheta, tela, look, avisos ───────────

// Grão (local.js grao e daGrade): o mesmo hash inteiro, em uint de 32 bits (a multiplicação dá a volta como Math.imul).
const GRAO = `
uniform bool uGrao;
uniform float uGraoQ, uGraoNorma, uGraoCelula, uGraoF, uGraoPeso2;
uniform int uGraoSemente;
uint hashGrao(int x, int y, int semente) {
  uint h = (uint(x) * 0x27d4eb2du) ^ (uint(y) * 0x165667b1u) ^ (uint(semente) * 0x9e3779b1u);
  h = (h ^ (h >> 15)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12)) * 0x297a2d39u;
  return h ^ (h >> 15);
}
float daGrade(int x, int y, int semente) {
  uint h = hashGrao(x, y, semente);
  float s = float(h & 255u) + float((h >> 8) & 255u) + float((h >> 16) & 255u) + float(h >> 24);
  return (s / 255.0 - 2.0) * 1.7320508075688772;
}
float campoGrao(vec2 X) {
  float campo = 0.0;
  for (int oitava = 0; oitava < 2; oitava++) {
    float peso = oitava == 0 ? 1.0 : uGraoPeso2;
    if (peso == 0.0) continue;
    float c = oitava == 0 ? uGraoCelula : uGraoCelula * 3.0;
    int semente = uGraoSemente + oitava * 7919;
    vec2 f = ((X + 0.5) * uGraoF - 0.5) / c;
    vec2 i = floor(f);
    vec2 t = f - i;
    int ix = int(i.x);
    int iy = int(i.y);
    float v = (daGrade(ix, iy, semente) * (1.0 - t.x) + daGrade(ix + 1, iy, semente) * t.x) * (1.0 - t.y) +
              (daGrade(ix, iy + 1, semente) * (1.0 - t.x) + daGrade(ix + 1, iy + 1, semente) * t.x) * t.y;
    float vy = (1.0 - t.y) * (1.0 - t.y) + t.y * t.y;
    campo += peso * v / sqrt(((1.0 - t.x) * (1.0 - t.x) + t.x * t.x) * vy);
  }
  return campo;
}
`

export const FINAL = `${CABECA}${TELA}${GRAO}
uniform sampler2D uCena;
uniform ivec2 uDesloca;        // onde o pixel (0, 0) da saída fica na textura de cena
uniform vec2 uOrigemSaida;     // o pixel (0, 0) da saída, em pixels da vista (para grão e vinheta)
uniform Tela uTela;
uniform bool uVinheta;
uniform float uVinhetaEv, uVinhetaR0, uVinhetaR1;
uniform vec2 uCentro;          // centro do quadro na vista
uniform bool uLook;
uniform sampler3D uLookLut;
uniform float uLookTam, uLookQuantidade;
uniform int uAvisos;           // bits: 1 altas, 2 sombras
uniform vec3 uCorPerdida, uCorRecuperavel, uCorSombra;
out vec4 saida;

// LUT 3D por interpolação tetraédrica (Kasson, Nin, Plouffe e Hafner, 1995, "Performing color space conversions with
// three-dimensional linear interpolation", J. Electronic Imaging 4(3)); o vermelho varia mais rápido, como no .cube
vec3 lut(vec3 c) {
  float n = uLookTam - 1.0;
  vec3 x = clamp(c, 0.0, 1.0) * n;
  vec3 i = min(floor(x), vec3(n - 1.0));
  vec3 f = x - i;
  ivec3 b = ivec3(i);
  vec3 c000 = texelFetch(uLookLut, b, 0).rgb;
  vec3 c111 = texelFetch(uLookLut, b + ivec3(1), 0).rgb;
  vec3 r;
  if (f.r >= f.g) {
    if (f.g >= f.b) {
      vec3 c100 = texelFetch(uLookLut, b + ivec3(1, 0, 0), 0).rgb;
      vec3 c110 = texelFetch(uLookLut, b + ivec3(1, 1, 0), 0).rgb;
      r = c000 + f.r * (c100 - c000) + f.g * (c110 - c100) + f.b * (c111 - c110);
    } else if (f.r >= f.b) {
      vec3 c100 = texelFetch(uLookLut, b + ivec3(1, 0, 0), 0).rgb;
      vec3 c101 = texelFetch(uLookLut, b + ivec3(1, 0, 1), 0).rgb;
      r = c000 + f.r * (c100 - c000) + f.b * (c101 - c100) + f.g * (c111 - c101);
    } else {
      vec3 c001 = texelFetch(uLookLut, b + ivec3(0, 0, 1), 0).rgb;
      vec3 c101 = texelFetch(uLookLut, b + ivec3(1, 0, 1), 0).rgb;
      r = c000 + f.b * (c001 - c000) + f.r * (c101 - c001) + f.g * (c111 - c101);
    }
  } else {
    if (f.b > f.g) {
      vec3 c001 = texelFetch(uLookLut, b + ivec3(0, 0, 1), 0).rgb;
      vec3 c011 = texelFetch(uLookLut, b + ivec3(0, 1, 1), 0).rgb;
      r = c000 + f.b * (c001 - c000) + f.g * (c011 - c001) + f.r * (c111 - c011);
    } else if (f.b > f.r) {
      vec3 c010 = texelFetch(uLookLut, b + ivec3(0, 1, 0), 0).rgb;
      vec3 c011 = texelFetch(uLookLut, b + ivec3(0, 1, 1), 0).rgb;
      r = c000 + f.g * (c010 - c000) + f.b * (c011 - c010) + f.r * (c111 - c011);
    } else {
      vec3 c010 = texelFetch(uLookLut, b + ivec3(0, 1, 0), 0).rgb;
      vec3 c110 = texelFetch(uLookLut, b + ivec3(1, 1, 0), 0).rgb;
      r = c000 + f.g * (c010 - c000) + f.r * (c110 - c010) + f.b * (c111 - c110);
    }
  }
  return r;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uCena, p + uDesloca, 0);
  vec3 v = c.rgb;
  vec2 X = uOrigemSaida + vec2(p);
  if (uGrao) v *= exp2(uGraoQ * uGraoNorma * campoGrao(X));
  if (uVinheta) {
    vec2 d = (X + 0.5 - uCentro) / uCentro;
    float r = sqrt((d.x * d.x + d.y * d.y) / 2.0);
    v *= exp2(uVinhetaEv * smoothstep(uVinhetaR0, uVinhetaR1, r));
  }
  vec3 codigo = aplicarTela(uTela, v);
  if (uLook) codigo = clamp(codigo + (lut(codigo) - codigo) * uLookQuantidade, 0.0, 1.0);
  if (uAvisos != 0) {
    float marca = c.a - 1.0;
    float sombra = marca >= 3.5 ? 1.0 : 0.0;
    float cortados = marca - 4.0 * sombra;
    // listras diagonais de 8 px (metade pintada): o aviso não esconde a foto inteira
    bool listra = mod(X.x + X.y, 8.0) < 4.0;
    if ((uAvisos & 1) != 0) {
      if (cortados > 2.5) codigo = uCorPerdida;
      else if (listra && (cortados > 0.5 || any(greaterThanEqual(codigo, vec3(254.5 / 255.0))))) codigo = uCorRecuperavel;
    }
    if ((uAvisos & 2) != 0 && sombra > 0.5 && listra) codigo = uCorSombra;
  }
  saida = vec4(codigo, 1.0);
}
`

/** Antes e depois com divisória, e a saída para o canvas (desvirado) ou para uma textura (como está). */
export const COMPOR = `${CABECA}
uniform sampler2D uDepois;
uniform sampler2D uAntes;
uniform bool uComparar;
uniform float uDivisoria;      // coluna da divisória, em pixels da saída
uniform bool uDesvirar;
uniform int uAltura;
out vec4 saida;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (uDesvirar) p.y = uAltura - 1 - p.y;
  vec4 c = texelFetch(uDepois, p, 0);
  if (uComparar) {
    float x = float(p.x) + 0.5;
    if (x < uDivisoria) c = texelFetch(uAntes, p, 0);
    if (abs(x - uDivisoria) < 1.0) c = vec4(0.94, 0.94, 0.94, 1.0);
  }
  saida = c;
}
`

/** Redução por amostra em grade, para o histograma da tela sair de poucos milhares de pixels. */
export const AMOSTRA = `${CABECA}
uniform sampler2D uEntrada;
uniform vec2 uPasso;
out vec4 saida;
void main() {
  ivec2 tam = textureSize(uEntrada, 0);
  ivec2 p = min(ivec2((floor(gl_FragCoord.xy) + 0.5) * uPasso), tam - 1);
  saida = texelFetch(uEntrada, p, 0);
}
`

/** A prévia pronta (JPEG embutido, ImageBitmap) esticada no canvas, com mipmaps: é o "primeiro tempo" da abertura. */
export const IMAGEM = `${CABECA}
uniform sampler2D uImagem;
uniform vec2 uTam;
out vec4 saida;
void main() {
  vec2 uv = vec2(gl_FragCoord.x / uTam.x, 1.0 - gl_FragCoord.y / uTam.y);
  saida = vec4(texture(uImagem, uv).rgb, 1.0);
}
`
