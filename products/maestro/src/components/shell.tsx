/**
 * O shell do app: cápsula de vidro no topo (computador) ou topo + barra de baixo (celular), com a logo do Maestro, as
 * seções em grupos, o relógio da luz, a conta e o símbolo da Absolute ZRO pequeno, como assinatura. Componente de servidor: recebe a
 * sessão já conferida pela página.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { estiloDaMarcaPropria, type MarcaPropria } from "@/lib/marca/propria";
import type { Sessao } from "@/lib/auth/sessao";
import { HUB_URL } from "@/lib/site";
import { Icone } from "./icones";
import { MaestroSimbolo, ZroSimbolo } from "./marca";
import { Relogio } from "./ambiente";
import { Barra, Capsula } from "./nav";
import { abasOcultas } from "@/lib/navegacao";
import { SeletorDeTema } from "./tema";
import { SetZro } from "./set-zro";
import { Transicao } from "./movimento";
import { SobedesceVivo } from "./arquivos/sobedesce-vivo";
import { temProduto } from "@/lib/auth/acesso";

export function iniciais(nome: string | null, email: string | null): string {
  const base = (nome || email || "?").trim();
  return (
    base
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function Avatar({ sessao, grande = false }: { sessao: Pick<Sessao, "nome" | "email" | "foto">; grande?: boolean }) {
  return (
    <span className={`avatar${grande ? " avatar--grande" : ""}`} aria-hidden="true">
      {/* A foto vem da conta Absolute ZRO (endereço público, muda a cada foto nova): <img> simples, sem otimizador. */}
      {sessao.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sessao.foto} alt="" referrerPolicy="no-referrer" />
      ) : (
        iniciais(sessao.nome, sessao.email)
      )}
    </span>
  );
}

/** A marca no topo: o gesto do Maestro ou, com a marca própria, o logo (ou o nome) da produtora. */
function MarcaDoTopo({ marca, largura }: { marca: MarcaPropria | null; largura: number }) {
  if (!marca)
    return (
      <>
        <MaestroSimbolo width={largura} />
        <span>Maestro</span>
      </>
    );
  return marca.logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- logo da produtora, bytes do banco pela rota própria
    <img className="marca-propria__logo" src={marca.logo} alt="" />
  ) : (
    <span className="marca-propria__nome">{marca.nome}</span>
  );
}

/** A troca para a área do freela (drizzle/0037): só para quem também é freela ligado em outra produtora. */
function IrParaTrabalhos() {
  return (
    <Link className="topo__z ir-trabalhos" href="/trabalhos" title="Seus trabalhos como freela">
      <Icone nome="freelas" size={18} />
      <span className="sr-only">Seus trabalhos como freela</span>
    </Link>
  );
}

export function Shell({
  sessao,
  demo = false,
  marca = null,
  freela = false,
  children,
}: {
  sessao: Sessao;
  demo?: boolean;
  /** A pessoa também é freela ligada em outra produtora: o atalho para "Seus trabalhos". */
  freela?: boolean;
  /** "Maestro com a sua marca" (src/lib/marca/propria.ts); null = a marca do Maestro. */
  marca?: MarcaPropria | null;
  children: ReactNode;
}) {
  const rotulo = marca ? `${marca.nome}, início` : "Maestro, início";
  const selo = demo ? (
    <Link className="selo selo--demo" href="/app/ajustes#demonstracao" title="Dados de exemplo. Remova em Ajustes.">
      <i aria-hidden="true" />
      <span>Demonstração</span>
    </Link>
  ) : null;
  return (
    <div className="shell" data-marca-propria={marca ? "" : undefined} style={estiloDaMarcaPropria(marca) as CSSProperties | undefined}>
      {/* Computador: a cápsula de vidro no topo (C1 · Aurora): a marca, as seções em menus, o relógio da luz, o tema e a
          conta; o símbolo da Absolute ZRO pequeno, como assinatura. */}
      <header className="capsula">
        <Link className="capsula__marca" href="/app/hoje" aria-label={rotulo}>
          <MarcaDoTopo marca={marca} largura={30} />
        </Link>
        <Capsula ocultas={abasOcultas(sessao.acessos)} />
        <div className="capsula__fim">
          {selo}
          <Relogio />
          {freela ? <IrParaTrabalhos /> : null}
          {/* o Set da Absolute ZRO: quem está online e as conversas (discreto, como a Z) */}
          <SetZro />
          <SeletorDeTema />
          <a className="assinatura" href={HUB_URL} title={marca ? "Powered by Absolute ZRO" : "Absolute ZRO"} target="_blank" rel="noreferrer">
            <ZroSimbolo size={18} />
            <span className="sr-only">{marca ? "Powered by Absolute ZRO" : "Absolute ZRO"}</span>
          </a>
          <Link className="conta" href="/app/ajustes" title={`${sessao.nome ?? sessao.email ?? "Conta"} · ${sessao.orgNome}`}>
            <Avatar sessao={sessao} />
            <span className="sr-only">{sessao.nome ?? sessao.email ?? "Conta"}</span>
          </Link>
        </div>
      </header>
      {/* Celular: a marca e a conta no topo; as seções na barra de baixo. */}
      <header className="topo">
        <Link className="topo__marca" href="/app/hoje" aria-label={rotulo}>
          <MarcaDoTopo marca={marca} largura={36} />
        </Link>
        <div className="topo__fim">
          {selo}
          {/* a Z, discreta (decisão do titular, 29/10/2026: nunca a primeira aba nem aberta sozinha) */}
          <Link className="topo__z" href="/app/z" title="Z" data-sentido="frente">
            <Icone nome="z" size={18} />
            <span className="sr-only">Z</span>
          </Link>
          {freela ? <IrParaTrabalhos /> : null}
          <SetZro />
          <SeletorDeTema />
          <Link className="conta" href="/app/ajustes" title={sessao.orgNome}>
            <Avatar sessao={sessao} />
            <span className="sr-only">{sessao.nome ?? sessao.email ?? "Conta"}</span>
          </Link>
        </div>
      </header>
      <main id="conteudo" className="conteudo">
        <Transicao>{children}</Transicao>
        {/* Arquivos: o SOBEDESCE embutido nasce na primeira visita e fica vivo (o envio segue em outra seção). */}
        {temProduto(sessao, "sobedesce") ? <SobedesceVivo /> : null}
        {marca ? (
          <p className="powered">
            <ZroSimbolo size={14} /> Powered by Absolute ZRO
          </p>
        ) : null}
      </main>
      <Barra />
    </div>
  );
}

/** Botão Sair (POST com a origem conferida no servidor). */
export function BotaoSair({ className = "glass-btn glass-btn--sm" }: { className?: string }) {
  return (
    <form method="post" action="/api/zro/sair">
      <button type="submit" className={className}>
        <Icone nome="sair" size={16} /> Sair
      </button>
    </form>
  );
}
