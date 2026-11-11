// Revela · o Lab como um nó do DaVinci Resolve (DCTL). O mesmo motor de src/cor/pelicula.js, escrito na língua do
// Resolve: a pessoa põe a DCTL num nó, escolhe o look, o negativo e a cópia ali mesmo e mexe nos ajustes do Lab com a
// imagem tocando. Entra DaVinci Wide Gamut / Intermediate, sai DaVinci Wide Gamut / Intermediate (é um LMT, como a LUT
// do pacote): a saída para a tela continua sendo a do projeto.
//
// Como a conta é a mesma:
//   - todo número (matrizes, perfis, curvas das fichas, constantes da tela) é escrito aqui a partir do motor em
//     JavaScript: nada é digitado de novo;
//   - o teste (test/dctl-lab.test.js) lê o texto da DCTL, traduz para JavaScript e compara com o motor, cor por cor.
// Duas diferenças declaradas: a cópia é calculada direto da curva (o motor usa uma tabela de 4096 pontos da mesma
// curva) e a volta da tela para em 1e-6 (a conta do Resolve é de 32 bits). As duas ficam muito abaixo do que se vê.
//
// A correção automática do frame ("Analisar e corrigir") não entra no nó: ela é de cada plano e vai antes, como a CDL
// do pacote. Textura (grão, halation) é a outra DCTL (src/cor/dctl.js), num nó antes deste.

import { GAMUT_DA_TELA, criarTela, curvaDeTom } from './cena.js'
import { COPIAS, CONSTANTES_DA_COPIA, branco709 } from './copia.js'
import { inversa, matrizGamut, rgbParaXyz } from './espacos.js'
import { AJUSTES, AJUSTES_NEUTROS } from './lab.js'
import { CONSTANTES_DOS_NEGATIVOS, NEGATIVOS, SEPARACAO } from './negativos.js'
import { CONSTANTES_DO_MOTOR as K, GRUPOS, NEUTRO } from './pelicula.js'

/** Número como literal de 32 bits da DCTL (nove dígitos: mais que a precisão de um float). */
export const lit = (v) => {
  if (!Number.isFinite(v)) throw new Error(`Número sem valor para a DCTL: ${v}`)
  let s = Number(v).toPrecision(9)
  if (!s.includes('e') && !s.includes('.')) s += '.0'
  return `${s}f`
}

const mulM = (a, b) => a.map((linha) => [0, 1, 2].map((j) => linha[0] * b[0][j] + linha[1] * b[1][j] + linha[2] * b[2][j]))
const mul = (m, v) => m.map((l) => l[0] * v[0] + l[1] * v[1] + l[2] * v[2])

/** Uma matriz 3×3 como função da DCTL: `nome(v)` devolve M · v. */
const matriz = (nome, M) =>
  `__DEVICE__ float3 ${nome}(float3 v) { return make_float3(${M.map((l) => `${lit(l[0])} * v.x + ${lit(l[1])} * v.y + ${lit(l[2])} * v.z`).join(', ')}); }`

/** Tabela de duas entradas (a de 1 a n, b de 0 a 2) como função: só `if`, que todo compilador de GPU aceita. */
const tabela = (nome, linhas) =>
  `__DEVICE__ float ${nome}(int a, int b) {\n${linhas.map((l, i) => `  if (a == ${i + 1}) return b == 0 ? ${lit(l[0])} : (b == 1 ? ${lit(l[1])} : ${lit(l[2])});`).join('\n')}\n  return 0.0f;\n}`

export const LOOKS_DO_NO = GRUPOS.flatMap((g) => g.looks)
const LUZES = ['D65', 'D60', 'D55']
const REVELACOES = [-1, 0, 1, 2]
const idC = (texto) => String(texto).replace(/[^A-Za-z0-9]/g, '_')
// nos rótulos do Resolve, vírgula e chave separam as opções: saem do nome
const rotulo = (texto) => String(texto).replace(/[,{}]/g, ' ')

/**
 * Os valores com que o nó abre, a partir de uma receita do Lab (ou o neutro, com o Revela Look). O que na receita é
 * "da base" continua "da base" no nó.
 */
export function padroesDoNo(receita = {}) {
  const aj = { ...AJUSTES_NEUTROS, ...(receita.ajustes ?? {}) }
  const look = Math.max(0, LOOKS_DO_NO.findIndex((l) => l.id === receita.base))
  const negativo = !receita.negativo ? 0 : receita.negativo === 'digital' ? 1 : 2 + Math.max(0, NEGATIVOS.findIndex((n) => n.id === receita.negativo))
  const copia = !receita.copia ? 0 : receita.copia === 'nenhuma' ? 1 : 2 + Math.max(0, COPIAS.findIndex((c) => c.id === receita.copia))
  return {
    look,
    negativo,
    copia,
    luz: Math.max(0, LUZES.indexOf(receita.luzCopia || 'D65')),
    revelacao: Math.max(0, REVELACOES.indexOf(receita.revelacao ?? 0)),
    expandido: receita.expandido ? 1 : 0,
    intensidade: Math.round(Math.min(1, Math.max(0, receita.intensidade ?? 1)) * 100),
    ajustes: aj,
  }
}

/** As atribuições de um perfil: só o que foge do neutro. */
function carregarPerfil(p) {
  const n = NEUTRO
  const linhas = []
  const se = (cond, nome, v) => cond && linhas.push(`${nome} = ${lit(v)};`)
  se(p.contraste !== n.contraste, `contraste`, p.contraste)
  p.canais.forEach((v, i) => se(v !== 1, `cn${i}`, v))
  p.timing.forEach((v, i) => se(v !== 0, `tm${i}`, v))
  se(p.pe !== Infinity, `pe`, p.pe)
  se(p.ombro !== Infinity, `ombro`, p.ombro)
  se(p.sensibilidade !== 0, `sens`, p.sensibilidade)
  se(p.entreCamadas !== 0, `entre`, p.entreCamadas)
  se(p.densidade !== 0, `dens`, p.densidade)
  se(p.saturacao !== 1, `sat`, p.saturacao)
  se(p.satAltas !== 0, `satAltas`, p.satAltas)
  se(p.satSombras !== 0, `satSombras`, p.satSombras)
  se(p.verde.gira !== 0, `vGira`, p.verde.gira)
  se(p.verde.croma !== 1, `vCroma`, p.verde.croma)
  se(p.azul.gira !== 0, `aGira`, p.azul.gira)
  se(p.azul.croma !== 1, `aCroma`, p.azul.croma)
  se(p.pele.junta !== 0, `pJunta`, p.pele.junta)
  se(p.pele.croma !== 1, `pCroma`, p.pele.croma)
  se(p.pele.ancora !== 0, `pAncora`, p.pele.ancora)
  p.sombras.forEach((v, i) => se(v !== 0, `so${i}`, v))
  p.meios.forEach((v, i) => se(v !== 0, `me${i}`, v))
  p.altas.forEach((v, i) => se(v !== 0, `al${i}`, v))
  se(p.veu !== 0, `veuP`, p.veu)
  if (p.pb) linhas.push(`ehPb = 1; pb0 = ${lit(p.pb[0])}; pb1 = ${lit(p.pb[1])}; pb2 = ${lit(p.pb[2])};`)
  if (p.copia) linhas.push(`copiaBase = ${1 + COPIAS.findIndex((c) => c.id === p.copia)};`)
  if (p.negativoFicha) linhas.push(`negBase = ${1 + NEGATIVOS.findIndex((x) => x.id === p.negativoFicha)};`)
  // o motor conta com estes valores iguais em todos os perfis; se um perfil novo mudar, o nó precisa aprender
  for (const k of ['gamaCopia', 'ancoraCopia', 'revelacao', 'luzCopia', 'expandido']) if (p[k] !== n[k]) throw new Error(`O perfil ${p.id} muda ${k}: a DCTL do Lab ainda não leva isso`)
  return linhas.join(' ')
}

