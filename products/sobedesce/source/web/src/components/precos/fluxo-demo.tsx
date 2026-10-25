"use client";

import { AudioLines, Check, FolderOpen, HardDrive, Video } from "lucide-react";
import { useRef } from "react";
import { ease, span, useClock } from "@/components/home/demo-kit";
import { usePrefersReducedMotion } from "@/components/home/motion";
import { cn } from "@/lib/cn";

/**
 * Produtora + Synquei em um laço de 12 s: o cartão é espetado e o SOBEDESCE copia para os dois HDs (conferido, só o
 * novo); o Synquei alinha as câmeras e o gravador pelo som; o DaVinci ganha as pastas da diária e os clipes novos, com
 * a cor de cada câmera. Desenhado direto no DOM (useClock); com "reduzir movimento", fica no quadro final.
 */
const T = 12;
const STILL = 10.4;
const COPIA = [0.8, 3.6] as const;
const CONFERE = [3.85, 4.15] as const;
const SYNC = [4.5, 7.0] as const;
const BINS_DE = 7.3;
const SOME = [T - 0.6, T] as const;

const HDS = ["HD do projeto", "HD backup"] as const;

/** Faixas do Synquei: o mesmo som, cada aparelho começando num ponto (deslocamento inicial em %). */
const FAIXAS = [
  {
    nome: "Câmera A · FX30",
    cor: "var(--color-down)",
    desloc: -14,
    icone: Video,
  },
  {
    nome: "Câmera B · A7S III",
    cor: "var(--color-up)",
    desloc: 18,
    icone: Video,
  },
  {
    nome: "Som · Gravador F8",
    cor: "var(--color-ok)",
    desloc: -6,
    icone: AudioLines,
  },
] as const;

/** Media Pool do DaVinci: a árvore que aparece, linha por linha (nível de recuo e se é a pasta nova). */
const BINS = [
  { nome: "Diária 01", nivel: 0 },
  { nome: "Câmeras", nivel: 1 },
  { nome: "Câmera A - FX30", nivel: 2, cor: "var(--color-down)" },
  { nome: "Cartão 02", nivel: 3, novo: true, cor: "var(--color-down)" },
  { nome: "Áudio", nivel: 1 },
  { nome: "Som - F8", nivel: 2, cor: "var(--color-ok)" },
  { nome: "Sequências", nivel: 1 },
] as const;
const CLIPES = 4;

/** Picos de uma "fala" (determinístico): a mesma forma em todas as faixas, para o alinhamento fazer sentido. */
const ONDA = (() => {
  const n = 64;
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 200;
    const a =
      Math.abs(
        Math.sin(i * 0.9) * Math.cos(i * 0.37) + 0.35 * Math.sin(i * 2.3),
      ) *
        9 +
      (i % 9 === 0 ? 4 : 1);
    d += `M${x.toFixed(1)},${(12 - a).toFixed(1)}V${(12 + a).toFixed(1)}`;
  }
  return d;
})();

function Etapa({
  n,
  titulo,
  sub,
  refEl,
}: {
  n: number;
  titulo: string;
  sub: string;
  refEl: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={refEl} data-estado="" className="group/e flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/8 text-[12px] font-semibold text-white/60 ring-1 ring-white/12 transition-colors duration-300 group-data-[estado=agora]/e:bg-white group-data-[estado=agora]/e:text-stage group-data-[estado=feito]/e:bg-ok/20 group-data-[estado=feito]/e:text-ok group-data-[estado=feito]/e:ring-ok/30">
        <span className="group-data-[estado=feito]/e:hidden">{n}</span>
        <Check
          className="hidden size-3.5 group-data-[estado=feito]/e:block"
          strokeWidth={3}
          aria-hidden="true"
        />
      </span>
      <span className="grid">
        <b className="text-[14px] font-semibold text-white/55 transition-colors duration-300 group-data-[estado=agora]/e:text-white group-data-[estado=feito]/e:text-white/85">
          {titulo}
        </b>
        <span className="text-[12px] text-white/45">{sub}</span>
      </span>
    </div>
  );
}

