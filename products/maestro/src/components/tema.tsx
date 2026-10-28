"use client";
/**
 * Seletor claro/escuro (claro é o padrão da casa). Troca na hora (atributo no <html> + cookie zro_theme, lido no
 * layout do servidor na próxima visita), sem recarregar a página.
 */
import { Icone } from "./icones";
import { useTema, type Tema } from "./use-tema";

export function SeletorDeTema() {
  const tema = useTema();

  function escolher(proximo: Tema) {
    const raiz = document.documentElement;
    raiz.classList.add("theme-switching");
    raiz.dataset.theme = proximo;
    document.cookie = `zro_theme=${proximo}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", proximo === "light" ? "#f7f3ee" : "#0a0c16");
    window.setTimeout(() => raiz.classList.remove("theme-switching"), 400);
  }

  return (
    <div className="tema" role="group" aria-label="Tema">
      <button type="button" aria-pressed={tema === "light"} title="Tema claro" onClick={() => escolher("light")}>
        <Icone nome="sol" />
        <span className="sr-only">Tema claro</span>
      </button>
      <button type="button" aria-pressed={tema === "dark"} title="Tema escuro" onClick={() => escolher("dark")}>
        <Icone nome="lua" />
        <span className="sr-only">Tema escuro</span>
      </button>
    </div>
  );
}
