"use client";
/**
 * Gestos do Quadro no celular (pedido do titular, 29/10/2026), tudo com o dedo e sem render do React por quadro:
 *
 * - **Deslizar de lado** na área dos cards troca de coluna: a lista segue o dedo 1:1 (elástico nas pontas), a coluna
 *   vizinha entra junto e, ao soltar, a mola leva à vizinha (passou de 35% da largura ou foi rápido) ou volta. A pílula
 *   ativa das colunas anda junto com o dedo. A direção trava depois de 8 px: de pé é a rolagem do navegador
 *   (`touch-action: pan-y`); começo a menos de 20 px da borda é do Safari (voltar) e fica de fora.
 * - **Segurar um card** (280 ms parado) ergue o card (um pouco maior, sombra macia; sem o arrastar nativo do iOS, que
 *   demorava e pintava de preto): ele segue o dedo do tamanho real, os outros abrem espaço com a mola, a página rola
 *   perto do topo e do pé, segurar na borda da tela (0,42 s) passa para a coluna do lado, e soltar sobre uma pílula
 *   manda o card para aquela coluna. Soltar fora da área volta tudo ao lugar.
 *
 * As pílulas continuam sendo o jeito acessível (teclado e leitor de tela) de trocar de coluna. Com "reduzir
 * movimento", troca na hora e o card não flutua com mola. No computador nada disto liga (lá é o arrastar do HTML).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { ColunaId } from "@/lib/quadro/metodo";
import { criarFantasma, varsDoCard } from "./fantasma";

const CELULAR = "(max-width: 760px)";
const GAP = 16; // entre a coluna atual e a vizinha enquanto deslizam (é a margem da tela: a vizinha nasce na borda)
const TRAVA = 8; // px até decidir a direção
const BORDA_SAFARI = 20; // px: o gesto de voltar do Safari
const SEGURAR_MS = 280;
const BORDA_COLUNA = 32; // px da borda da tela que, segurando o card, passa para a coluna do lado
const BORDA_COLUNA_MS = 420;
const MOLA_CSS = "cubic-bezier(0.32, 0.72, 0, 1)";

const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const vibrar = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

/** Elástico do iOS: passa da ponta, mas cada vez menos. */
function elastico(dx: number, largura: number) {
  const s = Math.sign(dx);
  const x = Math.abs(dx);
  return s * (1 - 1 / ((x * 0.55) / largura + 1)) * largura;
}

/**
 * Mola (massa 1, rigidez 380, um tico abaixo do amortecimento crítico) a partir da velocidade do dedo (px/ms). Integra
 * em passos fixos de 1/240 s pelo tempo de verdade: a duração é a mesma em 120, 60 ou 20 quadros por segundo.
 */
function mola(de: number, para: number, v0: number, passo: (x: number) => void, fim: () => void) {
  let x = de;
  let v = v0 * 1000;
  const k = 380;
  const c = 2 * Math.sqrt(k) * 0.92;
  const h = 1 / 240;
  const inicio = performance.now();
  let simulado = 0;
  let pedido = 0;
  const quadro = (t: number) => {
    const agora = Math.max(0, (t - inicio) / 1000);
    while (simulado < agora) {
      v += (-k * (x - para) - c * v) * h;
      x += v * h;
      simulado += h;
    }
    if ((Math.abs(x - para) < 0.5 && Math.abs(v) < 30) || agora > 0.9) {
      passo(para);
      fim();
      return;
    }
    passo(x);
    pedido = requestAnimationFrame(quadro);
  };
  pedido = requestAnimationFrame(quadro);
  return () => cancelAnimationFrame(pedido);
}

type Opcoes = {
  quadro: RefObject<HTMLDivElement | null>;
  abas: RefObject<HTMLElement | null>;
  colunas: readonly ColunaId[];
  coluna: ColunaId;
  setColuna: (k: ColunaId) => void;
  podeArrastar: boolean;
  /** Grava a mudança (o mesmo "mover" do Quadro: avisa com Desfazer quando muda de coluna). */
  mover: (id: string, col: ColunaId, antes: string | null) => void;
  /** FLIP: toma a tela atual como "antes" do próximo render (flip.ts). */
  fixar: (em?: { id: string; rect: DOMRect }) => void;
};