/**
 * O texto da DCTL do Lab. `receita`: abre o nó com o look e os ajustes dela (sem receita, Revela Look neutro).
 * `titulo`: comentário do cabeçalho.
 */
export function escreverDctlLab(receita = {}, { titulo = 'Revela Lab' } = {}) {
  const d = padroesDoNo(receita)
  const { DWG_P3, P3_709, MARGEM, FOG, inversa3, exposicaoPara, gama } = CONSTANTES_DA_COPIA
  const { CURVAS: CURVAS_NEG, P3_DWG } = CONSTANTES_DOS_NEGATIVOS
  const tom = curvaDeTom(100).constantes
  const tela = criarTela('rec709')
  if (tela.curvaDeTom.pico !== 1) throw new Error('A DCTL do Lab conta com o pico da tela SDR em 1')
  const Y709 = rgbParaXyz('rec709')[1]
  const R709_DWG = matrizGamut('rec709', 'dwg')
  const brancoD65 = mul(K.BRADFORD, [0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329])
  const luzDe = (id) => {
    const l = branco709(id)
    return mulM(mulM(K.R709_DWG, [[l[0], 0, 0], [0, l[1], 0], [0, 0, l[2]]]), K.DWG_709)
  }
  const so = (1 - 1.3 / NEUTRO.gamaCopia) / 3
  const Mi = inversa3(COPIAS[0].corantes)
  const Mc = COPIAS[0].corantes
  for (const c of COPIAS) if (c.corantes !== COPIAS[0].corantes) throw new Error('A DCTL do Lab conta com os mesmos corantes nas três cópias')
  const xCinza = COPIAS.map((c) => c.curvas.map((cv) => exposicaoPara(cv, cv.dmin + 1)))
  const gamaC = COPIAS.map((c, i) => c.curvas.map((cv, j) => gama(cv, xCinza[i][j])))
  const sp = (x) => (x > 30 ? x : Math.log1p(Math.exp(x)))
  const curvaNeg = ([dmin, g, a, w1, b, w2], s) => {
    const u = w1 * sp((s - a) / w1)
    return dmin + g * (u - w2 * sp((u - (b - a)) / w2))
  }
  const camadas = (n) => ['R', 'G', 'B'].map((k) => CURVAS_NEG[n.id][k])
  const param = (t, k) => `${lit(t[k])}`
  const ajuste = (id) => AJUSTES.find((a) => a.id === id)
  const barra = (variavel, id) => {
    const a = ajuste(id)
    return `DEFINE_UI_PARAMS(${variavel}, ${a.nome}, DCTLUI_SLIDER_FLOAT, ${lit(d.ajustes[id]).slice(0, -1)}, ${a.min}.0, ${a.max}.0, 1.0)`
  }

  return `// ${titulo}
// O Revela Lab como um nó do DaVinci Resolve Studio (revela.absolutezro.com).
// Linha do tempo em DaVinci Wide Gamut / Intermediate. Entra DWG/DI, sai DWG/DI: a saída para a tela é a do projeto.
// Ordem dos nós: correção do plano -> textura (a outra DCTL, se houver) -> este nó -> saída do projeto.
// Instalar: copie este arquivo para a pasta LUT do Resolve e escolha em Efeitos > ResolveFX Color > DCTL.

DEFINE_UI_PARAMS(p_Look, Look, DCTLUI_COMBO_BOX, ${d.look}, { ${LOOKS_DO_NO.map((l) => `LOOK_${idC(l.id)}`).join(', ')} }, { ${LOOKS_DO_NO.map((l) => rotulo(l.nome)).join(', ')} })
DEFINE_UI_PARAMS(p_Negativo, Negativo, DCTLUI_COMBO_BOX, ${d.negativo}, { NEG_BASE, NEG_DIGITAL, ${NEGATIVOS.map((n) => `NEG_${n.id}`).join(', ')} }, { Do look, Digital, ${NEGATIVOS.map((n) => rotulo(`${n.nome} ${n.numero}`)).join(', ')} })
DEFINE_UI_PARAMS(p_Copia, Cópia, DCTLUI_COMBO_BOX, ${d.copia}, { COP_BASE, COP_SEM, ${COPIAS.map((c) => `COP_${c.id}`).join(', ')} }, { Do look, Sem cópia, ${COPIAS.map((c) => rotulo(c.nome)).join(', ')} })
DEFINE_UI_PARAMS(p_LuzCopia, Luz da cópia, DCTLUI_COMBO_BOX, ${d.luz}, { LUZ_D65, LUZ_D60, LUZ_D55 }, { D65 neutra, D60 morna, D55 quente })
DEFINE_UI_PARAMS(p_Revelacao, Revelação, DCTLUI_COMBO_BOX, ${d.revelacao}, { REV_PUXAR1, REV_NORMAL, REV_FORCAR1, REV_FORCAR2 }, { Puxar 1 stop, Normal, Forçar 1 stop, Forçar 2 stops })
DEFINE_UI_PARAMS(p_Expandido, Expandido, DCTLUI_CHECK_BOX, ${d.expandido})
DEFINE_UI_PARAMS(p_Intensidade, Intensidade do look, DCTLUI_SLIDER_FLOAT, ${lit(d.intensidade).slice(0, -1)}, 0.0, 100.0, 1.0)
${barra('p_Luz', 'luz')}
${barra('p_Temperatura', 'temperatura')}
${barra('p_Tint', 'tint')}
${barra('p_Contraste', 'contraste')}
${barra('p_Cor', 'cor')}
${barra('p_Altas', 'altas')}
${barra('p_Sombras', 'sombras')}
${barra('p_Preto', 'preto')}
${barra('p_Calor', 'calor')}
${barra('p_Estilo', 'estilo')}
${barra('p_Densidade', 'densidade')}
${barra('p_Branqueamento', 'branqueamento')}
${barra('p_PeleMatiz', 'peleMatiz')}
${barra('p_PeleSat', 'peleSat')}
${barra('p_Pele', 'pele')}
${barra('p_Desbotar', 'desbotar')}

__CONSTANT__ float GRAUS = 57.2957795f;
__CONSTANT__ float PI_ = 3.14159265f;
__CONSTANT__ float L_CINZA = ${lit(K.L_CINZA)};
__CONSTANT__ float EPS_RAIZ = ${lit(K.EPS)};
__CONSTANT__ float RAIZ_DO_EPS = ${lit(K.RAIZ_EPS)};
__CONSTANT__ float INCL_RAIZ = ${lit(K.INCL)};
__CONSTANT__ float VEU_BASE = ${lit(0.18 * 2 ** -9)};
__CONSTANT__ float PISO_LOG = ${lit((0.18 * 2 ** -9) / 2)};
__CONSTANT__ float FOG = ${lit(FOG)};
__CONSTANT__ float LOG2_10 = ${lit(Math.log2(10))};
__CONSTANT__ float LOG10_2 = ${lit(Math.log10(2))};
__CONSTANT__ float MARGEM = ${lit(MARGEM)};
__CONSTANT__ float GAMUT_LIMIAR = ${lit(GAMUT_DA_TELA.LIMIAR)};
__CONSTANT__ float GAMUT_ESCALA = ${lit(GAMUT_DA_TELA.ESCALA)};
__CONSTANT__ float GAMUT_POTENCIA = ${lit(GAMUT_DA_TELA.POTENCIA)};
__CONSTANT__ float TOM_G = ${lit(tom.g)};
__CONSTANT__ float TOM_T1 = ${lit(tom.t1)};
__CONSTANT__ float TOM_M2 = ${lit(tom.m2)};
__CONSTANT__ float TOM_S2 = ${lit(tom.s2)};
__CONSTANT__ float SOBREPOE = ${lit(so)};

// matrizes do motor (src/cor/pelicula.js, copia.js, negativos.js, cena.js)
${matriz('M_DWG_2020', K.DWG_2020)}
${matriz('M_2020_DWG', K.R2020_DWG)}
${matriz('M_2020_LMS', K.DWG_LMS)}
${matriz('M_LMS_2020', K.LMS_DWG)}
${matriz('M_OK2', K.OK_M2)}
${matriz('M_OK2I', K.OK_M2i)}
${matriz('M_BRADFORD', K.BRADFORD)}
${matriz('M_DWG_BRADFORD', K.BRADFORD_DWG)}
${matriz('M_BRADFORD_DWG', K.DWG_BRADFORD)}
${matriz('M_DWG_P3', DWG_P3)}
${matriz('M_P3_DWG', P3_DWG)}
${matriz('M_P3_709', P3_709)}
${matriz('M_709_DWG', R709_DWG)}
${matriz('M_SEP_T', SEPARACAO.T)}
${matriz('M_SEP_D', SEPARACAO.D)}
${matriz('M_LUZ_D60', luzDe('D60'))}
${matriz('M_LUZ_D55', luzDe('D55'))}
${matriz('M_CORANTES', Mc)}
${matriz('M_CORANTES_I', Mi)}

__DEVICE__ float diParaLinear(float v) { return v <= 0.02740668f ? v / 10.44426855f : _exp2f(v / 0.07329248f - 7.0f) - 0.0075f; }
__DEVICE__ float linearParaDi(float x) { return x <= 0.00262409f ? x * 10.44426855f : (_log2f(x + 0.0075f) + 7.0f) * 0.07329248f; }
__DEVICE__ float luzDe(float3 v) { return ${lit(K.Y_DWG[0])} * v.x + ${lit(K.Y_DWG[1])} * v.y + ${lit(K.Y_DWG[2])} * v.z; }
__DEVICE__ float suave(float a, float b, float x) { float t = _clampf((x - a) / (b - a), 0.0f, 1.0f); return t * t * (3.0f - 2.0f * t); }
__DEVICE__ float distancia(float h, float centro) { return _fmod(_fmod(h - centro, 360.0f) + 540.0f, 360.0f) - 180.0f; }
__DEVICE__ float noMatiz(float h, float centro, float largura) { float d = _fabs(distancia(h, centro)); return d >= largura ? 0.0f : 0.5f + 0.5f * _cosf(PI_ * d / largura); }
__DEVICE__ float matizDe(float a, float b) { return _atan2f(b, a) * GRAUS; }

// a cor de fora do gamut volta para dentro em curva suave (nenhum canal negativo)
__DEVICE__ float puxar(float v, float ac) { float d = (ac - v) / ac; return d <= 0.8f ? v : ac - ac * (0.8f + 0.2f * _tanhf((d - 0.8f) / 0.2f)); }
__DEVICE__ float3 dentroDoGamut(float3 v) {
  float ac = _fmaxf(v.x, _fmaxf(v.y, v.z));
  if (!(ac > 0.0f)) return make_float3(0.0f, 0.0f, 0.0f);
  return make_float3(puxar(v.x, ac), puxar(v.y, ac), puxar(v.z, ac));
}

// Oklab pela luz da cena, passando pelo Rec.2020
__DEVICE__ float raiz(float v) { return v >= EPS_RAIZ ? _powf(v, 0.333333333f) : RAIZ_DO_EPS + (v - EPS_RAIZ) * INCL_RAIZ; }
__DEVICE__ float cubo(float f) { return f >= RAIZ_DO_EPS ? f * f * f : EPS_RAIZ + (f - RAIZ_DO_EPS) / INCL_RAIZ; }
__DEVICE__ float3 dwgParaOklab(float3 rgb) {
  float3 l = M_2020_LMS(dentroDoGamut(M_DWG_2020(rgb)));
  return M_OK2(make_float3(raiz(l.x), raiz(l.y), raiz(l.z)));
}
__DEVICE__ float3 oklabParaDwg(float3 lab) {
  float3 l = M_OK2I(lab);
  return M_2020_DWG(dentroDoGamut(M_LMS_2020(make_float3(cubo(l.x), cubo(l.y), cubo(l.z)))));
}

// primária: balanço de branco por adaptação cromática (Bradford), como a câmera faria
__DEVICE__ float3 balancear(float3 v, float temperatura, float tint) {
  if (temperatura == 0.0f && tint == 0.0f) return v;
  float mired = 1.0e6f / 6504.0f - 45.0f * temperatura;
  float T = _clampf(1.0e6f / mired, 4000.0f, 25000.0f);
  float x = T <= 7000.0f ? -4.607e9f / (T * T * T) + 2.9678e6f / (T * T) + 99.11f / T + 0.244063f : -2.0064e9f / (T * T * T) + 1.9018e6f / (T * T) + 247.48f / T + 0.23704f;
  float y = -3.0f * x * x + 2.87f * x - 0.275f;
  if (tint != 0.0f) {
    float den = -2.0f * x + 12.0f * y + 3.0f;
    float u = 4.0f * x / den;
    float w = 9.0f * y / den + 0.012f * tint;
    float d2 = 6.0f * u - 16.0f * w + 12.0f;
    x = 9.0f * u / d2;
    y = 4.0f * w / d2;
  }
  float3 a = M_BRADFORD(make_float3(x / y, 1.0f, (1.0f - x - y) / y));
  float3 c = M_DWG_BRADFORD(v);
  return M_BRADFORD_DWG(make_float3(c.x * ${lit(brancoD65[0])} / a.x, c.y * ${lit(brancoD65[1])} / a.y, c.z * ${lit(brancoD65[2])} / a.z));
}

// tom da cena antes do filme: altas, sombras e preto em log, em volta do cinza
__DEVICE__ float3 tomDaCena(float3 x, float altas, float sombras, float preto) {
  if (altas == 0.0f && sombras == 0.0f && preto == 0.0f) return x;
  float Y = _fmaxf(1.0e-9f, luzDe(x));
  float e = _log2f(Y / 0.18f);
  float e2 = e;
  if (e > 0.0f) e2 = e * (1.0f + 0.35f * altas * suave(0.0f, 3.0f, e));
  else e2 = e * (1.0f - 0.35f * sombras * suave(0.0f, 3.0f, -e));
  if (preto != 0.0f) e2 += (preto < 0.0f ? 2.0f : 1.0f) * preto * suave(-1.5f, -7.0f, e);
  float k = _exp2f(e2) * 0.18f / Y;
  return make_float3(x.x * k, x.y * k, x.z * k);
}

// negativo do look (por densidade): cada camada vê um pouco das vizinhas, tem pé e ombro, e as camadas conversam
__DEVICE__ float logCamada(float v) { float w = v + VEU_BASE; return w > PISO_LOG ? _log2f(w / 0.18f) : _log2f(PISO_LOG / 0.18f) + (w - PISO_LOG) / (PISO_LOG * 0.693147181f); }
__DEVICE__ float peOmbro(float e, float pe, float ombro) {
  if (e >= 0.0f) return ombro > 1.0e8f ? e : ombro * _tanhf(e / ombro);
  return pe > 1.0e8f ? e : pe * _tanhf(e / pe);
}
__DEVICE__ float3 negativoDoLook(float3 x, float contraste, float cn0, float cn1, float cn2, float tm0, float tm1, float tm2, float pe, float ombro, float s, float entre) {
  float d0 = contraste * cn0 * peOmbro(logCamada((1.0f - 2.0f * s) * x.x + s * x.y + s * x.z) + tm0, pe, ombro);
  float d1 = contraste * cn1 * peOmbro(logCamada(s * x.x + (1.0f - 2.0f * s) * x.y + s * x.z) + tm1, pe, ombro);
  float d2 = contraste * cn2 * peOmbro(logCamada(s * x.x + s * x.y + (1.0f - 2.0f * s) * x.z) + tm2, pe, ombro);
  float m = (d0 + d1 + d2) / 3.0f;
  return make_float3(0.18f * _exp2f(d0 + entre * (d0 - m)) - VEU_BASE, 0.18f * _exp2f(d1 + entre * (d1 - m)) - VEU_BASE, 0.18f * _exp2f(d2 + entre * (d2 - m)) - VEU_BASE);
}

// cor como no filme subtrativo, em Oklab
__DEVICE__ float3 corDoFilme(float3 x, float3 antes, int temAntes, int ehPb, float pb0, float pb1, float pb2, float vGira, float vCroma, float aGira, float aCroma, float pJunta, float pCroma, float pAncora, float sat, float satAltas, float satSombras, float densidade, float so0, float so1, float me0, float me1, float al0, float al1, float calor, float pele) {
  if (ehPb != 0) {
    float cinza = _fmaxf(0.0f, pb0 * x.x + pb1 * x.y + pb2 * x.z);
    return make_float3(cinza, cinza, cinza);
  }
  float3 lab = dwgParaOklab(x);
  float L = lab.x;
  float a = lab.y;
  float b = lab.z;
  float C = _hypotf(a, b);
  float h = matizDe(a, b);
  float Lr = L / L_CINZA;
  float comCor = C * C / (C * C + 0.0025f);
  if (C > 1.0e-6f) {
    float verde = noMatiz(h, 142.0f, 45.0f) * comCor;
    float azul = noMatiz(h, 250.0f, 40.0f) * comCor;
    float pl = noMatiz(h, 58.0f, 28.0f) * comCor;
    float dh = distancia(h, 58.0f);
    h += verde * vGira + azul * aGira - pl * pJunta * dh;
    C *= 1.0f + verde * (vCroma - 1.0f) + azul * (aCroma - 1.0f) + pl * (pCroma - 1.0f);
  }
  C *= sat * (1.0f - satAltas * suave(1.25f, 1.9f, Lr)) * (1.0f - satSombras * (1.0f - suave(0.35f, 0.85f, Lr)));
  L -= densidade * (_hypotf(C, 0.01f) - 0.01f) * suave(0.15f, 0.7f, Lr) * L;
  float r3 = L / L_CINZA;
  float ev = _log2f(_fmaxf(1.0e-6f, r3 * r3 * r3));
  float ws = 1.0f - suave(-4.5f, -0.5f, ev);
  float wa = suave(0.5f, 4.0f, ev);
  float wm = _expf(-((ev + 0.3f) * (ev + 0.3f)) / 4.5f);
  float refA = temAntes != 0 ? antes.y : a;
  float refB = temAntes != 0 ? antes.z : b;
  float Cr = _hypotf(refA, refB);
  float fora = 1.0f - 0.92f * noMatiz(matizDe(refA, refB), 52.0f, 38.0f) * (Cr * Cr / (Cr * Cr + 0.0025f));
  float da = (ws * so0 + wm * me0 + wa * al0) * fora;
  float db = (ws * so1 + wm * me1 + wa * al1) * fora;
  if (calor != 0.0f) {
    da += 0.006f * calor * wm;
    db += 0.02f * calor * wm;
    C *= 1.0f + 0.18f * calor * wm;
  }
  if (temAntes != 0 && pAncora > 0.0f) {
    float Ca = _hypotf(antes.y, antes.z);
    float ha = matizDe(antes.y, antes.z);
    float naPele = noMatiz(ha, 52.0f, 38.0f) * (Ca * Ca / (Ca * Ca + 0.0009f));
    if (naPele > 0.0f) {
      float alvo = ha - pJunta * noMatiz(ha, 58.0f, 28.0f) * distancia(ha, 58.0f);
      h += pAncora * naPele * distancia(alvo, h);
    }
  }
  a = C * _cosf(h / GRAUS) + da * Lr;
  b = C * _sinf(h / GRAUS) + db * Lr;
  if (pele != 0.0f && temAntes != 0) {
    float Cp = _hypotf(antes.y, antes.z);
    if (Cp > 0.02f) {
      float hp = matizDe(antes.y, antes.z);
      float w = pele * _fmaxf(0.0f, 1.0f - _fabs(distancia(hp, 58.0f)) / 30.0f) * suave(0.35f, 0.75f, antes.x / L_CINZA);
      a += (antes.y - a) * w;
      b += (antes.z - b) * w;
    }
  }
  return oklabParaDwg(make_float3(L, a, b));
}

// ─────────── negativos das fichas técnicas (curva de cada camada: stops -> densidade) ───────────
__DEVICE__ float softplus(float x) { return x > 30.0f ? x : _logf(1.0f + _expf(x)); }
__DEVICE__ float curvaNeg(int n, int j, float s) {
  float dmin = 0.0f, g = 0.0f, a = 0.0f, w1 = 1.0f, b = 0.0f, w2 = 1.0f;
${NEGATIVOS.map(
  (n, i) =>
    `  if (n == ${i + 1}) {\n${camadas(n)
      .map((t, j) => `    ${j ? 'else ' : ''}${j < 2 ? `if (j == ${j}) ` : ''}{ dmin = ${param(t, 0)}; g = ${param(t, 1)}; a = ${param(t, 2)}; w1 = ${param(t, 3)}; b = ${param(t, 4)}; w2 = ${param(t, 5)}; }`)
      .join('\n')}\n  }`,
).join('\n')}
  float u = w1 * softplus((s - a) / w1);
  return dmin + g * (u - w2 * softplus((u - (b - a)) / w2));
}
// densidade no cinza e inclinação no cinza (densidade por log10 da exposição), com a revelação normal
${tabela('baseNeg', NEGATIVOS.map((n) => camadas(n).map((t) => curvaNeg(t, 0))))}
${tabela('gamaNeg', NEGATIVOS.map((n) => camadas(n).map((t) => (curvaNeg(t, 0.5) - curvaNeg(t, -0.5)) / Math.log10(2))))}
__DEVICE__ int negativoDeDia(int n) { return ${NEGATIVOS.map((n, i) => (n.luz === 'D' ? `n == ${i + 1}` : null)).filter(Boolean).join(' || ')} ? 1 : 0; }
__DEVICE__ int negativoFuji(int n) { return ${NEGATIVOS.map((n, i) => (n.fabricante === 'Fujifilm' ? `n == ${i + 1}` : null)).filter(Boolean).join(' || ')} ? 1 : 0; }
// densidade a mais que no cinza, camada j na exposição e (stops); revelação forçada sobe o contraste e o véu
__DEVICE__ float deltaNeg(int n, int j, float e, float ganho, float veuRev) {
  return ganho * (curvaNeg(n, j, e) - baseNeg(n, j)) + veuRev * (1.0f - _expf(-_fmaxf(0.0f, -e) / 3.0f));
}
// exposição das camadas, em stops sobre o cinza
__DEVICE__ float3 exposicaoNeg(int n, float3 rgb) {
  float3 e = negativoDeDia(n) != 0 ? M_SEP_D(rgb) : M_SEP_T(rgb);
  float3 f = dentroDoGamut(e);
  return make_float3(_log2f((f.x + FOG) / (0.18f + FOG)), _log2f((f.y + FOG) / (0.18f + FOG)), _log2f((f.z + FOG) / (0.18f + FOG)));
}
// o negativo escaneado, sem cópia
__DEVICE__ float camadaScan(int n, int j, float e, float ganho, float veuRev, float lam) {
  float g0 = ganho * gamaNeg(n, 0);
  float g1 = ganho * gamaNeg(n, 1);
  float g2 = ganho * gamaNeg(n, 2);
  float gj = j == 0 ? g0 : (j == 1 ? g1 : g2);
  float s = deltaNeg(n, j, e, ganho, veuRev) / (gj * LOG10_2);
  float mesmo = (deltaNeg(n, 0, e, ganho, veuRev) / g0 + deltaNeg(n, 1, e, ganho, veuRev) / g1 + deltaNeg(n, 2, e, ganho, veuRev) / g2) / (3.0f * LOG10_2);
  return (0.18f + FOG) * _exp2f(mesmo + lam * (s - mesmo)) - FOG;
}
__DEVICE__ float3 scanEmCena(float3 rgb, int n, float rev) {
  float ganho = 1.0f + 0.12f * rev;
  float veuRev = 0.03f * _fmaxf(0.0f, rev);
  float lam = negativoFuji(n) != 0 ? 0.5f : 1.0f;
  float3 e = exposicaoNeg(n, rgb);
  return M_P3_DWG(make_float3(camadaScan(n, 0, e.x, ganho, veuRev, lam), camadaScan(n, 1, e.y, ganho, veuRev, lam), camadaScan(n, 2, e.z, ganho, veuRev, lam)));
}

// ─────────── cópias de cinema (curvas das fichas: log10 da exposição -> densidade) ───────────
__DEVICE__ float densCopia(int c, int j, float x) {
  float k = 1.0f, x0 = 0.0f, nu = 1.0f, dmin = 0.0f, dmax = 1.0f;
${COPIAS.map(
  (c, i) =>
    `  if (c == ${i + 1}) {\n${c.curvas
      .map((cv, j) => `    ${j ? 'else ' : ''}${j < 2 ? `if (j == ${j}) ` : ''}{ k = ${lit(cv.k)}; x0 = ${lit(cv.x0)}; nu = ${lit(cv.nu)}; dmin = ${lit(cv.dmin)}; dmax = ${lit(cv.dmax)}; }`)
      .join('\n')}\n  }`,
).join('\n')}
  return dmin + (dmax - dmin) * _powf(1.0f + _expf(-k * (x - x0)), -1.0f / nu);
}
${tabela('dminCopia', COPIAS.map((c) => c.curvas.map((cv) => cv.dmin)))}
// luzes de copiagem (onde cada camada põe o cinza na densidade de laboratório) e a inclinação da curva ali
${tabela('xCinzaCopia', xCinza)}
${tabela('gamaCopia', gamaC)}
__DEVICE__ float cruzamentoCopia(int c) { return ${COPIAS.map((c, i) => `c == ${i + 1} ? ${lit(c.cruzamento)}`).join(' : ')} : 1.0f; }
__DEVICE__ int copiaEquilibrada(int c) { return ${COPIAS.map((c, i) => (c.equilibrar ? `c == ${i + 1}` : null)).filter(Boolean).join(' || ') || '0 == 1'} ? 1 : 0; }

// negativo + cópia de uma camada, pelo log10 da luz da cena relativo ao cinza
__DEVICE__ float integralCopia(int c, int n, int j, float e, float ganho, float veuRev, float fator) {
  float noNeg = n > 0 ? fator * deltaNeg(n, j, e * LOG2_10, ganho, veuRev) : ${lit(NEUTRO.gamaCopia)} / gamaCopia(c, j) * e;
  return densCopia(c, j, xCinzaCopia(c, j) - noNeg) - dminCopia(c, j);
}
// densidade só do corante da camada i
__DEVICE__ float corante(int c, int n, int i, float e, float ganho, float veuRev, float f0, float f1, float f2) {
  float ec = _clampf(e, -5.0f, 4.0f);
  float i0 = integralCopia(c, n, 0, ec, ganho, veuRev, f0);
  float i1 = integralCopia(c, n, 1, ec, ganho, veuRev, f1);
  float i2 = integralCopia(c, n, 2, ec, ganho, veuRev, f2);
  float media = (i0 + i1 + i2) / 3.0f;
  float lam = cruzamentoCopia(c);
  float3 a = M_CORANTES_I(make_float3(dminCopia(c, 0) + media + lam * (i0 - media), dminCopia(c, 1) + media + lam * (i1 - media), dminCopia(c, 2) + media + lam * (i2 - media)));
  return i == 0 ? a.x : (i == 1 ? a.y : a.z);
}
__DEVICE__ float luzDaCopia(float d, float abre) {
  float e = abre == 1.0f ? d : (d < 0.0f ? _powf(_fmaxf(0.0f, 1.0f + d), abre) - 1.0f : d * abre);
  return MARGEM * 0.1f * _powf(10.0f, -e);
}
// a tela que a cópia daria (Rec.709 linear, 1 = pico)
__DEVICE__ float3 telaDaCopia(float3 rgb, int c, int n, float rev, int expandido) {
  float ganho = 1.0f + 0.12f * rev;
  float veuRev = 0.03f * _fmaxf(0.0f, rev);
  float f0 = 1.0f;
  float f1 = 1.0f;
  float f2 = 1.0f;
  if (n > 0 && copiaEquilibrada(c) != 0) {
    float s0 = ganho * gamaNeg(n, 0) * gamaCopia(c, 0);
    float s1 = ganho * gamaNeg(n, 1) * gamaCopia(c, 1);
    float s2 = ganho * gamaNeg(n, 2) * gamaCopia(c, 2);
    float media = (s0 + s1 + s2) / 3.0f;
    f0 = media / s0;
    f1 = media / s1;
    f2 = media / s2;
  }
  float3 e = make_float3(0.0f, 0.0f, 0.0f);
  if (n > 0) {
    float3 st = exposicaoNeg(n, rgb);
    e = make_float3(st.x / LOG2_10, st.y / LOG2_10, st.z / LOG2_10);
  } else {
    float3 p = dentroDoGamut(M_DWG_P3(rgb));
    float q0 = (1.0f - 2.0f * SOBREPOE) * p.x + SOBREPOE * p.y + SOBREPOE * p.z;
    float q1 = SOBREPOE * p.x + (1.0f - 2.0f * SOBREPOE) * p.y + SOBREPOE * p.z;
    float q2 = SOBREPOE * p.x + SOBREPOE * p.y + (1.0f - 2.0f * SOBREPOE) * p.z;
    e = make_float3(_log10f((q0 + FOG) / (0.18f + FOG)), _log10f((q1 + FOG) / (0.18f + FOG)), _log10f((q2 + FOG) / (0.18f + FOG)));
  }
  float3 D = M_CORANTES(make_float3(corante(c, n, 0, e.x, ganho, veuRev, f0, f1, f2), corante(c, n, 1, e.y, ganho, veuRev, f0, f1, f2), corante(c, n, 2, e.z, ganho, veuRev, f0, f1, f2)));
  float abre = expandido != 0 ? 1.08f : 1.0f;
  return M_P3_709(make_float3(luzDaCopia(D.x - dminCopia(c, 0) - 1.0f, abre), luzDaCopia(D.y - dminCopia(c, 1) - 1.0f, abre), luzDaCopia(D.z - dminCopia(c, 2) - 1.0f, abre)));
}

// ─────────── a volta da tela Rec.709 até a luz da cena (src/cor/cena.js) ───────────
__DEVICE__ float comprimirDistancia(float d) {
  if (d < GAMUT_LIMIAR) return d;
  float n = (d - GAMUT_LIMIAR) / GAMUT_ESCALA;
  return GAMUT_LIMIAR + GAMUT_ESCALA * n / _powf(1.0f + _powf(n, GAMUT_POTENCIA), 1.0f / GAMUT_POTENCIA);
}
__DEVICE__ float descomprimirDistancia(float d) {
  if (d < GAMUT_LIMIAR) return d;
  float y = _fminf(0.999999f, (d - GAMUT_LIMIAR) / GAMUT_ESCALA);
  return GAMUT_LIMIAR + GAMUT_ESCALA * y / _powf(1.0f - _powf(y, GAMUT_POTENCIA), 1.0f / GAMUT_POTENCIA);
}
__DEVICE__ float3 comprimirGamutTela(float3 v) {
  float ac = _fmaxf(v.x, _fmaxf(v.y, v.z));
  if (ac <= 0.0f) return make_float3(0.0f, 0.0f, 0.0f);
  return make_float3(ac - comprimirDistancia((ac - v.x) / ac) * ac, ac - comprimirDistancia((ac - v.y) / ac) * ac, ac - comprimirDistancia((ac - v.z) / ac) * ac);
}
__DEVICE__ float3 descomprimirGamutTela(float3 v) {
  float ac = _fmaxf(v.x, _fmaxf(v.y, v.z));
  if (ac <= 0.0f) return make_float3(0.0f, 0.0f, 0.0f);
  return make_float3(ac - descomprimirDistancia(_clampf((ac - v.x) / ac, 0.0f, 1.0f)) * ac, ac - descomprimirDistancia(_clampf((ac - v.y) / ac, 0.0f, 1.0f)) * ac, ac - descomprimirDistancia(_clampf((ac - v.z) / ac, 0.0f, 1.0f)) * ac);
}
__DEVICE__ float normaTela(float3 v) {
  float Y = _fmaxf(0.0f, ${lit(Y709[0])} * v.x + ${lit(Y709[1])} * v.y + ${lit(Y709[2])} * v.z);
  float m = 0.2f * _fmaxf(0.0f, _fmaxf(v.x, _fmaxf(v.y, v.z)));
  return _powf((Y * Y * Y * Y + m * m * m * m) / 1.0016f, 0.25f);
}
__DEVICE__ float paraOBranco(float hn) { return 0.9f * _powf(suave(0.55f, 1.0f, hn), 1.5f); }
__DEVICE__ float tomVolta(float h) {
  if (!(h > 0.0f)) return 0.0f;
  float f = (h + _sqrtf(h * h + 4.0f * h * TOM_T1)) / 2.0f;
  float y = _fminf(0.999999f, _powf(f / TOM_M2, 1.0f / TOM_G));
  return TOM_S2 * y / (1.0f - y);
}
__DEVICE__ float3 razaoTela(float3 misto, float k, float s) { return make_float3((s * misto.x - k) / (1.0f - k), (s * misto.y - k) / (1.0f - k), (s * misto.z - k) / (1.0f - k)); }
__DEVICE__ float3 inverterTela(float3 lin) {
  float h = normaTela(lin);
  if (!(h > 1.0e-7f)) return make_float3(0.0f, 0.0f, 0.0f);
  float k = paraOBranco(h);
  float3 misto = make_float3(lin.x / h, lin.y / h, lin.z / h);
  float n = tomVolta(h);
  if (k == 0.0f) return M_709_DWG(make_float3(misto.x * n, misto.y * n, misto.z * n));
  // perto do pico a cor foi para o branco: acha a escala que devolve norma 1 (secante; se não fechar, bisseção)
  float s0 = 1.0f;
  float s1 = 1.01f;
  float e0 = normaTela(razaoTela(misto, k, s0)) - 1.0f;
  float e1 = normaTela(razaoTela(misto, k, s1)) - 1.0f;
  for (int i = 0; i < 12; i++) {
    if (!(_fabs(e1) > 1.0e-6f) || e1 == e0) break;
    float s2 = s1 - e1 * (s1 - s0) / (e1 - e0);
    s0 = s1;
    e0 = e1;
    s1 = s2;
    e1 = normaTela(razaoTela(misto, k, s1)) - 1.0f;
  }
  if (!(_fabs(e1) <= 1.0e-4f && s1 > 0.0f && s1 < 64.0f)) {
    float lo = 0.0f;
    float hi = 64.0f;
    for (int i = 0; i < 30; i++) {
      float meio = (lo + hi) / 2.0f;
      if (normaTela(razaoTela(misto, k, meio)) < 1.0f) lo = meio;
      else hi = meio;
    }
    s1 = (lo + hi) / 2.0f;
  }
  float3 r = razaoTela(misto, k, s1);
  return M_709_DWG(make_float3(r.x * n, r.y * n, r.z * n));
}
__DEVICE__ float3 copiaEmCena(float3 rgb, int c, int n, float rev, int expandido) {
  float3 l = comprimirGamutTela(telaDaCopia(rgb, c, n, rev, expandido));
  return inverterTela(descomprimirGamutTela(make_float3(_fminf(0.985f, _clampf(l.x, 0.0f, 1.0f)), _fminf(0.985f, _clampf(l.y, 0.0f, 1.0f)), _fminf(0.985f, _clampf(l.z, 0.0f, 1.0f)))));
}

// cópia (ou o negativo escaneado, sem cópia) com a âncora da pele: fica o desenho da cópia, sai a deriva do matiz
__DEVICE__ float3 filmeEmCena(float3 y, int c, int n, float rev, int expandido) {
  if (c > 0) return copiaEmCena(y, c, n, rev, expandido);
  return scanEmCena(y, n, rev);
}
__DEVICE__ float3 copiar(float3 y, float3 antes, int c, int n, float rev, int expandido, float ancora) {
  float3 z = filmeEmCena(y, c, n, rev, expandido);
  if (!(ancora > 0.0f)) return z;
  float Ca = _hypotf(antes.y, antes.z) / _fmaxf(antes.x, 0.02f);
  float naPele = noMatiz(matizDe(antes.y, antes.z), 52.0f, 38.0f) * (Ca * Ca / (Ca * Ca + 0.0025f));
  if (!(naPele > 0.001f)) return z;
  float Lr = dwgParaOklab(y).x / L_CINZA;
  if (!(Lr > 0.05f)) return z;
  float k = _clampf(1.0f / (Lr * Lr * Lr), 0.03125f, 32.0f);
  float3 meio = dwgParaOklab(filmeEmCena(make_float3(y.x * k, y.y * k, y.z * k), c, n, rev, expandido));
  float3 zl = dwgParaOklab(z);
  float C = _hypotf(zl.y, zl.z);
  if (!(C > 1.0e-6f) || !(_hypotf(meio.y, meio.z) > 1.0e-6f)) return z;
  float h = matizDe(zl.y, zl.z);
  h += ancora * naPele * distancia(matizDe(meio.y, meio.z), h);
  return oklabParaDwg(make_float3(zl.x, C * _cosf(h / GRAUS), C * _sinf(h / GRAUS)));
}

// pele: matiz e saturação só onde a cena tem pele, depois do filme
__DEVICE__ float3 ajustarPele(float3 y, float3 antes, float peleMatiz, float peleSat) {
  float Ca = _hypotf(antes.y, antes.z) / _fmaxf(antes.x, 0.02f);
  float w = noMatiz(matizDe(antes.y, antes.z), 55.0f, 32.0f) * (Ca * Ca / (Ca * Ca + 0.0025f));
  if (!(w > 0.001f)) return y;
  float3 lab = dwgParaOklab(y);
  float C = _hypotf(lab.y, lab.z) * (1.0f + 0.35f * peleSat * w);
  float h = matizDe(lab.y, lab.z) + 10.0f * peleMatiz * w;
  return oklabParaDwg(make_float3(lab.x, C * _cosf(h / GRAUS), C * _sinf(h / GRAUS)));
}
// sem branqueamento: a prata que fica soma densidade neutra
__DEVICE__ float3 semBranqueamento(float3 y, float b) {
  float Y = _fmaxf(1.0e-9f, luzDe(y));
  float Y2 = 0.18f * _powf(Y / 0.18f, 1.0f + 0.3f * b);
  float fica = 1.0f - 0.55f * b;
  return make_float3(Y2 * (1.0f + (y.x / Y - 1.0f) * fica), Y2 * (1.0f + (y.y / Y - 1.0f) * fica), Y2 * (1.0f + (y.z / Y - 1.0f) * fica));
}

__DEVICE__ float3 transform(int p_Width, int p_Height, int p_X, int p_Y, float p_R, float p_G, float p_B)
{
  // o look escolhido (só o que foge do neutro)
  float contraste = 1.0f, cn0 = 1.0f, cn1 = 1.0f, cn2 = 1.0f, tm0 = 0.0f, tm1 = 0.0f, tm2 = 0.0f, pe = 1.0e9f, ombro = 1.0e9f;
  float sens = 0.0f, entre = 0.0f, dens = 0.0f, sat = 1.0f, satAltas = 0.0f, satSombras = 0.0f;
  float vGira = 0.0f, vCroma = 1.0f, aGira = 0.0f, aCroma = 1.0f, pJunta = 0.0f, pCroma = 1.0f, pAncora = 0.0f;
  float so0 = 0.0f, so1 = 0.0f, me0 = 0.0f, me1 = 0.0f, al0 = 0.0f, al1 = 0.0f, veuP = 0.0f, pb0 = 0.0f, pb1 = 0.0f, pb2 = 0.0f;
  int ehPb = 0, copiaBase = 0, negBase = 0;
${LOOKS_DO_NO.map((p, i) => `  if (p_Look == ${i}) { ${carregarPerfil(p)} } // ${p.nome}`).join('\n')}

  // os ajustes do Lab, nas mesmas unidades
  float ganho = _exp2f(p_Luz / 100.0f * 2.0f);
  float temperatura = p_Temperatura / 100.0f;
  float tint = p_Tint / 100.0f;
  float calor = p_Calor / 100.0f;
  float pele = p_Pele / 100.0f;
  float estilo = p_Estilo / 100.0f;
  float branqueamento = p_Branqueamento / 100.0f;
  float peleMatiz = p_PeleMatiz / 100.0f;
  float peleSat = p_PeleSat / 100.0f;
  float veu = veuP + p_Desbotar / 100.0f * 1.8f;
  float t = _clampf(p_Intensidade / 100.0f, 0.0f, 1.0f);
  contraste = contraste * (1.0f + p_Contraste / 100.0f * 0.35f);
  sat = sat * _fmaxf(0.0f, 1.0f + p_Cor / 100.0f);
  dens = dens + 0.3f * p_Densidade / 100.0f;
  // estilo: moderno (sombra petróleo, alta quente) ou retrô (sombra quente, alta fria), somado à separação do look
  if (estilo >= 0.0f) { so0 += -0.008f * estilo; so1 += -0.014f * estilo; al0 += 0.005f * estilo; al1 += 0.014f * estilo; }
  else { so0 += 0.006f * -estilo; so1 += 0.013f * -estilo; al0 += -0.004f * -estilo; al1 += -0.011f * -estilo; }

  // a película em uso: a do look, a não ser que a pessoa troque
  int cop = p_Copia == 0 ? copiaBase : p_Copia - 1;
  int neg = p_Negativo == 0 ? negBase : p_Negativo - 1;
  float rev = (float)(p_Revelacao) - 1.0f;
  int temFilme = (cop > 0 || neg > 0) ? 1 : 0;
  int temAntes = (pele != 0.0f || peleMatiz != 0.0f || peleSat != 0.0f || pAncora > 0.0f || temFilme != 0) ? 1 : 0;
  int firme = ((pAncora > 0.0f && temFilme != 0) || (neg > 0 && cop > 0 && copiaEquilibrada(cop) != 0)) ? 1 : 0;
  float ancora = _fmaxf(${lit(NEUTRO.ancoraCopia)}, _fmaxf(pele, firme != 0 ? 0.95f : 0.0f));

  // primária -> tom da cena -> negativo -> cor -> cópia -> luz do projetor -> pele -> branqueamento -> véu
  float3 p0 = balancear(make_float3(diParaLinear(p_R) * ganho, diParaLinear(p_G) * ganho, diParaLinear(p_B) * ganho), temperatura, tint);
  float3 x = dentroDoGamut(tomDaCena(p0, p_Altas / 100.0f, p_Sombras / 100.0f, p_Preto / 100.0f));
  float3 antes = make_float3(0.0f, 0.0f, 0.0f);
  if (temAntes != 0) antes = dwgParaOklab(x);
  float3 y = x;
  if (neg == 0) y = negativoDoLook(x, contraste, cn0, cn1, cn2, tm0, tm1, tm2, pe, ombro, sens, entre);
  y = dentroDoGamut(corDoFilme(y, antes, temAntes, ehPb, pb0, pb1, pb2, vGira, vCroma, aGira, aCroma, pJunta, pCroma, pAncora, sat, satAltas, satSombras, dens, so0, so1, me0, me1, al0, al1, calor, pele));
  if (temFilme != 0) y = copiar(y, antes, cop, neg, rev, p_Expandido, ancora);
  if (cop > 0 && p_LuzCopia == 1) y = M_LUZ_D60(y);
  if (cop > 0 && p_LuzCopia == 2) y = M_LUZ_D55(y);
  if (peleMatiz != 0.0f || peleSat != 0.0f) y = ajustarPele(y, antes, peleMatiz, peleSat);
  if (branqueamento != 0.0f) y = semBranqueamento(y, branqueamento);
  if (veu != 0.0f) y = make_float3(y.x + veu * 0.005f, y.y + veu * 0.005f, y.z + veu * 0.005f);

  // intensidade: mistura em log entre a primária (que vale sempre) e o look, como um nó com opacidade
  float r = linearParaDi(y.x);
  float g = linearParaDi(y.y);
  float b = linearParaDi(y.z);
  if (t < 1.0f) {
    float r0 = linearParaDi(p0.x);
    float g0 = linearParaDi(p0.y);
    float b0 = linearParaDi(p0.z);
    r = linearParaDi(diParaLinear(r0 + (r - r0) * t));
    g = linearParaDi(diParaLinear(g0 + (g - g0) * t));
    b = linearParaDi(diParaLinear(b0 + (b - b0) * t));
  }
  return make_float3(r, g, b);
}
`
}
