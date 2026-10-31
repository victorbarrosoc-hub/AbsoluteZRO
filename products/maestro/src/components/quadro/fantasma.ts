/**
 * O fantasma do card que se arrasta (mouse em arrastar.ts, toque em gestos.ts): uma cópia do tamanho real, fixa na
 * janela, com camada própria (motion.css). Vai direto no `<body>`: inserir um filho no `.shell` (grade da página
 * inteira) refazia o layout e a pintura de tudo no primeiro quadro do arrasto (~0,5 s no WebKit sem GPU, contra
 * ~0,05 s no `<body>`). As variáveis que o card herdava do `.shell` (a cor da coluna e o acento da marca própria) vão
 * junto, lidas antes de qualquer escrita.
 */
const HERDADAS = ["--col", "--acento", "--acento-suave"] as const;

export type VarsDoCard = [string, string][];

/** Leia antes de mexer em qualquer estilo (não força um segundo cálculo de estilo). */
export function varsDoCard(card: HTMLElement): VarsDoCard {
  const s = getComputedStyle(card);
  return HERDADAS.map((k) => [k, s.getPropertyValue(k).trim()] as [string, string]).filter(([, v]) => v);
}

/** Cria e põe na tela o fantasma sobre o card (`r0`), girando/crescendo a partir do ponto pego. */
export function criarFantasma(card: HTMLElement, r0: DOMRect, pega: { x: number; y: number }, vars: VarsDoCard): HTMLElement {
  const fantasma = card.cloneNode(true) as HTMLElement;
  fantasma.removeAttribute("data-card");
  fantasma.removeAttribute("draggable");
  fantasma.setAttribute("aria-hidden", "true");
  fantasma.classList.add("q-fantasma");
  fantasma.style.cssText = `position:fixed;left:${r0.left}px;top:${r0.top}px;width:${r0.width}px;height:${r0.height}px;margin:0;animation:none;transform-origin:${pega.x - r0.left}px ${pega.y - r0.top}px`;
  for (const [k, v] of vars) fantasma.style.setProperty(k, v);
  document.body.appendChild(fantasma);
  requestAnimationFrame(() => fantasma.classList.add("q-fantasma--no-ar"));
  return fantasma;
}
