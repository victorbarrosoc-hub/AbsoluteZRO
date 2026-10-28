"use client";
/**
 * A navegação do Maestro (C1 · Aurora): no computador, uma cápsula de vidro no topo com a Z primeiro (padrão do
 * ecossistema) e os grupos como menus: Produção (Hoje, Quadro, Aprovações, Projetos, Agenda), Comercial (Pedidos,
 * Orçamentos, Clientes), Operação (Freelas, Inventário), Dinheiro (Financeiro, direto, por ser um só) e Ajustes.
 * O menu do grupo onde a pessoa está mostra o nome da seção ("Quadro"). Só entra o que tem tela de verdade.
 * No celular vira a barra de baixo com o que se usa todo dia (Z, Hoje, Quadro, Aprovações) e "Mais".
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AJUSTES, BARRA, GRUPOS, MAIS, type Aba, type Grupo } from "@/lib/navegacao";
import { Icone } from "./icones";

function ativa(caminho: string, href: string) {
  return caminho === href || caminho.startsWith(`${href}/`);
}

function Item({ aba, caminho, className }: { aba: Aba; caminho: string; className: string }) {
  const on = ativa(caminho, aba.href);
  return (
    <Link href={aba.href} aria-current={on ? "page" : undefined} data-aba={aba.icone} className={className}>
      <Icone nome={aba.icone} size={16} />
      <span>{aba.nome}</span>
    </Link>
  );
}

/** Um grupo como menu da cápsula: botão (com a seção atual, se for deste grupo) e o painel de vidro com as seções. */
function Menu({ grupo, caminho, aberto, abrir, fechar }: { grupo: Grupo; caminho: string; aberto: boolean; abrir: () => void; fechar: () => void }) {
  const atual = grupo.abas.find((a) => ativa(caminho, a.href));
  const botao = useRef<HTMLButtonElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Abriu agora pelo mouse? Então o clique logo em seguida confirma, não fecha.
  const abriuEm = useRef(0);
  // Aberto pelo clique fica preso até outro clique, Esc, clique fora ou navegar; pelo mouse, fecha ao sair.
  const preso = useRef(false);
  const id = `menu-${grupo.nome}`;
  const parar = () => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
  };
  return (
    <div
      className="capsula__menu"
      data-aberto={aberto || undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        parar();
        espera.current = setTimeout(() => {
          abriuEm.current = Date.now();
          preso.current = false;
          abrir();
        }, 90);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        parar();
        if (!preso.current) espera.current = setTimeout(fechar, 180);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          fechar();
          botao.current?.focus();
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        className="capsula__item"
        aria-expanded={aberto}
        aria-controls={id}
        aria-current={atual ? "true" : undefined}
        onClick={() => {
          parar();
          if (!aberto) {
            abriuEm.current = Date.now();
            preso.current = true;
            abrir();
          } else if (Date.now() - abriuEm.current > 500) fechar();
          else preso.current = true;
        }}
      >
        {atual ? <Icone nome={atual.icone} size={16} /> : null}
        <span>
          {atual ? <span className="sr-only">{grupo.nome}: </span> : null}
          {atual ? atual.nome : grupo.nome}
        </span>
        <Icone nome="abaixo" size={12} />
      </button>
      <div id={id} className="capsula__painel" role="group" aria-label={grupo.nome ?? undefined} hidden={!aberto}>
        {grupo.abas.map((a) => (
          <Item key={a.href} aba={a} caminho={caminho} className="capsula__opcao" />
        ))}
      </div>
    </div>
  );
}

/** A cápsula (computador). */
export function Capsula() {
  const caminho = usePathname();
  // O menu aberto vale só no caminho em que abriu: ao navegar, fecha sozinho (sem efeito).
  const [aberto, setAberto] = useState<{ grupo: string; caminho: string } | null>(null);
  const raiz = useRef<HTMLElement>(null);
  const qual = aberto && aberto.caminho === caminho ? aberto.grupo : null;

  useEffect(() => {
    if (!qual) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(null);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [qual]);

  return (
    <nav ref={raiz} className="capsula__nav" aria-label="Seções do Maestro">
      {GRUPOS.map((g) =>
        g.nome === null || g.abas.length === 1 ? (
          g.abas.map((a) => <Item key={a.href} aba={a} caminho={caminho} className="capsula__item" />)
        ) : (
          <Menu
            key={g.nome}
            grupo={g}
            caminho={caminho}
            aberto={qual === g.nome}
            abrir={() => setAberto({ grupo: g.nome!, caminho })}
            fechar={() => setAberto((x) => (x?.grupo === g.nome ? null : x))}
          />
        ),
      )}
      <Item aba={AJUSTES} caminho={caminho} className="capsula__item capsula__item--icone" />
    </nav>
  );
}

/** A barra de baixo (celular): ícone e nome curto. "Mais" fica marcado nas seções que não estão na barra. */
export function Barra() {
  const caminho = usePathname();
  const naBarra = BARRA.slice(0, -1).some((a) => ativa(caminho, a.href));
  return (
    <nav className="barra" aria-label="Seções do Maestro">
      {BARRA.map((a) => {
        const on = a === MAIS ? !naBarra : ativa(caminho, a.href);
        return (
          <Link key={a.href} href={a.href} aria-current={on ? "page" : undefined} data-aba={a.icone}>
            <Icone nome={a.icone} size={20} />
            <span>{a.curto ?? a.nome}</span>
          </Link>
        );
      })}
    </nav>
  );
}
