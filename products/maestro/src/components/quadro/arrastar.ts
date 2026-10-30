"use client";
/**
 * Arrastar o card com o mouse no computador (titular, 29/10/2026: "a animação dá uma travadinha"). Era o arrastar nativo
 * do HTML, que no Safari do Mac travava: o `dragleave` chega sem `relatedTarget` a cada filho, então o lugar de soltar
 * sumia e voltava (o Quadro inteiro desenhava de novo, a linha piscava e a coluna pulava ~10 px), cada `dragover` que
 * mudava o alvo desenhava as 8 colunas e media todos os cards, e ao soltar o card renascia na coluna nova com
 * `opacity: 0` vindo do lugar de origem, cortado pela coluna (`overflow: hidden`): sumia por 2 quadros e entrava pela
 * borda. Agora é o mesmo gesto do celular (gestos.ts), com o ponteiro:
 *
 * - o card ergue um fantasma do tamanho real (um pouco maior, sombra macia) que segue o mouse só com `translate`;
 * - os outros cards abrem espaço com `transform` e a mola do CSS; a coluna de origem fecha o buraco quando o mouse sai
 *   dela e a de destino cresce embaixo (uma vez por coluna, nunca por quadro); nada de estado do React por quadro;
 * - ao soltar, o fantasma pousa no lugar e só então o React grava (o FLIP é "fixado" antes: nada desliza de novo);
 * - perto das bordas a página e o Quadro rolam; Esc ou soltar fora do Quadro devolve o card ao lugar;
 * - com "reduzir movimento" nada voa nem desliza: o card vai direto.
 *
 * O toque continua com gestos.ts (segurar 280 ms). O teclado e o leitor de tela continuam com "Mover para…".
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { ColunaId } from "@/lib/quadro/metodo";
import { criarFantasma, varsDoCard } from "./fantasma";

const LIMIAR = 5; // px até virar arrasto (antes disso é clique)
const BORDA_ROLAR = 72; // px das bordas onde a página e o Quadro rolam
const MOLA_CSS = "cubic-bezier(0.32, 0.72, 0, 1)";
const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type Opcoes = {
  quadro: RefObject<HTMLDivElement | null>;
  podeArrastar: boolean;
  /** Grava a mudança (o mesmo "mover" do Quadro: avisa com Desfazer quando muda de coluna). */
  mover: (id: string, col: ColunaId, antes: string | null) => void;
  /** FLIP: toma a tela atual como "antes" do próximo render (flip.ts). */
  fixar: (em?: { id: string; rect: DOMRect }) => void;
  /** Coluna em que a ordem não é manual (Entregue: o mais recente em cima). */
  ordemFixa: (col: ColunaId) => boolean;
};

/** Um card de uma coluna, medido sem transform na hora de erguer (coordenadas da janela naquele instante). */
type Lugar = { el: HTMLElement; id: string; top: number; h: number };
type Coluna = {
  k: ColunaId;
  el: HTMLElement;
  corpo: HTMLElement;
  left: number;
  right: number;
  /** topo do primeiro lugar (ou do conteúdo, se vazia) e a esquerda do card nela */
  topo: number;
  esquerda: number;
  lugares: Lugar[]; // sem o arrastado
  gap: number;
  padBase: number;
};
type Arrasto = {
  id: string;
  card: HTMLElement;
  fantasma: HTMLElement;
  de: ColunaId;
  from: number;
  x0: number;
  y0: number;
  r0: DOMRect;
  h: number;
  cols: Coluna[];
  /**
   * Rolagem na hora de erguer (as medidas valem com ela) e a de agora, guardada pelos eventos de rolar: ler
   * `scrollX`/`scrollLeft` depois de escrever um transform obriga o WebKit a recalcular o estilo no meio do quadro.
   */
  sx0: number;
  sy0: number;
  qx0: number;
  sx: number;
  sy: number;
  qx: number;
  /** o Quadro na janela, na hora de erguer (e se ele rola de lado) */
  q: { top: number; left: number; right: number; lado: boolean };
  alvo: { k: ColunaId; to: number } | null;
  x: number;
  y: number;
  rolar: number;
};

