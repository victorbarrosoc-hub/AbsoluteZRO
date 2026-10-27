// Revela · looks prontos da plataforma. O primeiro é o Revela Look: uma emulação de película feita aqui, do zero, em
// Oklab (luz e cor separadas), no mesmo formato do look por referência: `aplicar(r, g, b, intensidade)` em código
// Rec.709 (o frame já convertido do LOG, como na tela de LUT) e um `resumo` para a leitura.
//
// O caminho, na ordem de uma cópia de cinema:
//   1. curva de filme: preto um pouco aberto (leitoso), meio-tom com contraste, altas que deitam em vez de estourar;
//   2. densidade: cor saturada fica um pouco mais escura, como no filme (subtrativo), em vez de "acender";
//   3. matizes: verde puxa para oliva, azul para petróleo, pele se junta em volta do tom de pele;
//   4. saturação por luz: cheia no meio, menor nas altas (o filme desatura perto do branco) e nas sombras;
//   5. separação: sombras frias (petróleo), altas quentes (âmbar), meio quase neutro.

import { codigoParaOklab, oklabParaCodigo } from './oklab.js'

const limitar = (v, [a, b]) => Math.min(b, Math.max(a, v))
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a), [0, 1])
  return t * t * (3 - 2 * t)
}
const GRAU = Math.PI / 180

// matiz em Oklab (graus): pele ~ 45–75, amarelo ~ 105, verde ~ 140, ciano ~ 195, azul ~ 265
const distancia = (h, centro) => {
  const d = ((((h - centro) % 360) + 540) % 360) - 180
  return d
}
/** Peso 1 no centro do matiz, caindo até 0 a `largura` graus. */
const noMatiz = (h, centro, largura) => {
  const d = Math.abs(distancia(h, centro))
  return d >= largura ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / largura)
}

// a primeira versão do motor (25/10/2026): base dos outros looks, que continuam iguais
const BASE = {
  id: 'revela',
  nome: 'Revela Look',
  preto: 0.045, // L do preto: aberto, sem esmagar
  branco: 0.962, // L do branco: deita antes de estourar
  contraste: 5.2, // inclinação do S no meio
  pivo: 0.47,
  densidade: 0.16, // quanto a cor saturada escurece (× croma)
  verde: { centro: 142, largura: 45, gira: -16, croma: 0.82 },
  azul: { centro: 255, largura: 40, gira: -12, croma: 0.9 },
  pele: { centro: 60, largura: 28, junta: 0.35, croma: 1.0 },
  sombras: [-0.008, -0.016], // petróleo
  altas: [0.005, 0.018], // âmbar
  saturacao: 1, // croma geral (0 = preto e branco)
}

/**
 * Revela Look (26/10/2026): a base de película com a luz e a temperatura de um grade de produção, lidas nos stills do
 * titular (Rec.709 → o grade dele, fora do repositório): meio-tom bem mais claro com preto e branco no lugar, sombra
 * neutra, meio-tom dourado com o branco quase neutro, cor um pouco mais contida. Os matizes (verde, azul, pele) são os da base: o ajuste é
 * só de luz e temperatura, e o look continua sendo este motor, não uma LUT copiada. Erro médio nessas cenas: 6,2 → 3,3
 * (ΔE Oklab ×100). Para o grade exato de alguém, o caminho é Clonar LUT + "Salvar como meu look".
 */
export const REVELA_LOOK = {
  ...BASE,
  gama: 1.2,
  contraste: 7,
  pivo: 0.28, // com o gama, o meio-tom sobe e as pontas ficam
  preto: 0.05,
  branco: 0.97,
  densidade: 0.25,
  sombras: [0.001, 0.0024], // sombra neutra
  meios: [-0.01, 0.026], // meio-tom dourado (pele, madeira)
  altas: [-0.003, 0.008], // branco quase neutro
  saturacao: 0.95,
}

/**
 * Os looks da Revela: o mesmo motor de película, com outra curva, outra densidade e outra separação. Todos são feitos
 * aqui, do zero (nenhum vem de pack de terceiros). A ordem é a da grade na tela de LUT.
 */
