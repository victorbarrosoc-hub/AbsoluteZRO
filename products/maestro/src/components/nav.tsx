"use client";
/**
 * A navegação do Maestro (C1 · Aurora): no computador, uma cápsula de vidro no topo com os grupos como menus: Produção
 * (Hoje, Quadro, Aprovações, Projetos, Agenda), Comercial (Pedidos, Orçamentos, Clientes), Operação (Freelas,
 * Inventário), Dinheiro (Financeiro, direto, por ser um só), Ajustes e, discreta no fim, a Z (decisão do titular,
 * 29/10/2026: a Z não é a primeira aba). O menu do grupo onde a pessoa está mostra o nome da seção ("Quadro"). Só entra
 * o que tem tela de verdade. No celular vira a barra de baixo com o dia a dia (Hoje, Quadro, Aprovações) e "Mais"; a Z
 * fica no topo (src/components/shell.tsx).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ABAS, AJUSTES, BARRA, GRUPOS, MAIS, Z, type Aba, type Grupo } from "@/lib/navegacao";
import { Icone } from "./icones";

function ativa(caminho: string, href: string) {
  return caminho === href || caminho.startsWith(`${href}/`);
}

/**
 * A posição da seção na ordem da cápsula: decide se a tela entra pela direita (frente) ou pela esquerda (volta). Vai no
 * `data-sentido` do link, que a troca de seção lê (src/components/movimento.tsx).
 */
const ordem = (caminho: string) => ABAS.findIndex((a) => ativa(caminho, a.href));
const sentido = (de: string, para: string) => (ordem(para) >= ordem(de) ? "frente" : "volta");
/** Na barra do celular, a ordem é a da barra; seção fora dela conta como "Mais" (a última). */
const naOrdemDaBarra = (caminho: string) => {
  const i = BARRA.findIndex((a) => ativa(caminho, a.href));
  return i < 0 ? BARRA.length - 1 : i;
};
const sentidoNaBarra = (de: string, para: string) => (naOrdemDaBarra(para) >= naOrdemDaBarra(de) ? "frente" : "volta");

/**
 * O caminho que a navegação mostra: o destino acende no clique, antes de a seção chegar (como no Synquei), e volta ao
 * caminho de verdade assim que ele muda.
 */
function useCaminho() {
  const caminho = usePathname();
  const [indo, setIndo] = useState<{ de: string; para: string } | null>(null);
  const visto = indo && indo.de === caminho ? indo.para : caminho;
  return { caminho, visto, ir: (para: string) => setIndo({ de: caminho, para }) };
}

/**
 * Link de seção: o esqueleto já vem pela pré-busca automática; com a intenção (mouse em cima, foco ou toque), a seção
 * inteira, com os dados, para a troca ser imediata. O cache do roteador guarda por pouco tempo (staleTimes em
 * next.config.ts) e qualquer Server Action com revalidatePath o limpa.
 */
function LinkSecao({
  aba,
  caminho,
  visto,
  ir,
  className,
  children,
}: {
  aba: Aba;
  caminho: string;
  visto: string;
  ir: (p: string) => void;
  className: string;
  children: React.ReactNode;
}) {
  const [intencao, setIntencao] = useState(false);
  const querer = () => setIntencao(true);
  const on = ativa(visto, aba.href);
  return (
    <Link
      href={aba.href}
      prefetch={intencao ? true : null}
      data-sentido={sentido(caminho, aba.href)}
      aria-current={on ? "page" : undefined}
      data-aba={aba.icone}
      className={className}
      onPointerEnter={querer}
      onFocus={querer}
      onTouchStart={querer}
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) ir(aba.href);
      }}
    >
      {children}
    </Link>
  );
}

function Item({ aba, caminho, visto, ir, className }: { aba: Aba; caminho: string; visto: string; ir: (p: string) => void; className: string }) {
  return (
    <LinkSecao aba={aba} caminho={caminho} visto={visto} ir={ir} className={className}>
      <Icone nome={aba.icone} size={16} />
      <span>{aba.nome}</span>
    </LinkSecao>
  );
}

