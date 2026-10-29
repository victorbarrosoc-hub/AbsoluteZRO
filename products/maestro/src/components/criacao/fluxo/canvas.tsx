"use client";
/**
 * O canvas infinito do Fluxo (fase F5), feito à mão (DOM + SVG; tldraw não: licença). Tudo que acontece a cada quadro
 * (andar, aproximar, arrastar, redimensionar, puxar ligação, laço) mexe direto no estilo dos elementos; o React só
 * recebe o resultado ao soltar. Gestos:
 *
 *   * mouse/trackpad: dois dedos (roda) andam; ⌘/Ctrl + roda e a pinça do trackpad aproximam em torno do cursor;
 *     espaço + arrastar ou o botão do meio andam; arrastar no vazio faz o laço (⇧ soma); arrastar o nó move (a seleção
 *     inteira; a seção leva o que está dentro); a alça do canto redimensiona; a bolinha da direita puxa uma ligação
 *     (soltar no vazio cria uma nota já ligada); clique duplo edita (no vazio, cria uma nota);
 *   * toque: um dedo anda; pinça aproxima; segurar 280 ms ergue o nó (o mesmo gesto do Quadro) e ele segue o dedo;
 *     tocar escolhe; tocar de novo no escolhido edita.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { LigacaoFluxo, NoFluxo, RefResolvida } from "@/lib/criacao/fluxo/modelo";
import {
  caixaDe,
  caminhoLigacao,
  enquadrar,
  GRADE,
  intersecta,
  pontaDaSeta,
  retangulo,
  telaParaMundo,
  zoomEm,
  type Caixa,
  type Ponto,
  type Vista,
} from "./geometria";
import { CAMPO_DO_TIPO, No, type Campo } from "./no";

export type Ferramenta = "selecionar" | "ligar";
export type Subida = { id: string; x: number; y: number; w: number; h: number; progresso: number };
export type Movido = { id: string; x: number; y: number };

export type CanvasApi = {
  /** O ponto do mundo no meio da área visível. */
  centro: () => Ponto;
  enquadrar: (suave?: boolean) => void;
  zoom: (fator: number) => void;
  zoomCem: () => void;
  /** Leva a vista até o nó (Lista → Canvas). */
  irPara: (id: string) => void;
};

type Props = {
  fluxoId: string;
  vivos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  refs: Record<string, RefResolvida>;
  podeEditar: boolean;
  ferramenta: Ferramenta;
  ligandoDe: string | null;
  selecao: ReadonlySet<string>;
  ligSel: string | null;
  editando: { id: string; campo: Campo } | null;
  subindo: Subida[];
  /** Espaço livre no topo e no pé (cabeça e barra), para enquadrar. */
  margens: { topo: number; pe: number };
  selecionar: (ids: string[], modo: "trocar" | "somar" | "alternar") => void;
  selecionarLig: (id: string | null) => void;
  escolherParaLigar: (id: string) => void;
  moverFim: (movidos: Movido[], soltos: string[]) => void;
  redimensionarFim: (id: string, c: Caixa) => void;
  ligar: (de: string, para: string | Ponto) => void;
  editar: (id: string, campo: Campo) => void;
  editarRotulo: (id: string) => void;
  salvarCampo: (id: string, campo: Campo, valor: string | null) => void;
  notaEm: (p: Ponto) => void;
  soltar: (dados: DataTransfer, p: Ponto) => void;
};

type LigDom = {
  id: string;
  de: string;
  para: string;
  linha: SVGPathElement | null;
  seta: SVGPathElement | null;
  toque: SVGPathElement | null;
  rotulo: HTMLElement | null;
};
type ElNo = { id: string; el: HTMLElement; caixa: Caixa };
type Gesto =
  | { t: "pan"; p: number; sx: number; sy: number; v0: Vista; moveu: boolean; no: string | null }
  | { t: "laco"; p: number; sx: number; sy: number; somar: boolean; moveu: boolean; quase: Set<string> }
  | { t: "tocar"; p: number; sx: number; sy: number; no: string; jaEscolhido: boolean }
  | { t: "segurar"; p: number; sx: number; sy: number; no: string; timer: number; jaEscolhido: boolean }
  | { t: "arrastar"; p: number; sx: number; sy: number; els: ElNo[]; ligs: LigDom[]; toque: boolean; moveu: boolean; dx: number; dy: number }
  | { t: "redim"; p: number; sx: number; sy: number; el: ElNo; ligs: LigDom[]; c: Caixa }
  | { t: "ligar"; p: number; de: string; caixa: Caixa }
  | { t: "pinca"; a: number; b: number; d0: number; m0: Ponto; v0: Vista };

