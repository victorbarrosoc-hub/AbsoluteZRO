"use client";
/**
 * O Set da Absolute ZRO (ADR 0032 do HUB) na barra de cima: quem da equipe está online (e em qual app) e as conversas,
 * inclusive a do projeto (a mesma que o HUB e o SOBEDESCE mostram). Discreto como a Z: uma pílula pequena perto da
 * conta. É o `<zro-set>` publicado pela Absolute ZRO; fala com /api/zro/set, o repasse do servidor que acrescenta o
 * token da sessão (lib/zro/set.ts). Sem login com o escopo do Set, o próprio widget some.
 */
import { useEffect } from "react";

export const ZRO_SET_SCRIPT = "https://absolutezro.com/set/v1/zro-set.js";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "zro-set": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { api?: string; modo?: string; projeto?: string };
    }
  }
}

export function SetZro() {
  useEffect(() => {
    if (customElements.get("zro-set") || document.querySelector(`script[src="${ZRO_SET_SCRIPT}"]`)) return;
    const s = document.createElement("script");
    s.type = "module";
    s.src = ZRO_SET_SCRIPT;
    document.head.append(s);
  }, []);
  return <zro-set api="/api/zro/set" className="set-zro" />;
}