type Base = { lugar: HTMLElement; id: string; top: number; h: number };
type Arrasto = {
  id: string;
  card: HTMLElement;
  fantasma: HTMLElement;
  de: ColunaId;
  x0: number;
  y0: number;
  r0: DOMRect;
  /** coluna à vista e os cards dela (sem o arrastado), medidos sem transform, em coordenadas da página */
  col: ColunaId;
  outros: Base[];
  corpoTop: number;
  gap: number;
  from: number; // índice do arrastado na coluna de origem (-1 em outra coluna)
  to: number;
  x: number;
  y: number;
  pilula: ColunaId | null;
  borda: { lado: -1 | 1; timer: number } | null;
  rolar: number;
  trocando: boolean;
};

export function useGestosCelular(o: Opcoes) {
  const op = useRef(o);
  useLayoutEffect(() => {
    op.current = o;
  });
  const animando = useRef<(() => void) | null>(null);
  const parada = useRef(0);

  const colEl = useCallback((k: ColunaId) => op.current.quadro.current?.querySelector<HTMLElement>(`.q-col[data-col="${k}"]`) ?? null, []);
  const pilEl = useCallback((k: ColunaId) => op.current.abas.current?.querySelector<HTMLElement>(`button[data-col="${k}"]`) ?? null, []);

  /** A pílula de vidro das colunas: no lugar da coluna `k`, ou a meio caminho entre duas (p de 0 a 1). */
  const pilula = useCallback(
    (de: ColunaId, para: ColunaId | null = null, p = 0, suave = false) => {
      const nav = op.current.abas.current;
      const ind = nav?.querySelector<HTMLElement>(".q-abas__pilula");
      const a = pilEl(de);
      if (!nav || !ind || !a) return;
      const b = para ? pilEl(para) : null;
      const x = b ? a.offsetLeft + (b.offsetLeft - a.offsetLeft) * p : a.offsetLeft;
      const w = b ? a.offsetWidth + (b.offsetWidth - a.offsetWidth) * p : a.offsetWidth;
      // A pílula de vidro só aparece andando (gesto, troca); parada, quem pinta é a própria aba (contraste medível)
      const antes = ind.style.transform;
      ind.style.transition = suave && !calmo() ? "" : "none";
      ind.style.transform = `translateX(${x}px)`;
      ind.style.width = `${w}px`;
      nav.dataset.pilula = "";
      clearTimeout(parada.current);
      if (b || (suave && antes && antes !== ind.style.transform)) nav.dataset.andando = "";
      if (!b) parada.current = window.setTimeout(() => delete nav.dataset.andando, suave ? 460 : 0);
      // o texto claro vai com a pílula (a classe "on" do React só muda quando a troca termina)
      const sob = b && p > 0.5 ? b : a;
      for (const el of nav.querySelectorAll<HTMLElement>("button[data-col]")) el.toggleAttribute("data-sob", el === sob);
      // a pílula ativa sempre à vista na faixa (que rola de lado)
      const esq = sob.offsetLeft - 16;
      const dir = sob.offsetLeft + sob.offsetWidth + 16 - nav.clientWidth;
      if (nav.scrollLeft > esq) nav.scrollTo({ left: esq, behavior: calmo() ? "auto" : "smooth" });
      else if (nav.scrollLeft < dir) nav.scrollTo({ left: dir, behavior: calmo() ? "auto" : "smooth" });
    },
    [pilEl],
  );

  // a pílula acompanha a coluna escolhida (toque na pílula, fim do gesto, card criado em outra coluna)
  useLayoutEffect(() => {
    pilula(o.coluna, null, 0, true);
  }, [o.coluna, pilula]);
  useEffect(() => {
    const nav = o.abas.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => pilula(op.current.coluna));
    ro.observe(nav);
    return () => ro.disconnect();
  }, [o.abas, pilula]);

  /** Põe a coluna atual em dx e a vizinha (`viz`, do lado `lado`) colada nela. */
  const posicionar = useCallback(
    (dx: number, viz: ColunaId | null, lado: -1 | 1) => {
      const atual = colEl(op.current.coluna);
      if (!atual) return;
      const w = atual.offsetWidth + GAP;
      atual.style.transform = dx ? `translateX(${dx}px)` : "";
      for (const k of op.current.colunas) {
        const el = colEl(k);
        if (!el || k === op.current.coluna) continue;
        if (k === viz) {
          el.dataset.vizinha = "";
          el.style.transform = `translateX(${dx + lado * w}px)`;
        } else if ("vizinha" in el.dataset) {
          delete el.dataset.vizinha;
          el.style.transform = "";
        }
      }
      if (viz) pilula(op.current.coluna, viz, Math.min(1, Math.abs(dx) / w));
    },
    [colEl, pilula],
  );

  const limparPosicao = useCallback(() => {
    for (const k of op.current.colunas) {
      const el = colEl(k);
      if (!el) continue;
      el.style.transform = "";
      delete el.dataset.vizinha;
    }
  }, [colEl]);

  /** Fecha a troca: a vizinha vira a coluna escolhida (no mesmo quadro, sem pulo). */
  const confirmar = useCallback(
    (k: ColunaId) => {
      flushSync(() => op.current.setColuna(k));
      limparPosicao();
      pilula(k);
    },
    [limparPosicao, pilula],
  );

  /** Vai para a coluna `k` deslizando (pílula, borda segurando o card). `v` = velocidade do dedo, px/ms. */
  const irPara = useCallback(
    (k: ColunaId, dxInicial = 0, v = 0, aoFim?: () => void) => {
      animando.current?.();
      const { colunas, coluna } = op.current;
      if (k === coluna) {
        aoFim?.();
        return;
      }
      if (calmo() || !window.matchMedia(CELULAR).matches) {
        limparPosicao();
        flushSync(() => op.current.setColuna(k));
        aoFim?.();
        return;
      }
      const lado = colunas.indexOf(k) > colunas.indexOf(coluna) ? 1 : -1;
      const w = (colEl(coluna)?.offsetWidth ?? 0) + GAP;
      animando.current = mola(
        dxInicial,
        -lado * w,
        v,
        (x) => posicionar(x, k, lado),
        () => {
          animando.current = null;
          confirmar(k);
          vibrar(6);
          aoFim?.();
        },
      );
    },
    [colEl, confirmar, limparPosicao, posicionar],
  );

  useEffect(() => {
    const quadro = o.quadro.current;
    if (!quadro) return;

    let toque: { id: number; x0: number; y0: number; t0: number; modo: "?" | "lado" | "rolar" | "arrasto"; card: HTMLElement | null; timer: number } | null =
      null;
    let lado: { pontos: { t: number; x: number }[]; dx: number } | null = null;
    let arr: Arrasto | null = null;
    let engolir = -Infinity; // (0 engoliria todo clique nos primeiros 400 ms da página)

    const vizinhaDe = (dx: number): ColunaId | null => {
      const { colunas, coluna } = op.current;
      const i = colunas.indexOf(coluna) + (dx < 0 ? 1 : -1);
      return colunas[i] ?? null;
    };

    /* ───── deslizar de lado ───── */
    const ladoMover = (x: number) => {
      if (!toque || !lado) return;
      const dx = x - toque.x0;
      lado.dx = dx;
      lado.pontos.push({ t: performance.now(), x });
      if (lado.pontos.length > 6) lado.pontos.shift();
      if (calmo()) return;
      const viz = vizinhaDe(dx);
      const w = (colEl(op.current.coluna)?.offsetWidth ?? 1) + GAP;
      posicionar(viz ? dx : elastico(dx, w), viz, dx < 0 ? 1 : -1);
    };
    const ladoSoltar = () => {
      if (!lado) return;
      const { dx, pontos } = lado;
      lado = null;
      // o dedo parado antes de soltar não tem velocidade: o instante de soltar entra na conta
      pontos.push({ t: performance.now(), x: pontos[pontos.length - 1].x });
      const ultimo = pontos[pontos.length - 1];
      const antigo = pontos.find((p) => ultimo.t - p.t < 100) ?? pontos[0];
      const v = ultimo.t > antigo.t ? (ultimo.x - antigo.x) / (ultimo.t - antigo.t) : 0;
      const viz = vizinhaDe(dx);
      const w = (colEl(op.current.coluna)?.offsetWidth ?? 1) + GAP;
      const vai = viz && (Math.abs(dx) > w * 0.35 || (Math.abs(v) > 0.35 && Math.sign(v) === Math.sign(dx)));
      if (vai) {
        irPara(viz, calmo() ? 0 : dx, calmo() ? 0 : v);
        return;
      }
      if (calmo()) return;
      const efetivo = viz ? dx : elastico(dx, w);
      animando.current = mola(
        efetivo,
        0,
        v,
        (x) => posicionar(x, viz, dx < 0 ? 1 : -1),
        () => {
          animando.current = null;
          limparPosicao();
          pilula(op.current.coluna);
        },
      );
    };

    /* ───── arrastar um card ───── */
    const medirColuna = (a: Arrasto) => {
      const col = colEl(a.col);
      const corpo = col?.querySelector<HTMLElement>(".q-col__corpo");
      a.outros = [];
      a.from = -1;
      if (!corpo) return;
      const sy = window.scrollY;
      a.gap = parseFloat(getComputedStyle(corpo).rowGap) || 10;
      a.corpoTop = corpo.getBoundingClientRect().top + sy;
      let i = 0;
      for (const lugar of corpo.querySelectorAll<HTMLElement>(":scope > .q-lugar")) {
        const card = lugar.querySelector<HTMLElement>("[data-card]");
        if (!card) continue;
        const r = lugar.getBoundingClientRect();
        if (card === a.card) {
          a.from = i;
          a.corpoTop = Math.min(a.corpoTop, r.top + sy);
          i++;
          continue;
        }
        a.outros.push({ lugar, id: card.dataset.card!, top: r.top + sy, h: r.height });
        i++;
      }
    };
    /** Onde o card entraria: pelo centro do fantasma contra o meio de cada card (como estão sem o arrastado). */
    const posicao = (a: Arrasto) => {
      const centro = a.y - a.y0 + a.r0.top + a.r0.height / 2 + window.scrollY;
      let to = 0;
      for (const b of a.outros) if (b.top + b.h / 2 < centro) to++;
      return to;
    };
    const abrirEspaco = (a: Arrasto, to: number | null) => {
      const h = a.r0.height + a.gap;
      a.outros.forEach((b, k) => {
        let d = 0;
        if (to !== null) {
          if (a.from >= 0) {
            const orig = k < a.from ? k : k + 1;
            const novo = k < to ? k : k + 1;
            d = (novo - orig) * h;
          } else d = k >= to ? h : 0;
        } else if (a.from >= 0) d = k >= a.from ? -h : 0; // fora da área: a coluna fecha o buraco
        b.lugar.style.transform = d ? `translateY(${d}px)` : "";
      });
    };
    /** Tira o espaço aberto na coluna à vista, sem mola (antes de medir outra coluna ou de passar de coluna). */
    const fecharEspaco = (a: Arrasto) => {
      quadro.dataset.semMola = "";
      for (const b of a.outros) b.lugar.style.transform = "";
      void quadro.offsetWidth;
      delete quadro.dataset.semMola;
    };
    /** Topo (na janela) do lugar `to` na coluna à vista, com o arrastado entrando ali. */
    const topoDoLugar = (a: Arrasto, to: number) => {
      let y = a.corpoTop;
      for (let k = 0; k < to && k < a.outros.length; k++) y += a.outros[k].h + a.gap;
      return y - window.scrollY;
    };

    const erguer = () => {
      if (!toque?.card) return;
      const card = toque.card;
      const id = card.dataset.card!;
      const col = card.closest<HTMLElement>(".q-col")?.dataset.col as ColunaId | undefined;
      if (!col) return;
      toque.modo = "arrasto";
      try {
        quadro.setPointerCapture(toque.id);
      } catch {}
      const r0 = card.getBoundingClientRect();
      const fantasma = criarFantasma(card, r0, { x: toque.x0, y: toque.y0 }, varsDoCard(card));
      card.classList.add("q-card--origem");
      quadro.dataset.arrasto = "";
      arr = {
        id,
        card,
        fantasma,
        de: col,
        x0: toque.x0,
        y0: toque.y0,
        r0,
        col: op.current.coluna,
        outros: [],
        corpoTop: 0,
        gap: 10,
        from: -1,
        to: 0,
        x: toque.x0,
        y: toque.y0,
        pilula: null,
        borda: null,
        rolar: 0,
        trocando: false,
      };
      medirColuna(arr);
      arr.to = arr.from;
      vibrar(10);
      const rolar = () => {
        if (!arr) return;
        // perto do topo e do pé (acima da barra de baixo) a página rola, mais rápido quanto mais perto da beirada
        const zonaTopo = 120;
        const pe = (document.querySelector(".barra")?.getBoundingClientRect().top ?? innerHeight) - 70;
        let v = 0;
        if (arr.y < zonaTopo) v = -Math.ceil(((zonaTopo - arr.y) / zonaTopo) * 14);
        else if (arr.y > pe) v = Math.ceil(Math.min(1, (arr.y - pe) / 140) * 14);
        // só depois de o card sair do lugar: segurar perto do pé não rola a página sozinho
        if (Math.hypot(arr.x - arr.x0, arr.y - arr.y0) < 24) v = 0;
        if (v && !arr.pilula) {
          const antes = window.scrollY;
          window.scrollBy(0, v);
          if (window.scrollY !== antes) arrastoMover(arr.x, arr.y);
        }
        arr.rolar = requestAnimationFrame(rolar);
      };
      arr.rolar = requestAnimationFrame(rolar);
    };

    /** Soltar acima do Quadro (no topo, nos filtros) desiste; embaixo, até sobre a barra, vale (a página rola). */
    const naArea = (a: Arrasto) => a.y > quadro.getBoundingClientRect().top - 24;

    function arrastoMover(x: number, y: number) {
      const a = arr;
      if (!a) return;
      a.x = x;
      a.y = y;
      a.fantasma.style.translate = `${x - a.x0}px ${y - a.y0}px`;
      // sobre uma pílula: o card vai para aquela coluna
      const sob = document.elementFromPoint(x, y)?.closest<HTMLElement>(".q-abas button[data-col]");
      const pil = (sob?.dataset.col as ColunaId | undefined) ?? null;
      if (pil !== a.pilula) {
        if (a.pilula) delete pilEl(a.pilula)?.dataset.alvo;
        if (pil) pilEl(pil)!.dataset.alvo = "";
        a.pilula = pil;
      }
      // segurando na borda: passa para a coluna do lado
      const ladoBorda = x < BORDA_COLUNA ? -1 : x > innerWidth - BORDA_COLUNA ? 1 : 0;
      if (!ladoBorda || pil) {
        if (a.borda) clearTimeout(a.borda.timer);
        a.borda = null;
      } else if (!a.borda || a.borda.lado !== ladoBorda) {
        if (a.borda) clearTimeout(a.borda.timer);
        const passar = () => {
          if (!arr || arr !== a || a.trocando) return;
          const { colunas, coluna } = op.current;
          const k = colunas[colunas.indexOf(coluna) + ladoBorda];
          if (!k) return;
          a.trocando = true;
          irPara(k, 0, 0, () => {
            // a coluna que saiu (já escondida) volta ao normal
            fecharEspaco(a);
            if (arr !== a) return;
            a.trocando = false;
            a.col = op.current.coluna;
            medirColuna(a);
            a.to = posicao(a);
            abrirEspaco(a, a.to);
            // ainda na borda: a próxima coluna depois de mais um tempo
            if (a.borda) a.borda.timer = window.setTimeout(passar, BORDA_COLUNA_MS + 600);
          });
        };
        a.borda = { lado: ladoBorda as -1 | 1, timer: window.setTimeout(passar, BORDA_COLUNA_MS) };
      }
      if (a.trocando) return;
      if (pil || !naArea(a)) {
        abrirEspaco(a, null);
        return;
      }
      a.to = posicao(a);
      abrirEspaco(a, a.to);
    }

    const terminarArrasto = (soltou: boolean) => {
      const a = arr;
      if (!a) return;
      arr = null;
      cancelAnimationFrame(a.rolar);
      if (a.borda) clearTimeout(a.borda.timer);
      if (a.pilula) delete pilEl(a.pilula)?.dataset.alvo;
      animando.current?.();
      const reduzir = calmo();
      const fim = (gravar: (() => void) | null, assento?: DOMRect) => {
        if (gravar) {
          op.current.fixar(assento ? { id: a.id, rect: assento } : undefined);
          for (const b of a.outros) b.lugar.style.transform = "";
          quadro.dataset.semMola = "";
          flushSync(gravar);
        } else {
          quadro.dataset.semMola = "";
          for (const b of a.outros) b.lugar.style.transform = "";
        }
        a.card.classList.remove("q-card--origem");
        a.fantasma.remove();
        delete quadro.dataset.arrasto;
        requestAnimationFrame(() => delete quadro.dataset.semMola);
        if (a.trocando) limparPosicao();
      };
      const voar = (para: Keyframe, ms: number, depois: () => void) => {
        if (reduzir) return depois();
        a.fantasma.classList.remove("q-fantasma--no-ar");
        const anim = a.fantasma.animate([{ translate: a.fantasma.style.translate || "0px 0px" }, para], { duration: ms, easing: MOLA_CSS, fill: "forwards" });
        anim.finished.then(depois, depois);
      };
      if (!soltou || a.trocando) {
        voar({ translate: "0px 0px" }, 260, () => fim(null));
        if (a.trocando) limparPosicao();
        abrirEspaco(a, a.from >= 0 ? a.from : null);
        return;
      }
      if (a.pilula) {
        const k = a.pilula;
        const p = pilEl(k)!.getBoundingClientRect();
        const dx = p.left + p.width / 2 - (a.r0.left + a.r0.width / 2);
        const dy = p.top + p.height / 2 - (a.r0.top + a.r0.height / 2);
        abrirEspaco(a, null);
        if (!reduzir)
          a.fantasma.animate(
            [
              { scale: "1", opacity: 1 },
              { scale: "0.2", opacity: 0 },
            ],
            { duration: 240, easing: MOLA_CSS, fill: "forwards" },
          );
        voar({ translate: `${dx}px ${dy}px` }, 240, () => fim(() => op.current.mover(a.id, k, null)));
        return;
      }
      if (!naArea(a)) {
        abrirEspaco(a, a.from >= 0 ? a.from : null);
        voar({ translate: "0px 0px" }, 280, () => fim(null));
        return;
      }
      const to = posicao(a);
      abrirEspaco(a, to);
      const col = a.col;
      const antes = a.outros[to]?.id ?? null;
      if (col === a.de && to === a.from) {
        voar({ translate: "0px 0px" }, 260, () => fim(null));
        return;
      }
      const corpo = colEl(col)?.querySelector<HTMLElement>(".q-col__corpo");
      const left = corpo?.getBoundingClientRect().left ?? a.r0.left;
      const top = topoDoLugar(a, to);
      const assento = new DOMRect(left, top, a.r0.width, a.r0.height);
      voar({ translate: `${left - a.r0.left}px ${top - a.r0.top}px` }, 280, () => fim(() => op.current.mover(a.id, col, antes), assento));
    };

    /* ───── ponteiro ───── */
    const aoDescer = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !e.isPrimary || toque || arr || lado) return;
      if (!window.matchMedia(CELULAR).matches) return;
      if (e.clientX < BORDA_SAFARI || e.clientX > innerWidth - BORDA_SAFARI) return;
      const card = op.current.podeArrastar ? (e.target as Element).closest<HTMLElement>("[data-card]") : null;
      animando.current?.();
      animando.current = null;
      limparPosicao();
      toque = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), modo: "?", card, timer: 0 };
      if (card) toque.timer = window.setTimeout(erguer, SEGURAR_MS);
    };
    const aoMover = (e: PointerEvent) => {
      if (!toque || e.pointerId !== toque.id) return;
      if (toque.modo === "arrasto") return arrastoMover(e.clientX, e.clientY);
      if (toque.modo === "lado") return ladoMover(e.clientX);
      if (toque.modo !== "?") return;
      const dx = e.clientX - toque.x0;
      const dy = e.clientY - toque.y0;
      if (Math.abs(dx) < TRAVA && Math.abs(dy) < TRAVA) return;
      clearTimeout(toque.timer);
      if (Math.abs(dx) > Math.abs(dy)) {
        toque.modo = "lado";
        lado = { pontos: [{ t: performance.now(), x: toque.x0 }], dx: 0 };
        try {
          quadro.setPointerCapture(toque.id);
        } catch {}
        ladoMover(e.clientX);
      } else toque.modo = "rolar";
    };
    const aoSubir = (e: PointerEvent) => {
      if (!toque || e.pointerId !== toque.id) return;
      clearTimeout(toque.timer);
      const modo = toque.modo;
      toque = null;
      if (modo === "lado") {
        engolir = performance.now();
        ladoSoltar();
      } else if (modo === "arrasto") {
        engolir = performance.now();
        terminarArrasto(e.type === "pointerup");
      }
    };
    // durante o arrasto e o deslizar, o dedo não rola a página (o navegador só decide no primeiro toquemove)
    const aoTocarMover = (e: TouchEvent) => {
      if (toque && (toque.modo === "arrasto" || toque.modo === "lado") && e.cancelable) e.preventDefault();
    };
    // Android: segurar abre o menu do navegador; iOS: a lupa e o menu de cópia ficam de fora pelo CSS
    const aoMenu = (e: Event) => {
      if (toque) e.preventDefault();
    };
    const aoClicar = (e: MouseEvent) => {
      if (performance.now() - engolir < 450) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    quadro.addEventListener("pointerdown", aoDescer);
    quadro.addEventListener("pointermove", aoMover);
    quadro.addEventListener("pointerup", aoSubir);
    quadro.addEventListener("pointercancel", aoSubir);
    quadro.addEventListener("touchmove", aoTocarMover, { passive: false });
    quadro.addEventListener("contextmenu", aoMenu);
    quadro.addEventListener("click", aoClicar, true);
    return () => {
      quadro.removeEventListener("pointerdown", aoDescer);
      quadro.removeEventListener("pointermove", aoMover);
      quadro.removeEventListener("pointerup", aoSubir);
      quadro.removeEventListener("pointercancel", aoSubir);
      quadro.removeEventListener("touchmove", aoTocarMover);
      quadro.removeEventListener("contextmenu", aoMenu);
      quadro.removeEventListener("click", aoClicar, true);
      if (toque) clearTimeout(toque.timer);
      if (arr) terminarArrasto(false);
      animando.current?.();
    };
  }, [o.quadro, colEl, pilEl, irPara, posicionar, limparPosicao, pilula]);

  return irPara;
}