export const LOOKS = [
  REVELA_LOOK,
  {
    ...BASE,
    id: 'suave',
    nome: 'Suave',
    frases: ['Preto leitoso, pouco contraste.', 'Cor contida, separação leve.'],
    preto: 0.12, // preto leitoso, de cópia lavada
    branco: 0.93,
    contraste: 3,
    densidade: 0.08,
    saturacao: 0.7,
    sombras: [0.002, -0.012],
    altas: [0.006, 0.016],
  },
  {
    ...BASE,
    id: 'petroleo',
    nome: 'Petróleo',
    frases: ['Mais contraste.', 'Sombras petróleo, altas laranja.'],
    contraste: 6.4,
    saturacao: 1.1,
    sombras: [-0.026, -0.04], // sombra fria mais funda
    altas: [0.02, 0.045], // alta laranja
  },
  {
    ...BASE,
    id: 'dourado',
    nome: 'Dourado',
    frases: ['Verde mais oliva.', 'Sombras e altas quentes.'],
    verde: { ...BASE.verde, gira: -24, croma: 0.74 },
    saturacao: 1.08,
    sombras: [0.012, 0.02], // sombra quente
    altas: [0.016, 0.05],
  },
  {
    ...BASE,
    id: 'pb',
    nome: 'P&B',
    frases: ['Preto e branco com a curva de filme.'],
    contraste: 6.2,
    densidade: 0,
    saturacao: 0,
    sombras: [0, 0],
    altas: [0, 0],
  },
]

/** Curva de filme em L (0–1): S logístico misturado com a reta, preto e branco deslocados. Monótona. */
export function curvaDeFilme(L, p = REVELA_LOOK) {
  // gama (padrão 1): abre ou fecha o meio-tom sem mexer no preto e no branco
  const Lg = limitar(L, [0, 1]) ** (p.gama ?? 1)
  const g = (x) => 1 / (1 + Math.exp(-p.contraste * (x - p.pivo)))
  const s = (g(Lg) - g(0)) / (g(1) - g(0))
  const x = 0.6 * s + 0.4 * Lg
  return p.preto + (p.branco - p.preto) * x
}

/**
 * Um look da Revela (`opcoes.look`: id de `LOOKS`, padrão o Revela Look). `opcoes.tom` / `opcoes.cor` (padrão true)
 * ligam só a curva ou só a cor, como na tela; `opcoes.intensidade` (0–1, padrão 1).
 */
export function criarRevelaLook(opcoes = {}) {
  const p = LOOKS.find((l) => l.id === opcoes.look) ?? REVELA_LOOK
  const intensidade = limitar(opcoes.intensidade ?? 1, [0, 1])
  const usarTom = opcoes.tom ?? true
  const usarCor = opcoes.cor ?? true

  function emOklab(L, a, b, t = intensidade) {
    let L2 = usarTom ? curvaDeFilme(L, p) : L
    let a2 = a
    let b2 = b
    if (usarCor) {
      let C = Math.hypot(a, b)
      let h = C > 1e-6 ? Math.atan2(b, a) / GRAU : 0
      if (C > 1e-6) {
        const verde = noMatiz(h, p.verde.centro, p.verde.largura)
        const azul = noMatiz(h, p.azul.centro, p.azul.largura)
        const pele = noMatiz(h, p.pele.centro, p.pele.largura)
        h += verde * p.verde.gira + azul * p.azul.gira - pele * p.pele.junta * distancia(h, p.pele.centro)
        C *= 1 + verde * (p.verde.croma - 1) + azul * (p.azul.croma - 1)
      }
      // saturação por luz: meio cheio, altas e sombras mais contidas
      C *= p.saturacao * (1.1 - 0.4 * suave(0.72, 1, L2) - 0.15 * (1 - suave(0.04, 0.22, L2)))
      L2 -= p.densidade * C * suave(0.1, 0.5, L2)
      a2 = C * Math.cos(h * GRAU)
      b2 = C * Math.sin(h * GRAU)
      const sombra = 1 - suave(0.12, 0.5, L2)
      const alta = suave(0.55, 0.95, L2)
      // meios (opcional): tom no meio-tom que some antes do branco, para esquentar a pele sem amarelar o branco
      const meio = suave(0.3, 0.6, L2) * (1 - suave(0.82, 1, L2))
      const [ma, mb] = p.meios ?? [0, 0]
      a2 += sombra * p.sombras[0] + alta * p.altas[0] + meio * ma
      b2 += sombra * p.sombras[1] + alta * p.altas[1] + meio * mb
    }
    return [L + (L2 - L) * t, a + (a2 - a) * t, b + (b2 - b) * t]
  }

  return {
    preset: p.id,
    nome: p.nome,
    aplicar(r, g, b, t = intensidade) {
      const [L, a, bb] = codigoParaOklab(r, g, b)
      const o = emOklab(L, a, bb, limitar(t, [0, 1]))
      return oklabParaCodigo(o[0], o[1], o[2])
    },
    emOklab,
    resumo: {
      intensidade,
      tom: usarTom ? { preto: curvaDeFilme(0, p), cinza: curvaDeFilme(0.5, p), branco: curvaDeFilme(1, p) } : { preto: 0, cinza: 0.5, branco: 1 },
      frases: p.frases ?? [
        'Curva de filme: preto aberto, meio com contraste, altas que deitam.',
        'Densidade: cor forte fica mais escura, como no filme.',
        'Verde puxa para oliva, azul para petróleo, pele se junta.',
        'Sombras frias, altas quentes.',
      ],
    },
  }
}
