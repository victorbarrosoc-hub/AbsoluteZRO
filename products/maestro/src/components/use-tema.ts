"use client";
/** O tema atual (data-theme no <html>), lido como fonte externa: muda no seletor, muda em quem usa o hook. */
import { useSyncExternalStore } from "react";

export type Tema = "light" | "dark";

function assinar(avisar: () => void) {
  const obs = new MutationObserver(avisar);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

const agora = (): Tema => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const noServidor = (): Tema | null => null;

export function useTema(): Tema | null {
  return useSyncExternalStore(assinar, agora, noServidor);
}
