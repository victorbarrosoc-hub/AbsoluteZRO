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

export const REVELA_LOOK = {
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
}

/** Curva de filme em L (0–1): S logístico misturado com a reta, preto e branco deslocados. Monótona. */
export function curvaDeFilme(L, p = REVELA_LOOK) {
  const g = (x) => 1 / (1 + Math.exp(-p.contraste * (x - p.pivo)))
  const s = (g(L) - g(0)) / (g(1) - g(0))
  const x = 0.6 * s + 0.4 * limitar(L, [0, 1])
  return p.preto + (p.branco - p.preto) * x
}

/**
 * Revela Look. `opcoes.tom` / `opcoes.cor` (padrão true) ligam só a curva ou só a cor, como na tela;
 * `opcoes.intensidade` (0–1, padrão 1).
 */
export function criarRevelaLook(opcoes = {}) {
  const p = REVELA_LOOK
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
      C *= 1.1 - 0.4 * suave(0.72, 1, L2) - 0.15 * (1 - suave(0.04, 0.22, L2))
      L2 -= p.densidade * C * suave(0.1, 0.5, L2)
      a2 = C * Math.cos(h * GRAU)
      b2 = C * Math.sin(h * GRAU)
      const sombra = 1 - suave(0.12, 0.5, L2)
      const alta = suave(0.55, 0.95, L2)
      a2 += sombra * p.sombras[0] + alta * p.altas[0]
      b2 += sombra * p.sombras[1] + alta * p.altas[1]
    }
    return [L + (L2 - L) * t, a + (a2 - a) * t, b + (b2 - b) * t]
  }

  return {
    preset: p.id,
    aplicar(r, g, b, t = intensidade) {
      const [L, a, bb] = codigoParaOklab(r, g, b)
      const o = emOklab(L, a, bb, limitar(t, [0, 1]))
      return oklabParaCodigo(o[0], o[1], o[2])
    },
    emOklab,
    resumo: {
      intensidade,
      tom: usarTom ? { preto: curvaDeFilme(0, p), cinza: curvaDeFilme(0.5, p), branco: curvaDeFilme(1, p) } : { preto: 0, cinza: 0.5, branco: 1 },
      frases: [
        'Curva de filme: preto aberto, meio com contraste, altas que deitam.',
        'Densidade: cor forte fica mais escura, como no filme.',
        'Verde puxa para oliva, azul para petróleo, pele se junta.',
        'Sombras frias, altas quentes.',
      ],
    },
  }
}
