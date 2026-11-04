"use client";
/**
 * O que o SOBEDESCE publicado sabe fazer no modo embutido (contrato 2, `src/lib/sobedesce/embutido.ts`). O Maestro só
 * mostra o que depende de um recado novo (hoje, "Enviar a entrega" do card) quando o `pronto` do SOBEDESCE lista o
 * recurso. Quem diz: a sonda (`?no=maestro&modo=sonda`, um quadro escondido e pequeno, uma vez por aba, só quando uma
 * tela pede) ou o `pronto` do quadro de Arquivos (`sobedesce-vivo.tsx`). Sem resposta (SOBEDESCE antigo, fora do ar, ou
 * o Maestro fora de maestro.absolutezro.com, onde o SOBEDESCE não se deixa embutir): nenhum recurso, nada aparece.
 *
 * A resposta fica no localStorage do aparelho por 6 h (sem: 10 min), só como atalho; sem storage, pergunta de novo.
 * Fora do React (`useSyncExternalStore`).
 */
import { useEffect, useSyncExternalStore } from "react";
import { enderecoDaSonda, lerRecado, type RECURSOS_CONHECIDOS } from "@/lib/sobedesce/embutido";

export type Recurso = (typeof RECURSOS_CONHECIDOS)[number];
/** null = ainda perguntando; [] = nenhum. */
type Estado = readonly Recurso[] | null;

const CHAVE = "maestro.sobedesce.recursos";
const VALE_COM = 6 * 3600_000;
const VALE_SEM = 10 * 60_000;
/** Depois do `load` da sonda, quanto esperar o `pronto` (o app manda antes do `load`). */
const FOLGA = 4000;
const ESPERA_MAXIMA = 20_000;

let estado: Estado = null;
let perguntando = false;
const ouvintes = new Set<() => void>();
const mudar = (e: Estado) => {
  estado = e;
  for (const f of ouvintes) f();
};

function guardado(): Estado {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as { em?: number; recursos?: unknown } | null;
    if (!v || typeof v.em !== "number" || !Array.isArray(v.recursos)) return null;
    const recursos = v.recursos.filter((r): r is Recurso => r === "enviar");
    if (Date.now() - v.em > (recursos.length ? VALE_COM : VALE_SEM)) return null;
    return recursos;
  } catch {
    return null;
  }
}

/** O `pronto` chegou (da sonda ou do quadro de Arquivos): anota e guarda. */
export function anotarRecursos(recursos: readonly string[]) {
  const r = recursos.filter((x): x is Recurso => x === "enviar");
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ em: Date.now(), recursos: r }));
  } catch {
    // sem storage: vale só nesta aba
  }
  mudar(r);
}

/** Um quadro escondido no `<body>` pergunta ao SOBEDESCE e some. */
function sondar() {
  if (perguntando || estado !== null) return;
  const ja = guardado();
  if (ja) return mudar(ja);
  perguntando = true;
  const f = document.createElement("iframe");
  f.src = enderecoDaSonda();
  f.title = "SOBEDESCE";
  f.tabIndex = -1;
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none";
  let fim = 0;
  const acabar = (r: readonly string[]) => {
    window.removeEventListener("message", aoReceber);
    clearTimeout(fim);
    f.remove();
    perguntando = false;
    anotarRecursos(r);
  };
  const aoReceber = (e: MessageEvent) => {
    if (e.source !== f.contentWindow) return;
    const r = lerRecado(e.origin, e.data);
    if (r?.tipo === "pronto") acabar(r.recursos);
  };
  window.addEventListener("message", aoReceber);
  f.addEventListener("load", () => {
    clearTimeout(fim);
    fim = window.setTimeout(() => acabar([]), FOLGA);
  });
  fim = window.setTimeout(() => acabar([]), ESPERA_MAXIMA);
  document.body.appendChild(f);
}

const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};

/** O recurso existe no SOBEDESCE publicado? null = perguntando. `pedir` = false não pergunta (sem SOBEDESCE no plano). */
export function useRecursoSobedesce(recurso: Recurso, pedir: boolean): boolean | null {
  const e = useSyncExternalStore(
    assinar,
    () => estado,
    () => null,
  );
  useEffect(() => {
    if (pedir) sondar();
  }, [pedir]);
  if (!pedir) return false;
  return e === null ? null : e.includes(recurso);
}
