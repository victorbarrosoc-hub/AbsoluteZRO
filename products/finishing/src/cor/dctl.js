// Revela · a textura (src/cor/textura.js) como DCTL para o DaVinci Resolve Studio. Vai num nó ANTES do look (LMT), com
// a linha do tempo em DaVinci Wide Gamut / Intermediate: entra DI, sai DI. A conta é a mesma da prévia:
//   - grão: o mesmo hash e o mesmo campo gaussiano em grade (ruído idêntico pixel a pixel, com a mesma semente);
//   - halation e difusão: a gaussiana é amostrada com 40 pontos em espiral (estratificada) em vez das três caixas da
//     prévia; o halo tem a mesma forma, com uma textura de amostragem fina que o grão cobre.
// O Resolve não passa o número do quadro para a DCTL: para o grão andar, anime a Semente (dois keyframes).

import { BITOLAS, GRANULARIDADE, TEXTURA_NEUTRA } from './textura.js'

const f = (v) => {
  const s = Number(v).toFixed(6)
  return s.includes('.') ? `${s}f` : `${s}.0f`
}

/** Texto da DCTL. `t`: a textura (TEXTURA_NEUTRA), `negativo`: id (granularidade), `titulo`: comentário do cabeçalho. */
export function escreverDctlTextura(t, { negativo = 'digital', titulo = 'Revela · textura' } = {}) {
  const tt = { ...TEXTURA_NEUTRA, ...t }
  const bitola = Math.max(0, BITOLAS.findIndex((b) => b.id === tt.bitola))
  const gran = GRANULARIDADE[negativo] ?? GRANULARIDADE.digital
  return `// ${titulo}
// Feito no Revela Lab (revela.absolutezro.com). Nó ANTES do look; linha do tempo em DaVinci Wide Gamut / Intermediate.
// Ordem do filme: difusão -> halation -> grão (no negativo). Para o grão andar, anime a Semente.
// Granularidade da película escolhida: ${gran} stop (35 mm, quadro de 1920).

DEFINE_UI_PARAMS(p_Grao, Grão, DCTLUI_SLIDER_FLOAT, ${f(tt.grao)}, 0.0, 2.0, 0.01)
DEFINE_UI_PARAMS(p_Bitola, Bitola, DCTLUI_COMBO_BOX, ${bitola}, { B65, B35, B16, B8 }, { 65 mm, 35 mm, 16 mm, Super 8 })
DEFINE_UI_PARAMS(p_Tamanho, Tamanho do grão, DCTLUI_SLIDER_FLOAT, ${f(tt.tamanhoGrao)}, 0.5, 2.0, 0.01)
DEFINE_UI_PARAMS(p_CorGrao, Cor do grão, DCTLUI_SLIDER_FLOAT, ${f(tt.corGrao)}, 0.0, 1.0, 0.01)
DEFINE_UI_PARAMS(p_Semente, Semente, DCTLUI_SLIDER_INT, ${Math.round(tt.semente)}, 0, 1000, 1)
DEFINE_UI_PARAMS(p_Halation, Halation, DCTLUI_SLIDER_FLOAT, ${f(tt.halation)}, 0.0, 2.0, 0.01)
DEFINE_UI_PARAMS(p_RaioHal, Raio da halation, DCTLUI_SLIDER_FLOAT, ${f(tt.raioHalation)}, 0.3, 3.0, 0.01)
DEFINE_UI_PARAMS(p_CorHal, Cor da halation, DCTLUI_SLIDER_FLOAT, ${f(tt.corHalation)}, 0.0, 2.0, 0.01)
DEFINE_UI_PARAMS(p_Difusao, Difusão, DCTLUI_SLIDER_FLOAT, ${f(tt.difusao)}, 0.0, 1.0, 0.01)
DEFINE_UI_PARAMS(p_RaioDif, Raio da difusão, DCTLUI_SLIDER_FLOAT, ${f(tt.raioDifusao)}, 0.3, 3.0, 0.01)

__CONSTANT__ float GRANULARIDADE = ${f(gran)};

// DaVinci Intermediate <-> linear
__DEVICE__ float diParaLinear(float v) { return v <= 0.02740668f ? v / 10.44426855f : _exp2f(v / 0.07329248f - 7.0f) - 0.0075f; }
__DEVICE__ float linearParaDi(float x) { return x <= 0.00262409f ? x * 10.44426855f : (_log2f(x + 0.0075f) + 7.0f) * 0.07329248f; }
__DEVICE__ float luz(float r, float g, float b) { return 0.27411851f * r + 0.8736319f * g - 0.14775041f * b; }

__DEVICE__ float3 lerLinear(__TEXTURE__ R, __TEXTURE__ G, __TEXTURE__ B, int w, int h, float x, float y) {
  int xi = (int)_clampf(_round(x), 0.0f, (float)(w - 1));
  int yi = (int)_clampf(_round(y), 0.0f, (float)(h - 1));
  return make_float3(diParaLinear(_tex2D(R, xi, yi)), diParaLinear(_tex2D(G, xi, yi)), diParaLinear(_tex2D(B, xi, yi)));
}

// o mesmo hash de 32 bits da prévia (Wang + xorshift)
__DEVICE__ unsigned int hashR(int x, int y, int c, int s) {
  unsigned int h = (unsigned int)x * 374761393u + (unsigned int)y * 668265263u + (unsigned int)c * 2246822519u + (unsigned int)s * 3266489917u;
  h = (h ^ (h >> 15)) * 2246822519u;
  h = (h ^ (h >> 13)) * 3266489917u;
  return h ^ (h >> 16);
}
__DEVICE__ float ruido(int x, int y, int c, int s) {
  float a = (float)hashR(x, y, c * 2, s) / 4294967296.0f;
  float b = (float)hashR(x, y, c * 2 + 1, s) / 4294967296.0f;
  return (a + b - 1.0f) * 2.449489743f;
}

// campo de grão: ruído numa grade de passo k convoluído com a gaussiana de desvio s, normalizado (variância 1)
__DEVICE__ float campo(int px, int py, float s, int c, int semente) {
  int k = (int)_fmaxf(1.0f, _floor(s / 1.5f));
  int r = (int)_ceil(3.0f * s);
  int i0 = (int)_floor((float)(px - r) / (float)k), i1 = (int)_ceil((float)(px + r) / (float)k);
  int j0 = (int)_floor((float)(py - r) / (float)k), j1 = (int)_ceil((float)(py + r) / (float)k);
  float soma = 0.0f, nx = 0.0f, ny = 0.0f;
  for (int i = i0; i <= i1; i++) { float d = (float)(px - i * k); nx += _expf(-d * d / (s * s)); }
  for (int j = j0; j <= j1; j++) {
    float dy = (float)(py - j * k);
    float gy = _expf(-0.5f * dy * dy / (s * s));
    ny += gy * gy;
    float linha = 0.0f;
    for (int i = i0; i <= i1; i++) { float dx = (float)(px - i * k); linha += ruido(i, j, c, semente) * _expf(-0.5f * dx * dx / (s * s)); }
    soma += linha * gy;
  }
  return soma / _sqrtf(nx * ny);
}

// desfoque gaussiano por amostragem estratificada (40 pontos em espiral) do excesso acima de um limiar
__DEVICE__ float3 halo(__TEXTURE__ R, __TEXTURE__ G, __TEXTURE__ B, int w, int h, int x, int y, float sigma, float limiar, int deLuz) {
  float3 acc = make_float3(0.0f, 0.0f, 0.0f);
  for (int k = 0; k < 40; k++) {
    float rr = sigma * _sqrtf(-2.0f * _logf(1.0f - ((float)k + 0.5f) / 40.0f));
    float a = (float)k * 2.39996323f;
    float3 v = lerLinear(R, G, B, w, h, (float)x + rr * _cosf(a), (float)y + rr * _sinf(a));
    if (deLuz) { float l = _fmaxf(0.0f, luz(v.x, v.y, v.z) - limiar); acc.x += l; acc.y += l; acc.z += l; }
    else { acc.x += _fmaxf(0.0f, v.x - limiar); acc.y += _fmaxf(0.0f, v.y - limiar); acc.z += _fmaxf(0.0f, v.z - limiar); }
  }
  return make_float3(acc.x / 40.0f, acc.y / 40.0f, acc.z / 40.0f);
}

__DEVICE__ float3 transform(int p_Width, int p_Height, int p_X, int p_Y, __TEXTURE__ p_TexR, __TEXTURE__ p_TexG, __TEXTURE__ p_TexB)
{
  float largura = (float)p_Width;
  float3 c = lerLinear(p_TexR, p_TexG, p_TexB, p_Width, p_Height, (float)p_X, (float)p_Y);

  // 1. difusão
  if (p_Difusao > 0.0f) {
    float3 d = halo(p_TexR, p_TexG, p_TexB, p_Width, p_Height, p_X, p_Y, 0.012f * largura * p_RaioDif, 0.72f, 0);
    c.x += 0.35f * p_Difusao * d.x; c.y += 0.35f * p_Difusao * d.y; c.z += 0.35f * p_Difusao * d.z;
  }
  // 2. halation: a camada vermelha (e um pouco a verde) exposta de novo pela luz que volta da base
  if (p_Halation > 0.0f) {
    float s = 0.006f * largura * p_RaioHal;
    float perto = halo(p_TexR, p_TexG, p_TexB, p_Width, p_Height, p_X, p_Y, s, 0.9f, 1).x;
    float longe = halo(p_TexR, p_TexG, p_TexB, p_Width, p_Height, p_X, p_Y, s * 3.0f, 0.9f, 1).x;
    float v = 0.6f * perto + 0.4f * longe;
    float branco = _fmaxf(0.0f, 1.0f - p_CorHal);
    float cg = 0.32f * (1.0f - 0.4f * (p_CorHal - 1.0f));
    c.x += 0.22f * p_Halation * v * (1.0f * (1.0f - branco) + branco);
    c.y += 0.22f * p_Halation * v * (cg * (1.0f - branco) + branco);
    c.z += 0.22f * p_Halation * v * (0.06f * (1.0f - branco) + branco);
  }
  // 3. grão no negativo, em stops de exposição
  if (p_Grao > 0.0f) {
    float tamanhos[4] = { 0.55f, 1.0f, 2.0f, 3.4f };
    float pesos[4] = { 0.7f, 1.0f, 1.6f, 2.4f };
    int b = p_Bitola;
    float s = _fmaxf(0.35f, 0.55f * tamanhos[b] * p_Tamanho * largura / 1920.0f);
    float desvio = p_Grao * pesos[b] * GRANULARIDADE;
    float mistura = _clampf(p_CorGrao, 0.0f, 1.0f);
    float a = _sqrtf(1.0f - mistura * mistura);
    float comum = campo(p_X, p_Y, s, 3, p_Semente);
    float Yi = _fmaxf(1e-6f, luz(c.x, c.y, c.z));
    float fundo = 0.4f + 0.6f * _clampf((_log2f(Yi / 0.18f) + 6.0f) / 5.0f, 0.0f, 1.0f);
    c.x *= _exp2f(desvio * fundo * (a * comum + mistura * campo(p_X, p_Y, s * 0.85f, 0, p_Semente)));
    c.y *= _exp2f(desvio * fundo * (a * comum + mistura * campo(p_X, p_Y, s * 0.85f, 1, p_Semente)));
    c.z *= _exp2f(desvio * fundo * (a * comum + mistura * campo(p_X, p_Y, s * 0.85f, 2, p_Semente)));
  }
  return make_float3(linearParaDi(c.x), linearParaDi(c.y), linearParaDi(c.z));
}
`
}