export function FluxoDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const etapas = useRef<(HTMLDivElement | null)[]>([]);
  const cartao = useRef<HTMLDivElement>(null);
  const barras = useRef<(HTMLSpanElement | null)[]>([]);
  const oks = useRef<(HTMLSpanElement | null)[]>([]);
  const ondas = useRef<(SVGGElement | null)[]>([]);
  const linha = useRef<HTMLSpanElement>(null);
  const sincronizado = useRef<HTMLSpanElement>(null);
  const bins = useRef<(HTMLLIElement | null)[]>([]);
  const clipes = useRef<(HTMLSpanElement | null)[]>([]);
  const reduce = usePrefersReducedMotion();

  const paint = (t: number) => {
    const fora = 1 - span(t, SOME[0], SOME[1]);
    // 1. Cartão espetado e cópia para os HDs.
    const entra = ease(span(t, 0, 0.6));
    if (cartao.current) {
      cartao.current.style.opacity = (entra * fora).toFixed(3);
      cartao.current.style.transform = `translateY(${((1 - entra) * -14).toFixed(1)}px)`;
    }
    const p = ease(span(t, COPIA[0], COPIA[1])) * fora;
    barras.current.forEach(
      (el) => el && (el.style.transform = `scaleX(${p.toFixed(4)})`),
    );
    oks.current.forEach(
      (el, i) =>
        el && (el.style.opacity = t >= CONFERE[i] ? String(fora) : "0"),
    );
    // 2. Synquei: as faixas deslizam até o mesmo som ficar alinhado.
    const s = ease(span(t, SYNC[0], SYNC[1]));
    ondas.current.forEach(
      (el, i) =>
        el &&
        el.setAttribute(
          "transform",
          `translate(${(FAIXAS[i].desloc * 2 * (1 - s)).toFixed(2)} 0)`,
        ),
    );
    const alinhado = t >= SYNC[1] ? fora : 0;
    if (linha.current) linha.current.style.opacity = String(alinhado);
    if (sincronizado.current)
      sincronizado.current.style.opacity = String(alinhado);
    // 3. DaVinci: pastas linha a linha, depois os clipes novos do cartão.
    bins.current.forEach((el, i) => {
      if (!el) return;
      const v =
        ease(span(t, BINS_DE + i * 0.28, BINS_DE + i * 0.28 + 0.35)) * fora;
      el.style.opacity = v.toFixed(3);
      el.style.transform = `translateX(${((1 - v) * -8).toFixed(1)}px)`;
    });
    const clipesDe = BINS_DE + BINS.length * 0.28 + 0.1;
    clipes.current.forEach((el, i) => {
      if (!el) return;
      const v =
        ease(span(t, clipesDe + i * 0.18, clipesDe + i * 0.18 + 0.3)) * fora;
      el.style.opacity = v.toFixed(3);
      el.style.transform = `scale(${(0.85 + 0.15 * v).toFixed(3)})`;
    });
    // Qual etapa está acontecendo.
    const fim = [
      CONFERE[1] + 0.2,
      SYNC[1] + 0.1,
      clipesDe + CLIPES * 0.18 + 0.3,
    ];
    const ini = [0, CONFERE[1] + 0.2, SYNC[1] + 0.1];
    etapas.current.forEach((el, i) => {
      if (!el) return;
      const estado =
        t >= SOME[0] ? "" : t >= fim[i] ? "feito" : t >= ini[i] ? "agora" : "";
      if (el.dataset.estado !== estado) el.dataset.estado = estado;
    });
  };

  useClock(rootRef, T, paint, reduce, STILL);

  return (
    <div
      ref={rootRef}
      className="grid gap-6 rounded-[28px] bg-stage p-5 text-white ring-1 ring-white/10 select-none sm:p-8"
      aria-hidden="true"
    >
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-4">
        {/* 1. O cartão e os HDs */}
        <div className="grid content-start gap-3">
          <Etapa
            n={1}
            titulo="No set · SOBEDESCE"
            sub="Copia, confere, só o novo"
            refEl={(el) => void (etapas.current[0] = el)}
          />
          <div className="grid content-start gap-4 rounded-[20px] bg-white/[0.04] p-4 ring-1 ring-white/8 lg:min-h-[330px]">
            <div
              ref={cartao}
              className="flex items-center gap-3"
              style={{ opacity: 0 }}
            >
              <span className="grid h-11 w-9 place-items-end bg-white/12 p-1 text-[9px] font-semibold text-white/80 [clip-path:polygon(0_0,72%_0,100%_18%,100%_100%,0_100%)]">
                SD
              </span>
              <span className="grid">
                <b className="text-[13px] font-semibold">Cartão espetado</b>
                <span className="text-[12px] text-white/50">
                  Câmera A · FX30
                </span>
              </span>
            </div>
            <ul className="grid gap-3">
              {HDS.map((hd, i) => (
                <li
                  key={hd}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5"
                >
                  <HardDrive className="size-4 text-white/45" />
                  <span className="truncate text-[12px] font-medium text-white/85">
                    {hd}
                  </span>
                  <span
                    ref={(el) => void (oks.current[i] = el)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-ok transition-opacity duration-300"
                    style={{ opacity: 0 }}
                  >
                    <Check className="size-3" strokeWidth={3} />
                    conferido
                  </span>
                  <span className="relative col-span-3 h-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      ref={(el) => void (barras.current[i] = el)}
                      className="absolute inset-0 origin-left rounded-full bg-[linear-gradient(90deg,var(--color-down),var(--color-up))] will-change-transform"
                      style={{ transform: "scaleX(0)" }}
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11.5px] text-white/45">
              O que já passou deste cartão não copia de novo.
            </p>
          </div>
        </div>

        {/* 2. Synquei: faixas que se alinham */}
        <div className="grid content-start gap-3">
          <Etapa
            n={2}
            titulo="Synquei"
            sub="Sincroniza pelo som"
            refEl={(el) => void (etapas.current[1] = el)}
          />
          <div className="grid content-start gap-3 rounded-[20px] bg-white/[0.04] p-4 ring-1 ring-white/8 lg:min-h-[330px]">
            <div className="relative grid gap-2.5">
              {FAIXAS.map((f, i) => {
                const Icone = f.icone;
                return (
                  <div key={f.nome} className="grid gap-1">
                    <span className="flex items-center gap-1.5 text-[11.5px] text-white/65">
                      <Icone className="size-3.5" style={{ color: f.cor }} />
                      {f.nome}
                    </span>
                    <svg
                      viewBox="0 0 200 24"
                      preserveAspectRatio="none"
                      className="h-7 w-full overflow-hidden rounded-md bg-white/[0.04]"
                    >
                      <g
                        ref={(el) => void (ondas.current[i] = el)}
                        transform={`translate(${f.desloc * 2} 0)`}
                      >
                        <path
                          d={ONDA}
                          stroke={f.cor}
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    </svg>
                  </div>
                );
              })}
              <span
                ref={linha}
                className="pointer-events-none absolute top-5 bottom-0 left-[37%] w-px bg-white/70 transition-opacity duration-300"
                style={{ opacity: 0 }}
              />
            </div>
            <span
              ref={sincronizado}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ok transition-opacity duration-300"
              style={{ opacity: 0 }}
            >
              <Check className="size-3.5" strokeWidth={3} />
              Sincronizado pelo som
            </span>
          </div>
        </div>

        {/* 3. DaVinci: Media Pool */}
        <div className="grid content-start gap-3">
          <Etapa
            n={3}
            titulo="DaVinci Resolve"
            sub="Pastas e clipes novos"
            refEl={(el) => void (etapas.current[2] = el)}
          />
          <div className="grid content-start gap-3 rounded-[20px] bg-white/[0.04] p-4 ring-1 ring-white/8 lg:min-h-[330px]">
            <p className="flex items-center justify-between text-[11.5px] text-white/50">
              <span>Media Pool</span>
              <span className="rounded-full bg-up/25 px-1.5 py-0.5 text-[10.5px] font-semibold text-up-soft">
                Beta
              </span>
            </p>
            <ul className="grid gap-1">
              {BINS.map((b, i) => (
                <li
                  key={b.nome}
                  ref={(el) => void (bins.current[i] = el)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px]",
                    "novo" in b && b.novo
                      ? "bg-white/10 font-semibold text-white"
                      : "text-white/75",
                  )}
                  style={{ paddingLeft: `${6 + b.nivel * 14}px`, opacity: 0 }}
                >
                  <FolderOpen
                    className="size-3.5 shrink-0"
                    style={{
                      color: "cor" in b ? b.cor : "rgba(255,255,255,.5)",
                    }}
                  />
                  <span className="truncate">{b.nome}</span>
                  {"novo" in b && b.novo ? (
                    <span className="ml-auto text-[10.5px] font-medium text-ok">
                      novo
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: CLIPES }, (_, i) => (
                <span
                  key={i}
                  ref={(el) => void (clipes.current[i] = el)}
                  className="aspect-video rounded-[5px] bg-[linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.04))] ring-2 ring-down/80"
                  style={{ opacity: 0 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