/** Um grupo como menu da cápsula: botão (com a seção atual, se for deste grupo) e o painel de vidro com as seções. */
function Menu({
  grupo,
  caminho,
  visto,
  ir,
  aberto,
  abrir,
  fechar,
}: {
  grupo: Grupo;
  caminho: string;
  visto: string;
  ir: (p: string) => void;
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
}) {
  const atual = grupo.abas.find((a) => ativa(visto, a.href));
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
          <Item key={a.href} aba={a} caminho={caminho} visto={visto} ir={ir} className="capsula__opcao" />
        ))}
      </div>
    </div>
  );
}

/** A cápsula (computador). */
export function Capsula() {
  const { caminho, visto, ir } = useCaminho();
  const router = useRouter();
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

  // As seções dos menus fechados não ficam à vista (o Link só pré-busca o que aparece): com a página parada, pede o
  // esqueleto de todas, para nenhuma troca começar do zero.
  useEffect(() => {
    const ocioso = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 600));
    ocioso(() => {
      for (const a of ABAS) router.prefetch(a.href);
    });
  }, [router]);

  // A pílula da seção ativa desliza de um item para o outro (transform com a mola, só CSS; aqui só se mede).
  const pilula = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const nav = raiz.current;
    const p = pilula.current;
    if (!nav || !p) return;
    const pos = () => {
      const alvo = nav.querySelector<HTMLElement>(":scope > .capsula__item[aria-current], :scope > .capsula__menu > .capsula__item[aria-current]");
      if (!alvo) {
        p.style.opacity = "0";
        return;
      }
      const a = alvo.getBoundingClientRect();
      const b = nav.getBoundingClientRect();
      const primeira = !nav.dataset.pilula;
      if (primeira) p.style.transition = "none";
      p.style.opacity = "1";
      p.style.width = `${a.width}px`;
      p.style.transform = `translateX(${a.left - b.left}px)`;
      if (primeira) {
        void p.offsetWidth;
        p.style.transition = "";
        nav.dataset.pilula = "";
      }
    };
    pos();
    const ro = new ResizeObserver(pos);
    ro.observe(nav);
    for (const el of nav.querySelectorAll(":scope > .capsula__item, :scope > .capsula__menu > .capsula__item")) ro.observe(el);
    return () => ro.disconnect();
  }, [visto]);

  return (
    <nav ref={raiz} className="capsula__nav" aria-label="Seções do Maestro">
      <span ref={pilula} className="capsula__pilula" aria-hidden="true" />
      {GRUPOS.map((g) =>
        g.nome === null || g.abas.length === 1 ? (
          g.abas.map((a) => <Item key={a.href} aba={a} caminho={caminho} visto={visto} ir={ir} className="capsula__item" />)
        ) : (
          <Menu
            key={g.nome}
            grupo={g}
            caminho={caminho}
            visto={visto}
            ir={ir}
            aberto={qual === g.nome}
            abrir={() => setAberto({ grupo: g.nome!, caminho })}
            fechar={() => setAberto((x) => (x?.grupo === g.nome ? null : x))}
          />
        ),
      )}
      <Item aba={AJUSTES} caminho={caminho} visto={visto} ir={ir} className="capsula__item capsula__item--icone" />
      <Item aba={Z} caminho={caminho} visto={visto} ir={ir} className="capsula__item capsula__item--icone" />
    </nav>
  );
}

/** A barra de baixo (celular): ícone e nome curto. "Mais" fica marcado nas seções que não estão na barra. */
export function Barra() {
  const { caminho, visto, ir } = useCaminho();
  const naBarra = BARRA.slice(0, -1).some((a) => ativa(visto, a.href));
  return (
    <nav className="barra" aria-label="Seções do Maestro">
      {BARRA.map((a) => {
        const on = a === MAIS ? !naBarra : ativa(visto, a.href);
        // No celular não há "mouse em cima": as abas já vêm inteiras (são quatro), para a troca não mostrar esqueleto.
        return (
          <Link
            key={a.href}
            href={a.href}
            prefetch
            data-sentido={sentidoNaBarra(caminho, a.href)}
            aria-current={on ? "page" : undefined}
            data-aba={a.icone}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) ir(a.href);
            }}
          >
            <Icone nome={a.icone} size={20} />
            <span>{a.curto ?? a.nome}</span>
          </Link>
        );
      })}
    </nav>
  );
}