const SEGURAR_MS = 280;
const TRAVA_TOQUE = 8;
const TRAVA_MOUSE = 3;
const MIN_LADO = { nota: 80, imagem: 80, link: 160, roteiro: 160, card: 160, secao: 160 } as const;
const MIN_ALTURA = { nota: 48, imagem: 80, link: 96, roteiro: 56, card: 56, secao: 120 } as const;
const calmo = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const vibrar = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};
const chaveVista = (id: string) => `maestro:fluxo:vista:${id}`;

function lerVistaGuardada(id: string): Vista | null {
  try {
    const v = JSON.parse(localStorage.getItem(chaveVista(id)) ?? "null") as Vista | null;
    return v && [v.x, v.y, v.z].every((n) => typeof n === "number" && Number.isFinite(n)) && v.z > 0 ? v : null;
  } catch {
    return null;
  }
}

export const Canvas = forwardRef<CanvasApi, Props>(function Canvas(p, api) {
  const tela = useRef<HTMLDivElement>(null);
  const plano = useRef<HTMLDivElement>(null);
  const laco = useRef<HTMLDivElement>(null);
  const puxando = useRef<SVGPathElement>(null);
  const vista = useRef<Vista>({ x: 0, y: 0, z: 1 });
  const gesto = useRef<Gesto | null>(null);
  const ponteiros = useRef(new Map<number, Ponto & { toque: boolean }>());
  const espaco = useRef(false);
  const props = useRef(p);
  useLayoutEffect(() => {
    props.current = p;
  });
  const [zoomAlto, setZoomAlto] = useState(false);
  const guardar = useRef(0);

  const porId = useMemo(() => new Map(p.vivos.map((n) => [n.id, n])), [p.vivos]);
  const porIdRef = useRef(porId);
  useLayoutEffect(() => {
    porIdRef.current = porId;
  }, [porId]);

  /** Pinta a vista: o plano, a grade de pontos e o número do zoom (sem React). */
  const pintar = useCallback(() => {
    const v = vista.current;
    if (plano.current) plano.current.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.z})`;
    if (tela.current) {
      let passo = GRADE * v.z;
      while (passo < 12) passo *= 4;
      tela.current.style.backgroundSize = `${passo}px ${passo}px`;
      tela.current.style.backgroundPosition = `${v.x}px ${v.y}px`;
      tela.current.dataset.zoom = String(Math.round(v.z * 100));
    }
    setZoomAlto(v.z > 1.4);
    window.clearTimeout(guardar.current);
    guardar.current = window.setTimeout(() => {
      try {
        localStorage.setItem(chaveVista(props.current.fluxoId), JSON.stringify(vista.current));
      } catch {}
    }, 400);
  }, []);

  /** Anda até a vista `alvo`: com mola curta, ou na hora com "reduzir movimento". */
  const animarPara = useCallback(
    (alvo: Vista, suave = true) => {
      if (!suave || calmo()) {
        vista.current = alvo;
        pintar();
        return;
      }
      const de = { ...vista.current };
      const t0 = performance.now();
      const dur = 320;
      const passo = (t: number) => {
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        vista.current = { x: de.x + (alvo.x - de.x) * e, y: de.y + (alvo.y - de.y) * e, z: de.z + (alvo.z - de.z) * e };
        pintar();
        if (k < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    },
    [pintar],
  );

  const tamanhoTela = useCallback(() => {
    const r = tela.current?.getBoundingClientRect();
    return { w: r?.width ?? window.innerWidth, h: r?.height ?? window.innerHeight, x: r?.left ?? 0, y: r?.top ?? 0 };
  }, []);
  const local = useCallback(
    (cx: number, cy: number): Ponto => {
      const t = tamanhoTela();
      return { x: cx - t.x, y: cy - t.y };
    },
    [tamanhoTela],
  );
  const mundo = useCallback((cx: number, cy: number): Ponto => {
    const r = tela.current?.getBoundingClientRect();
    return telaParaMundo(vista.current, { x: cx - (r?.left ?? 0), y: cy - (r?.top ?? 0) });
  }, []);

  const vistaDeTudo = useCallback(() => {
    const t = tamanhoTela();
    const c = caixaDe(props.current.vivos);
    return enquadrar(c, t.w, t.h, { topo: props.current.margens.topo, pe: props.current.margens.pe, margem: t.w < 600 ? 20 : 48 });
  }, [tamanhoTela]);

  useImperativeHandle(
    api,
    () => ({
      centro: () => {
        const t = tamanhoTela();
        const m = props.current.margens;
        return telaParaMundo(vista.current, { x: t.w / 2, y: m.topo + (t.h - m.topo - m.pe) / 2 });
      },
      enquadrar: (suave = true) => animarPara(vistaDeTudo(), suave),
      zoom: (fator: number) => {
        const t = tamanhoTela();
        animarPara(zoomEm(vista.current, vista.current.z * fator, { x: t.w / 2, y: t.h / 2 }));
      },
      zoomCem: () => {
        const t = tamanhoTela();
        animarPara(zoomEm(vista.current, 1, { x: t.w / 2, y: t.h / 2 }));
      },
      irPara: (id: string) => {
        const n = porIdRef.current.get(id);
        if (!n) return;
        const t = tamanhoTela();
        const m = props.current.margens;
        const z = Math.max(vista.current.z, 0.8);
        animarPara({ z, x: t.w / 2 - (n.x + n.w / 2) * z, y: m.topo + (t.h - m.topo - m.pe) / 2 - (n.y + n.h / 2) * z }, false);
      },
    }),
    [animarPara, vistaDeTudo, tamanhoTela],
  );

  // a primeira vista: a guardada neste aparelho, ou tudo enquadrado
  useLayoutEffect(() => {
    const g = lerVistaGuardada(p.fluxoId);
    vista.current = g ?? vistaDeTudo();
    pintar();
    // só ao montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────────── DOM de nós e ligações durante o gesto ───────────── */

  const elDoNo = (id: string) => plano.current?.querySelector<HTMLElement>(`[data-no="${id}"]`) ?? null;
  const ligacoesDe = (ids: ReadonlySet<string>): LigDom[] => {
    const pl = plano.current;
    if (!pl) return [];
    return props.current.ligacoes
      .filter((l) => ids.has(l.de) || ids.has(l.para))
      .map((l) => {
        const g = pl.querySelector<SVGGElement>(`[data-lig="${l.id}"]`);
        return {
          id: l.id,
          de: l.de,
          para: l.para,
          linha: g?.querySelector<SVGPathElement>(".fx-lig__linha") ?? null,
          seta: g?.querySelector<SVGPathElement>(".fx-lig__seta") ?? null,
          toque: g?.querySelector<SVGPathElement>(".fx-lig__toque") ?? null,
          rotulo: pl.querySelector<HTMLElement>(`[data-rotulo-lig="${l.id}"]`),
        };
      });
  };
  const redesenharLigacoes = (ligs: LigDom[], caixa: (id: string) => Caixa | undefined) => {
    for (const l of ligs) {
      const a = caixa(l.de);
      const b = caixa(l.para);
      if (!a || !b) continue;
      const c = caminhoLigacao(a, b);
      l.linha?.setAttribute("d", c.d);
      l.toque?.setAttribute("d", c.d);
      l.seta?.setAttribute("d", pontaDaSeta(c.fim, c.angulo));
      if (l.rotulo) {
        l.rotulo.style.left = `${c.meio.x}px`;
        l.rotulo.style.top = `${c.meio.y}px`;
      }
    }
  };

  const conjuntoParaArrastar = (no: string): string[] => {
    const { selecao, vivos } = props.current;
    const base = selecao.has(no) ? [...selecao].filter((id) => porIdRef.current.has(id)) : [no];
    const s = new Set(base);
    for (const id of base) if (porIdRef.current.get(id)?.tipo === "secao") for (const n of vivos) if (n.secaoId === id) s.add(n.id);
    return [...s];
  };

  const comecarArrasto = (g: { p: number; sx: number; sy: number }, no: string, toque: boolean): Gesto | null => {
    const ids = conjuntoParaArrastar(no);
    const els: ElNo[] = [];
    for (const id of ids) {
      const n = porIdRef.current.get(id);
      const el = elDoNo(id);
      if (n && el) els.push({ id, el, caixa: { x: n.x, y: n.y, w: n.w, h: n.h } });
    }
    if (!els.length) return null;
    for (const e of els) e.el.dataset.arrastando = toque ? "erguido" : "";
    tela.current!.dataset.gesto = "arrastar";
    return { t: "arrastar", p: g.p, sx: g.sx, sy: g.sy, els, ligs: ligacoesDe(new Set(ids)), toque, moveu: false, dx: 0, dy: 0 };
  };

  const fimDoArrasto = (g: Extract<Gesto, { t: "arrastar" }>, cancelar = false) => {
    const movidos = g.moveu && !cancelar ? g.els.map((e) => ({ id: e.id, x: Math.round(e.caixa.x + g.dx), y: Math.round(e.caixa.y + g.dy) })) : [];
    flushSync(() => {
      if (movidos.length)
        props.current.moverFim(
          movidos,
          g.els.map((e) => e.id),
        );
    });
    for (const e of g.els) {
      e.el.style.transform = "";
      delete e.el.dataset.arrastando;
    }
    if (!movidos.length) redesenharLigacoes(g.ligs, (id) => porIdRef.current.get(id));
    delete tela.current?.dataset.gesto;
  };

  const limparLaco = (g: Extract<Gesto, { t: "laco" }>) => {
    if (laco.current) laco.current.hidden = true;
    for (const id of g.quase) delete elDoNo(id)?.dataset.quase;
  };

  /* ───────────── ponteiros ───────────── */

  const capturar = (pid: number) => {
    try {
      tela.current?.setPointerCapture(pid);
    } catch {}
  };

  const aoBaixar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    const toque = e.pointerType !== "mouse";
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY, toque });
    const pp = props.current;
    // dois dedos: pinça (larga o que estava acontecendo)
    if (ponteiros.current.size === 2 && toque) {
      const g = gesto.current;
      if (g?.t === "segurar") window.clearTimeout(g.timer);
      if (g?.t === "arrastar") fimDoArrasto(g, true);
      if (g?.t === "laco") limparLaco(g);
      const [a, b] = [...ponteiros.current.entries()];
      const m = local((a[1].x + b[1].x) / 2, (a[1].y + b[1].y) / 2);
      gesto.current = { t: "pinca", a: a[0], b: b[0], d0: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1, m0: m, v0: { ...vista.current } };
      capturar(a[0]);
      capturar(b[0]);
      return;
    }
    if (gesto.current) return;
    const alvo = e.target as Element;
    if (alvo.closest("input, textarea, a, button, select, [contenteditable='true']")) return;
    let noEl = alvo.closest<HTMLElement>("[data-no]");
    // a seção se pega pelo nome; o miolo dela é canvas (laço, andar)
    if (noEl?.dataset.tipo === "secao" && !alvo.closest(".fx-secao__cabeca") && !alvo.closest("[data-alca]")) noEl = null;
    const ligEl = alvo.closest<SVGGElement>("[data-lig]") ?? alvo.closest<HTMLElement>("[data-rotulo-lig]");
    const pid = e.pointerId;
    const base = { p: pid, sx: e.clientX, sy: e.clientY };
    // a captura só quando o gesto anda (capturar já no aperto mandaria o clique duplo para o canvas, não para o nó)

    if (noEl) {
      const id = noEl.dataset.no!;
      if (pp.editando?.id === id) return;
      if (pp.podeEditar && alvo.closest("[data-alca]")) {
        const n = porIdRef.current.get(id);
        if (!n) return;
        tela.current!.dataset.gesto = "redim";
        capturar(pid);
        gesto.current = {
          t: "redim",
          ...base,
          el: { id, el: noEl, caixa: { x: n.x, y: n.y, w: n.w, h: n.h } },
          ligs: ligacoesDe(new Set([id])),
          c: { x: n.x, y: n.y, w: n.w, h: n.h },
        };
        return;
      }
      if (pp.podeEditar && alvo.closest("[data-porta]")) {
        const n = porIdRef.current.get(id);
        if (!n) return;
        tela.current!.dataset.gesto = "ligar";
        capturar(pid);
        gesto.current = { t: "ligar", p: pid, de: id, caixa: { x: n.x, y: n.y, w: n.w, h: n.h } };
        return;
      }
      if (pp.ferramenta === "ligar" && pp.podeEditar) {
        pp.escolherParaLigar(id);
        gesto.current = null;
        return;
      }
      const jaEscolhido = pp.selecao.has(id);
      if (toque) {
        if (!pp.podeEditar) {
          gesto.current = { t: "pan", ...base, v0: { ...vista.current }, moveu: false, no: id };
          return;
        }
        const timer = window.setTimeout(() => {
          const g = gesto.current;
          if (g?.t !== "segurar" || g.no !== id) return;
          if (!props.current.selecao.has(id)) flushSync(() => props.current.selecionar([id], "trocar"));
          const novo = comecarArrasto(g, id, true);
          if (novo) {
            capturar(g.p);
            vibrar(8);
            gesto.current = novo;
          }
        }, SEGURAR_MS);
        gesto.current = { t: "segurar", ...base, no: id, timer, jaEscolhido };
        return;
      }
      if (e.shiftKey || e.metaKey) pp.selecionar([id], "alternar");
      else if (!jaEscolhido) pp.selecionar([id], "trocar");
      gesto.current = pp.podeEditar ? { t: "tocar", ...base, no: id, jaEscolhido } : null;
      return;
    }
    if (ligEl) {
      const lid = (ligEl as HTMLElement).dataset.lig ?? (ligEl as HTMLElement).dataset.rotuloLig ?? null;
      pp.selecionarLig(lid);
      gesto.current = null;
      return;
    }
    // vazio
    if (toque || espaco.current || e.button === 1) {
      tela.current!.dataset.gesto = "pan";
      gesto.current = { t: "pan", ...base, v0: { ...vista.current }, moveu: false, no: null };
      return;
    }
    gesto.current = { t: "laco", ...base, somar: e.shiftKey || e.metaKey, moveu: false, quase: new Set() };
  };

  const aoMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = ponteiros.current.get(e.pointerId);
    if (pt) {
      pt.x = e.clientX;
      pt.y = e.clientY;
    }
    const g = gesto.current;
    if (!g) return;
    if (g.t === "pinca") {
      const a = ponteiros.current.get(g.a);
      const b = ponteiros.current.get(g.b);
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const w = telaParaMundo(g.v0, g.m0);
      const z = zoomEm(g.v0, (g.v0.z * d) / g.d0, g.m0).z;
      vista.current = { z, x: m.x - w.x * z, y: m.y - w.y * z };
      pintar();
      return;
    }
    if ("p" in g && g.p !== e.pointerId) return;
    const dx = "sx" in g ? e.clientX - g.sx : 0;
    const dy = "sy" in g ? e.clientY - g.sy : 0;
    switch (g.t) {
      case "pan": {
        if (!g.moveu && Math.hypot(dx, dy) < TRAVA_TOQUE) return;
        if (!g.moveu) capturar(g.p);
        g.moveu = true;
        vista.current = { ...g.v0, x: g.v0.x + dx, y: g.v0.y + dy };
        pintar();
        return;
      }
      case "segurar": {
        if (Math.hypot(dx, dy) < TRAVA_TOQUE) return;
        window.clearTimeout(g.timer);
        capturar(g.p);
        tela.current!.dataset.gesto = "pan";
        gesto.current = { t: "pan", p: g.p, sx: g.sx, sy: g.sy, v0: { ...vista.current }, moveu: true, no: null };
        vista.current = { ...vista.current, x: vista.current.x + dx, y: vista.current.y + dy };
        pintar();
        return;
      }
      case "tocar": {
        if (Math.hypot(dx, dy) < TRAVA_MOUSE) return;
        const novo = comecarArrasto(g, g.no, false);
        capturar(g.p);
        gesto.current = novo;
        if (novo) aoMover(e);
        return;
      }
      case "arrastar": {
        const z = vista.current.z;
        g.dx = Math.round(dx / z);
        g.dy = Math.round(dy / z);
        if (!g.moveu && Math.hypot(dx, dy) < 2) return;
        g.moveu = true;
        for (const el of g.els) el.el.style.transform = `translate(${g.dx}px, ${g.dy}px)${g.toque ? " scale(1.03)" : ""}`;
        const mov = new Map(g.els.map((x) => [x.id, x.caixa]));
        redesenharLigacoes(g.ligs, (id) => {
          const c = mov.get(id);
          return c ? { ...c, x: c.x + g.dx, y: c.y + g.dy } : porIdRef.current.get(id);
        });
        return;
      }
      case "redim": {
        const z = vista.current.z;
        const n = porIdRef.current.get(g.el.id);
        const tipo = n?.tipo ?? "nota";
        const w = Math.max(MIN_LADO[tipo], Math.round(g.el.caixa.w + dx / z));
        const h = Math.max(MIN_ALTURA[tipo], Math.round(g.el.caixa.h + dy / z));
        g.c = { ...g.el.caixa, w, h };
        g.el.el.style.width = `${w}px`;
        g.el.el.style.height = `${h}px`;
        redesenharLigacoes(g.ligs, (id) => (id === g.el.id ? g.c : porIdRef.current.get(id)));
        return;
      }
      case "ligar": {
        const m = mundo(e.clientX, e.clientY);
        const c = caminhoLigacao(g.caixa, m);
        if (puxando.current) {
          puxando.current.setAttribute("d", c.d);
          puxando.current.style.display = "";
        }
        const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-no]");
        plano.current?.querySelectorAll("[data-alvo]").forEach((x) => delete (x as HTMLElement).dataset.alvo);
        if (sob && sob.dataset.no !== g.de) sob.dataset.alvo = "";
        return;
      }
      case "laco": {
        if (!g.moveu && Math.hypot(dx, dy) < TRAVA_MOUSE) return;
        if (!g.moveu) capturar(g.p);
        g.moveu = true;
        const a = local(g.sx, g.sy);
        const b = local(e.clientX, e.clientY);
        const r = retangulo(a, b);
        if (laco.current) {
          laco.current.hidden = false;
          Object.assign(laco.current.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        }
        const ma = telaParaMundo(vista.current, a);
        const mb = telaParaMundo(vista.current, b);
        const rm = retangulo(ma, mb);
        const agora = new Set<string>();
        for (const n of props.current.vivos) {
          const dentro = n.tipo === "secao" ? rm.x <= n.x && rm.y <= n.y && rm.x + rm.w >= n.x + n.w && rm.y + rm.h >= n.y + n.h : intersecta(rm, n);
          if (dentro) agora.add(n.id);
        }
        for (const id of g.quase) if (!agora.has(id)) delete elDoNo(id)?.dataset.quase;
        for (const id of agora) if (!g.quase.has(id)) elDoNo(id)?.setAttribute("data-quase", "");
        g.quase = agora;
        return;
      }
    }
  };

  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    ponteiros.current.delete(e.pointerId);
    const g = gesto.current;
    if (!g) return;
    if (g.t === "pinca") {
      if (e.pointerId === g.a || e.pointerId === g.b) gesto.current = null;
      return;
    }
    if (g.p !== e.pointerId) return;
    gesto.current = null;
    const pp = props.current;
    const cancelado = e.type === "pointercancel";
    switch (g.t) {
      case "pan":
        delete tela.current?.dataset.gesto;
        if (!g.moveu && !cancelado) {
          if (g.no) pp.selecionar([g.no], "trocar");
          else {
            pp.selecionar([], "trocar");
            pp.selecionarLig(null);
          }
        }
        return;
      case "segurar":
        window.clearTimeout(g.timer);
        if (cancelado) return;
        // toque curto: escolhe; no já escolhido, edita
        if (g.jaEscolhido && pp.selecao.size === 1) {
          const n = porIdRef.current.get(g.no);
          const campo = n ? CAMPO_DO_TIPO[n.tipo] : undefined;
          if (campo) pp.editar(g.no, campo);
        } else pp.selecionar([g.no], "trocar");
        return;
      case "tocar":
        return;
      case "arrastar":
        fimDoArrasto(g, cancelado);
        return;
      case "redim": {
        delete tela.current?.dataset.gesto;
        const { id } = g.el;
        const mudou = g.c.w !== g.el.caixa.w || g.c.h !== g.el.caixa.h;
        flushSync(() => {
          if (mudou && !cancelado) pp.redimensionarFim(id, g.c);
        });
        g.el.el.style.width = "";
        g.el.el.style.height = "";
        if (!mudou || cancelado) redesenharLigacoes(g.ligs, (x) => porIdRef.current.get(x));
        return;
      }
      case "ligar": {
        delete tela.current?.dataset.gesto;
        if (puxando.current) puxando.current.style.display = "none";
        plano.current?.querySelectorAll("[data-alvo]").forEach((x) => delete (x as HTMLElement).dataset.alvo);
        if (cancelado) return;
        const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-no]");
        const para = sob?.dataset.no;
        if (para && para !== g.de) pp.ligar(g.de, para);
        else if (!para) {
          const m = mundo(e.clientX, e.clientY);
          // soltou perto da própria bolinha: desistiu
          if (Math.hypot(m.x - (g.caixa.x + g.caixa.w), m.y - (g.caixa.y + g.caixa.h / 2)) > 40) pp.ligar(g.de, m);
        }
        return;
      }
      case "laco": {
        limparLaco(g);
        if (cancelado) return;
        if (!g.moveu) {
          if (!g.somar) {
            pp.selecionar([], "trocar");
            pp.selecionarLig(null);
          }
          return;
        }
        pp.selecionar([...g.quase], g.somar ? "somar" : "trocar");
        return;
      }
    }
  };

  /* ───────────── roda, pinça do Safari, espaço, soltar arquivo ───────────── */

  useEffect(() => {
    const el = tela.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      const alvo = e.target as Element;
      if (!(e.ctrlKey || e.metaKey) && alvo.closest("textarea, .fx-lista")) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (e.ctrlKey || e.metaKey) {
        const fator = Math.exp(-e.deltaY * k * 0.0075);
        vista.current = zoomEm(vista.current, vista.current.z * fator, local(e.clientX, e.clientY));
      } else {
        vista.current = { ...vista.current, x: vista.current.x - e.deltaX * k, y: vista.current.y - e.deltaY * k };
      }
      pintar();
    };
    // a pinça do trackpad no Safari (gesture*), que não vira roda com Ctrl
    let z0 = 1;
    const gInicio = (e: Event) => {
      e.preventDefault();
      z0 = vista.current.z;
    };
    const gMuda = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      vista.current = zoomEm(vista.current, z0 * ge.scale, local(ge.clientX, ge.clientY));
      pintar();
    };
    el.addEventListener("wheel", roda, { passive: false });
    el.addEventListener("gesturestart", gInicio);
    el.addEventListener("gesturechange", gMuda);
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable='true']")) return;
      if (e.code === "Space") {
        espaco.current = e.type === "keydown";
        if (tela.current) tela.current.dataset.mao = espaco.current ? "" : "nada";
        if (e.type === "keydown") e.preventDefault();
      }
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("keyup", tecla);
    return () => {
      el.removeEventListener("wheel", roda);
      el.removeEventListener("gesturestart", gInicio);
      el.removeEventListener("gesturechange", gMuda);
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("keyup", tecla);
    };
  }, [pintar, local]);

  const aoDuploClique = (e: React.MouseEvent<HTMLDivElement>) => {
    const pp = props.current;
    const alvo = e.target as Element;
    if (alvo.closest("input, textarea, a, button")) return;
    const lig = alvo.closest<HTMLElement>("[data-lig], [data-rotulo-lig]");
    if (lig && pp.podeEditar) {
      pp.editarRotulo(lig.dataset.lig ?? lig.dataset.rotuloLig!);
      return;
    }
    let noEl = alvo.closest<HTMLElement>("[data-no]");
    if (noEl?.dataset.tipo === "secao" && !alvo.closest(".fx-secao__cabeca")) noEl = null;
    if (noEl) {
      const n = porIdRef.current.get(noEl.dataset.no!);
      const campo = n ? CAMPO_DO_TIPO[n.tipo] : undefined;
      if (n && campo && pp.podeEditar) pp.editar(n.id, campo);
      return;
    }
    if (pp.podeEditar) pp.notaEm(mundo(e.clientX, e.clientY));
  };

  /* ───────────── desenho ───────────── */

  const secoes = useMemo(() => p.vivos.filter((n) => n.tipo === "secao").sort((a, b) => a.z - b.z), [p.vivos]);
  const outros = useMemo(() => p.vivos.filter((n) => n.tipo !== "secao").sort((a, b) => a.z - b.z), [p.vivos]);
  const desenhos = useMemo(
    () =>
      p.ligacoes.flatMap((l) => {
        const a = porId.get(l.de);
        const b = porId.get(l.para);
        if (!a || !b) return [];
        return [{ l, c: caminhoLigacao(a, b) }];
      }),
    [p.ligacoes, porId],
  );
  const sozinho = p.selecao.size === 1 ? [...p.selecao][0] : null;
  const desenhaNo = (n: NoFluxo) => (
    <No
      key={n.id}
      no={n}
      ref_={p.refs[n.id]}
      selecionado={p.selecao.has(n.id) || p.ligandoDe === n.id}
      sozinho={sozinho === n.id}
      editando={p.editando?.id === n.id ? p.editando.campo : null}
      podeEditar={p.podeEditar}
      grande={zoomAlto || n.w > 320}
      aoSalvar={p.salvarCampo}
    />
  );

  return (
    <div
      ref={tela}
      className="fx-tela"
      data-ferramenta={p.ferramenta}
      data-leitura={!p.podeEditar || undefined}
      role="application"
      aria-label="Canvas do fluxo"
      aria-roledescription="canvas"
      onPointerDown={aoBaixar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onLostPointerCapture={(e) => {
        if (gesto.current && "p" in gesto.current && gesto.current.p === e.pointerId) aoSoltar(e);
      }}
      onDoubleClick={aoDuploClique}
      onContextMenu={(e) => {
        // segurar o nó no toque é erguer, não o menu do sistema
        if (gesto.current) e.preventDefault();
      }}
      onDragOver={(e) => {
        if (!p.podeEditar) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        if (!p.podeEditar) return;
        e.preventDefault();
        p.soltar(e.dataTransfer, mundo(e.clientX, e.clientY));
      }}
    >
      <div ref={plano} className="fx-plano">
        {secoes.map(desenhaNo)}
        <svg className="fx-ligacoes" width="1" height="1" aria-hidden="true">
          {desenhos.map(({ l, c }) => (
            <g key={l.id} data-lig={l.id} data-sel={p.ligSel === l.id || undefined}>
              <path className="fx-lig__toque" d={c.d} />
              <path className="fx-lig__linha" d={c.d} pathLength={1} />
              <path className="fx-lig__seta" d={pontaDaSeta(c.fim, c.angulo)} />
            </g>
          ))}
          <path ref={puxando} className="fx-lig__puxando" style={{ display: "none" }} />
        </svg>
        {desenhos.map(({ l, c }) =>
          l.rotulo ? (
            <div key={l.id} className="fx-rotulo" data-rotulo-lig={l.id} data-sel={p.ligSel === l.id || undefined} style={{ left: c.meio.x, top: c.meio.y }}>
              {l.rotulo}
            </div>
          ) : null,
        )}
        {outros.map(desenhaNo)}
        {p.subindo.map((s) => (
          <div key={s.id} className="fx-no fx-subindo" style={{ left: s.x, top: s.y, width: s.w, height: s.h }} role="status" aria-label="Enviando imagem">
            <span className="fx-subindo__barra" style={{ transform: `scaleX(${Math.max(0.04, s.progresso)})` }} />
            <span className="fx-subindo__texto">{s.progresso >= 1 ? "Preparando…" : `${Math.round(s.progresso * 100)}%`}</span>
          </div>
        ))}
      </div>
      <div ref={laco} className="fx-laco" hidden />
    </div>
  );
});

/** O número do zoom fora do canvas (o pé da tela): lê o `data-zoom` que o canvas pinta, sem render por quadro. */
export function ZoomRotulo() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tela = document.querySelector<HTMLElement>(".fx-tela");
    const el = ref.current;
    if (!tela || !el) return;
    const ver = () => {
      el.textContent = `${tela.dataset.zoom ?? "100"}%`;
    };
    ver();
    const mo = new MutationObserver(ver);
    mo.observe(tela, { attributes: true, attributeFilter: ["data-zoom"] });
    return () => mo.disconnect();
  }, []);
  return <span ref={ref}>100%</span>;
}
