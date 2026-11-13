// O símbolo do app (o anel com o raio que atravessa), na cor do texto. A geometria é a de scripts/marca.mjs: o anel de
// raio 30 e traço 8,6 e o caminho do raio são os mesmos de app/marca/simbolo.svg (test/casca.test.js confere).
// Pequeno, no topo, é a assinatura. No início ele é o protagonista: `vivo` faz o anel se desenhar e o raio cruzar
// (CSS em casca.css; com "reduzir movimento" fica parado no desenho final).

import { cx, html } from '../preact.js'

export const RAIO_DO_SIMBOLO =
  'M33.6 -1.8C39.36 -0.81 42.24 -0.09 48 0C42.24 0.09 39.36 0.81 33.6 1.8L-33.6 1.8C-39.36 0.81 -42.24 0.09 -48 0C-42.24 -0.09 -39.36 -0.81 -33.6 -1.8Z'

export function Simbolo({ vivo = false, classe }) {
  return html`<svg class=${cx('simbolo', vivo && 'simbolo-vivo', classe)} viewBox="-48 -34.3 96 68.6" width="96" height="68.6" aria-hidden="true">
    <circle class="simbolo-anel" r="30" fill="none" stroke="currentColor" stroke-width="8.6" pathLength="100" transform="rotate(180)" />
    <path class="simbolo-raio" fill="currentColor" d=${RAIO_DO_SIMBOLO} />
  </svg>`
}
