"use client";
/**
 * "Instalar no celular": o Maestro como app na Tela de Início (PWA; manifesto em src/app/manifest.ts). No iPhone o
 * caminho é o do Safari (Compartilhar › Adicionar à Tela de Início), sem botão que finja instalar. No Android/Chrome,
 * quando o navegador oferece (`beforeinstallprompt`), um botão "Instalar" chama o pedido de verdade. Já aberto como app
 * (display-mode standalone), some.
 */
import { useEffect, useState } from "react";
import { Icone } from "./icones";

type PedidoDeInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function abertoComoApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstalarNoCelular({ variante = "ficha" }: { variante?: "ficha" | "pagina" }) {
  const [comoApp, setComoApp] = useState(false);
  const [pedido, setPedido] = useState<PedidoDeInstalacao | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setComoApp(abertoComoApp()), 0);
    const guardar = (e: Event) => {
      e.preventDefault();
      setPedido(e as PedidoDeInstalacao);
    };
    const instalado = () => {
      setPedido(null);
      setComoApp(true);
    };
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalado);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", instalado);
    };
  }, []);

  if (comoApp) return null;

  async function instalar() {
    if (!pedido) return;
    await pedido.prompt().catch(() => {});
    await pedido.userChoice.catch(() => null);
    setPedido(null);
  }

  return (
    <section className={`instalar instalar--${variante}`} aria-labelledby={`instalar-titulo-${variante}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- o ícone do app, 56 px, já do tamanho */}
      <img className="instalar__icone" src="/pwa/icone-192.png" alt="" width={56} height={56} />
      <div className="instalar__texto">
        <h2 className="instalar__titulo" id={`instalar-titulo-${variante}`}>
          No celular, <strong>como app.</strong>
        </h2>
        {pedido ? (
          <button type="button" className="glass-btn glass-btn--ink glass-btn--sm" onClick={instalar}>
            <Icone nome="baixar" size={16} /> Instalar
          </button>
        ) : (
          <ol className="instalar__passos" aria-label="No iPhone, pelo Safari" title="No Android: menu do Chrome › Instalar app">
            <li>
              <Icone nome="compartilhar" size={18} />
              <span>
                No Safari, <strong>Compartilhar</strong>
              </span>
            </li>
            <li>
              <Icone nome="adicionar" size={18} />
              <span>
                <strong>Adicionar à Tela de Início</strong>
              </span>
            </li>
          </ol>
        )}
      </div>
    </section>
  );
}