/** Desloca o que rolou desde que o card subiu (página e o Quadro de lado). */
const rolou = (a: Arrasto) => ({ dx: a.sx - a.sx0 + (a.qx - a.qx0), dy: a.sy - a.sy0 });

export function useArrastoComMouse(o: Opcoes) {
  const op = useRef(o);
  useLayoutEffect(() => {
    op.current = o;
  });

  useEffect(() => {
    const quadro = o.quadro.current;
    if (!quadro) return;
    let pendente: { id: number; x0: number; y0: number; card: HTMLElement } | null = null;
    let arr: Arrasto | null = null;
    let engolir = -Infinity; // (0 engoliria todo clique nos primeiros 400 ms da página)
    let voando: Animation | null = null;

    /**
     * Durante o arrasto: a mão fechada e nada de :hover nos cards por baixo. Estilo direto no `body` (cursor, que herda e
     * não repinta) e no Quadro: uma classe no `<html>` recalculava e repintava a página inteira ao erguer (~0,5 s no
     * WebKit sem GPU) e ao soltar.
     */
    const tocar = (sim: boolean) => {
      document.body.style.cursor = sim ? "grabbing" : "";
      quadro.style.pointerEvents = sim ? "none" : "";
    };

    /** Tudo o que se mede ao erguer, de uma vez e antes de mexer em qualquer estilo (um layout só). */
    const medir = (a: Pick<Arrasto, "card">): { cols: Coluna[]; from: number; h: number } => {
      const cols: Coluna[] = [];
      let from = -1;
      let h = 0;
      for (const el of quadro.querySelectorAll<HTMLElement>(":scope > .q-col")) {
        const corpo = el.querySelector<HTMLElement>(".q-col__corpo");
        const r = el.getBoundingClientRect();
        if (!corpo || !r.width) continue; // no celular as outras colunas ficam escondidas
        const s = getComputedStyle(corpo);
        const rc = corpo.getBoundingClientRect();
        const lugares: Lugar[] = [];
        let topo = rc.top + parseFloat(s.paddingTop);
        let esquerda = rc.left + parseFloat(s.paddingLeft);
        let primeiro = true;
        let i = 0;
        for (const lugar of corpo.querySelectorAll<HTMLElement>(":scope > .q-lugar")) {
          const card = lugar.querySelector<HTMLElement>("[data-card]");
          if (!card) continue;
          const rl = lugar.getBoundingClientRect();
          if (primeiro) {
            topo = rl.top;
            esquerda = rl.left;
            primeiro = false;
          }
          if (card === a.card) {
            from = i;
            h = rl.height;
          } else lugares.push({ el: lugar, id: card.dataset.card!, top: rl.top, h: rl.height });
          i++;
        }
        cols.push({
          k: el.dataset.col as ColunaId,
          el,
          corpo,
          left: r.left,
          right: r.right,
          topo,
          esquerda,
          lugares,
          gap: parseFloat(s.rowGap) || 8,
          padBase: parseFloat(s.paddingBottom) || 0,
        });
      }
      return { cols, from, h };
    };

    /** A coluna sob o mouse (entre duas, a mais perto) ou nada (acima do Quadro, fora dos lados). */
    const colunaSob = (a: Arrasto): Coluna | null => {
      const { dx, dy } = rolou(a);
      if (a.y < a.q.top - dy - 24) return null;
      let melhor: Coluna | null = null;
      let dist = Infinity;
      for (const c of a.cols) {
        const l = c.left - dx;
        const r = c.right - dx;
        const d = a.x < l ? l - a.x : a.x > r ? a.x - r : 0;
        if (d < dist) {
          dist = d;
          melhor = c;
        }
      }
      return dist <= 24 ? melhor : null;
    };

    /** Onde o card entraria: o centro do fantasma contra o meio de cada card (como estão sem o arrastado). */
    const lugarEm = (a: Arrasto, c: Coluna) => {
      if (op.current.ordemFixa(c.k)) return c.k === a.de ? a.from : 0;
      const { dy } = rolou(a);
      const centro = a.y - a.y0 + a.r0.top + a.r0.height / 2 + dy;
      let to = 0;
      for (const b of c.lugares) if (b.top + b.h / 2 < centro) to++;
      return to;
    };

    /** Os cards de uma coluna no lugar: com o arrastado em `to`, sem ele (`null`) ou como estavam (origem, `from`). */
    const arrumar = (a: Arrasto, c: Coluna, to: number | null) => {
      const h = a.h + c.gap;
      c.lugares.forEach((b, k) => {
        let d = 0;
        if (c.k === a.de) {
          const orig = k < a.from ? k : k + 1;
          const novo = to === null ? k : k < to ? k : k + 1;
          d = (novo - orig) * h;
        } else if (to !== null && k >= to) d = h;
        b.el.style.transform = d ? `translateY(${d}px)` : "";
      });
      // a coluna de destino cresce embaixo para caber o card (a de origem já tem o lugar dele)
      const crescer = to !== null && c.k !== a.de;
      c.corpo.style.paddingBottom = crescer ? `${c.padBase + h}px` : "";
      c.el.toggleAttribute("data-alvo", to !== null && c.k !== a.de);
    };

    const mirar = (a: Arrasto) => {
      const c = colunaSob(a);
      const novo = c ? { k: c.k, to: lugarEm(a, c) } : null;
      if (novo?.k === a.alvo?.k && novo?.to === a.alvo?.to) return;
      const antes = a.alvo;
      a.alvo = novo;
      // a coluna que o mouse deixou volta (a de origem fecha o buraco)
      if (antes && antes.k !== novo?.k) {
        const v = a.cols.find((x) => x.k === antes.k);
        if (v) arrumar(a, v, null);
      }
      if (c && novo) arrumar(a, c, novo.to);
      else {
        const origem = a.cols.find((x) => x.k === a.de);
        if (origem) arrumar(a, origem, null);
      }
    };

    const andar = (x: number, y: number) => {
      const a = arr;
      if (!a) return;
      a.x = x;
      a.y = y;
      a.fantasma.style.translate = `${x - a.x0}px ${y - a.y0}px`;
      mirar(a);
    };

    const erguer = (p: NonNullable<typeof pendente>, x: number, y: number) => {
      const card = p.card;
      const id = card.dataset.card!;
      const de = card.closest<HTMLElement>(".q-col")?.dataset.col as ColunaId | undefined;
      if (!de) return;
      // primeiro as medidas (nenhum estilo mudou ainda: um layout só), depois as escritas
      const r0 = card.getBoundingClientRect();
      const { cols, from, h } = medir({ card });
      const rq = quadro.getBoundingClientRect();
      const vars = varsDoCard(card);
      const sx = window.scrollX;
      const sy = window.scrollY;
      const qx = quadro.scrollLeft;
      const lado = quadro.scrollWidth > quadro.clientWidth;
      const fantasma = criarFantasma(card, r0, { x: p.x0, y: p.y0 }, vars);
      card.classList.add("q-card--origem");
      quadro.dataset.arrasto = "";
      tocar(true);
      getSelection()?.removeAllRanges();
      arr = {
        id,
        card,
        fantasma,
        de,
        from,
        x0: p.x0,
        y0: p.y0,
        r0,
        h: h || r0.height,
        cols,
        sx0: sx,
        sy0: sy,
        qx0: qx,
        sx,
        sy,
        qx,
        q: { top: rq.top, left: rq.left, right: rq.right, lado },
        alvo: { k: de, to: from },
        x,
        y,
        rolar: 0,
      };
      const rolar = () => {
        const a = arr;
        if (!a) return;
        // perto das bordas: a página rola (de pé) e o Quadro rola de lado, mais rápido quanto mais perto
        const vel = (dist: number) => Math.ceil(((BORDA_ROLAR - dist) / BORDA_ROLAR) * 16);
        const vy = a.y < BORDA_ROLAR ? -vel(a.y) : a.y > innerHeight - BORDA_ROLAR ? vel(innerHeight - a.y) : 0;
        const ql = a.q.left - (a.sx - a.sx0);
        const qr = a.q.right - (a.sx - a.sx0);
        const vx = !a.q.lado ? 0 : a.x < ql + BORDA_ROLAR ? -vel(a.x - ql) : a.x > qr - BORDA_ROLAR ? vel(qr - a.x) : 0;
        const longe = Math.hypot(a.x - a.x0, a.y - a.y0) > 24; // segurar parado perto da borda não rola sozinho
        let mexeu = false;
        if (longe && vy) {
          const antes = a.sy;
          window.scrollBy(0, vy);
          a.sx = window.scrollX;
          a.sy = window.scrollY;
          mexeu = a.sy !== antes;
        }
        if (longe && vx) {
          const antes = a.qx;
          quadro.scrollLeft += vx;
          a.qx = quadro.scrollLeft;
          mexeu = mexeu || a.qx !== antes;
        }
        if (mexeu) mirar(a);
        a.rolar = requestAnimationFrame(rolar);
      };
      arr.rolar = requestAnimationFrame(rolar);
      andar(x, y);
    };

    const terminar = (soltou: boolean) => {
      const a = arr;
      if (!a) return;
      arr = null;
      tirarJanela();
      engolir = performance.now();
      cancelAnimationFrame(a.rolar);
      const reduzir = calmo();
      const limpar = () => {
        for (const c of a.cols) {
          for (const b of c.lugares) b.el.style.transform = "";
          c.corpo.style.paddingBottom = "";
          c.el.removeAttribute("data-alvo");
        }
      };
      const fim = (gravar: (() => void) | null, assento?: DOMRect) => {
        voando = null;
        quadro.dataset.semMola = "";
        if (gravar) {
          // a tela de agora (cards já onde vão ficar, o arrastado onde o fantasma pousou) é o "antes" do FLIP
          op.current.fixar(assento ? { id: a.id, rect: assento } : undefined);
          limpar();
          flushSync(gravar);
        } else limpar();
        a.card.classList.remove("q-card--origem");
        a.fantasma.remove();
        delete quadro.dataset.arrasto;
        tocar(false);
        requestAnimationFrame(() => delete quadro.dataset.semMola);
      };
      const voar = (dx: number, dy: number, ms: number, depois: () => void) => {
        if (reduzir) return depois();
        a.fantasma.classList.remove("q-fantasma--no-ar");
        const anim = a.fantasma.animate([{ translate: a.fantasma.style.translate || "0px 0px" }, { translate: `${dx}px ${dy}px` }], {
          duration: ms,
          easing: MOLA_CSS,
          fill: "forwards",
        });
        voando = anim;
        anim.finished.then(depois, depois);
      };
      const alvo = soltou ? a.alvo : null;
      const c = alvo ? a.cols.find((x) => x.k === alvo.k) : undefined;
      if (!alvo || !c || (alvo.k === a.de && alvo.to === a.from)) {
        // volta ao lugar: a coluna de origem reabre o buraco e o fantasma volta para ele
        const origem = a.cols.find((x) => x.k === a.de);
        if (origem) arrumar(a, origem, a.from);
        for (const x of a.cols) if (x.k !== a.de) arrumar(a, x, null);
        const r = a.card.getBoundingClientRect();
        voar(r.left - a.r0.left, r.top - a.r0.top, 260, () => fim(null));
        return;
      }
      const { dx, dy } = rolou(a);
      let top = c.topo - dy;
      for (let k = 0; k < alvo.to && k < c.lugares.length; k++) top += c.lugares[k].h + c.gap;
      const left = c.esquerda - dx;
      const assento = new DOMRect(left, top, a.r0.width, a.r0.height);
      const antes = c.lugares[alvo.to]?.id ?? null;
      voar(left - a.r0.left, top - a.r0.top, 280, () => fim(() => op.current.mover(a.id, c.k, antes), assento));
    };

    /* ───── ponteiro ───── */
    const aoMover = (e: PointerEvent) => {
      if (arr) {
        if (e.pointerType === "mouse" && !(e.buttons & 1)) return terminar(true); // soltou fora da janela
        return andar(e.clientX, e.clientY);
      }
      if (!pendente || e.pointerId !== pendente.id) return;
      if (Math.hypot(e.clientX - pendente.x0, e.clientY - pendente.y0) < LIMIAR) return;
      const p = pendente;
      pendente = null;
      erguer(p, e.clientX, e.clientY);
    };
    const aoSubir = (e: PointerEvent) => {
      if (arr) terminar(e.type === "pointerup");
      pendente = null;
      tirarJanela();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !arr) return;
      e.preventDefault();
      e.stopPropagation();
      terminar(false);
    };
    // a janela perdeu o foco no meio (Cmd+Tab): o card volta ao lugar
    const aoSairDaJanela = () => {
      if (arr) terminar(false);
      pendente = null;
      tirarJanela();
    };
    const aoRolar = () => {
      if (!arr) return;
      arr.sx = window.scrollX;
      arr.sy = window.scrollY;
      arr.qx = quadro.scrollLeft;
      mirar(arr);
    };
    const tirarJanela = () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSubir);
      window.removeEventListener("pointercancel", aoSubir);
      window.removeEventListener("keydown", aoTeclar, true);
      window.removeEventListener("blur", aoSairDaJanela);
      window.removeEventListener("scroll", aoRolar);
      quadro.removeEventListener("scroll", aoRolar);
    };
    const aoDescer = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !e.isPrimary || e.button !== 0 || arr || pendente || voando) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (!op.current.podeArrastar) return;
      const alvo = e.target as Element;
      if (alvo.closest("input, textarea, select, [contenteditable]")) return;
      const card = alvo.closest<HTMLElement>("[data-card]");
      if (!card || !quadro.contains(card)) return;
      pendente = { id: e.pointerId, x0: e.clientX, y0: e.clientY, card };
      window.addEventListener("pointermove", aoMover);
      window.addEventListener("pointerup", aoSubir);
      window.addEventListener("pointercancel", aoSubir);
      window.addEventListener("keydown", aoTeclar, true);
      window.addEventListener("blur", aoSairDaJanela);
      window.addEventListener("scroll", aoRolar, { passive: true });
      quadro.addEventListener("scroll", aoRolar, { passive: true });
    };
    // o clique que fecha um arrasto não abre a ficha nem aperta botão
    const aoClicar = (e: MouseEvent) => {
      if (performance.now() - engolir < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // a foto da pessoa e o texto do card não saem arrastados pelo navegador (o arrasto é o daqui)
    const aoArrastarNativo = (e: DragEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-card]")) e.preventDefault();
    };

    quadro.addEventListener("pointerdown", aoDescer);
    document.addEventListener("click", aoClicar, true);
    quadro.addEventListener("dragstart", aoArrastarNativo);
    return () => {
      quadro.removeEventListener("pointerdown", aoDescer);
      document.removeEventListener("click", aoClicar, true);
      quadro.removeEventListener("dragstart", aoArrastarNativo);
      tirarJanela();
      if (arr) {
        const a = arr;
        arr = null;
        cancelAnimationFrame(a.rolar);
        a.fantasma.remove();
        a.card.classList.remove("q-card--origem");
        tocar(false);
      }
    };
  }, [o.quadro]);
}
