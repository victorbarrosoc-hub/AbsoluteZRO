"use client";
/**
 * A luz ambiente (C1 · Aurora) e o relógio da cápsula. A hora vem do relógio de quem vê: o servidor desenha um padrão
 * neutro (luz apagada, relógio vazio) e, ao montar, o <html> ganha `data-hora`; o CSS acende a luz e cruza as cores
 * devagar quando a hora muda. Nada de estado por quadro no React: só um tique por minuto.
 */
import { useEffect, useSyncExternalStore } from "react";
import { luzDaHora, rotuloDoRelogio, saudacaoDaHora } from "@/lib/hora";

/** Um tique por minuto (alinhado ao relógio), compartilhado por todo mundo que lê a hora. */
const ouvintes = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function agendar() {
  const ms = 60_000 - (Date.now() % 60_000) + 50;
  timer = setTimeout(() => {
    for (const f of ouvintes) f();
    agendar();
  }, ms);
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  if (!timer) agendar();
  return () => {
    ouvintes.delete(avisar);
    if (!ouvintes.size && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** Minutos desde a meia-noite, no relógio de quem vê (estável dentro do minuto). */
function minutoAgora(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function useMinuto(): number | null {
  return useSyncExternalStore(assinar, minutoAgora, () => null);
}

/** O plano da luz; marca a hora no <html> (o CSS faz o resto). */
export function Ambiente() {
  const minuto = useMinuto();
  useEffect(() => {
    if (minuto === null) return;
    document.documentElement.dataset.hora = luzDaHora(Math.floor(minuto / 60));
  }, [minuto]);
  return <div className="amb" aria-hidden="true" />;
}

/** "Manhã · 10:42" na cápsula (vazio no servidor). */
export function Relogio() {
  const minuto = useMinuto();
  return (
    <span className="relogio" aria-hidden="true">
      {minuto === null ? null : rotuloDoRelogio(Math.floor(minuto / 60), minuto % 60)}
    </span>
  );
}

/** "Bom dia, Diana." com o padrão do servidor (fuso do Brasil) até montar. */
export function Saudacao({ nome, horaPadrao }: { nome: string | null; horaPadrao: number }) {
  const minuto = useMinuto();
  const hora = minuto === null ? horaPadrao : Math.floor(minuto / 60);
  return (
    <h1 className="atitle">
      {nome ? (
        <>
          {saudacaoDaHora(hora)}, <strong>{nome}.</strong>
        </>
      ) : (
        <strong>{saudacaoDaHora(hora)}.</strong>
      )}
    </h1>
  );
}
