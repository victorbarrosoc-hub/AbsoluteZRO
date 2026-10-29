"use client";

import { useSyncExternalStore } from "react";

/**
 * Lê uma media query no cliente (no servidor vale `noServidor`). Para o que o CSS não alcança: o texto de um
 * placeholder no celular ou tirar os controles nativos do <video> no toque.
 */
export function useMidia(consulta: string, noServidor = false): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => noServidor,
  );
}
