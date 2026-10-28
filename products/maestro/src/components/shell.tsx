/**
 * O shell do app: barra lateral em vidro (computador) ou topo + barra de baixo (celular), com a logo do Maestro, as
 * seções em grupos, a conta e o símbolo da Absolute ZRO pequeno, como assinatura. Componente de servidor: recebe a
 * sessão já conferida pela página.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Sessao } from "@/lib/auth/sessao";
import { HUB_URL } from "@/lib/site";
import { Icone } from "./icones";
import { MaestroSimbolo, ZroSimbolo } from "./marca";
import { Barra, Lateral } from "./nav";
import { SeletorDeTema } from "./tema";

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

export function Shell({ sessao, demo = false, children }: { sessao: Sessao; demo?: boolean; children: ReactNode }) {
  const selo = demo ? (
    <Link className="selo selo--demo" href="/app/ajustes#demonstracao" title="Dados de exemplo. Remova em Ajustes.">
      <i aria-hidden="true" />
      Demonstração
    </Link>
  ) : null;
  return (
    <div className="shell">
      {/* Computador: a barra lateral em vidro, com a marca, os grupos, a conta e a assinatura Absolute ZRO. */}
      <aside className="lado">
        <Link className="lado__marca" href="/app/z" aria-label="Maestro, início">
          <MaestroSimbolo width={40} />
          <span>Maestro</span>
        </Link>
        <Lateral />
        <div className="lado__pe">
          {selo}
          <Link className="conta conta--inteira" href="/app/ajustes" title={sessao.orgNome}>
            <Avatar sessao={sessao} />
            <span className="conta__miolo">
              <span className="conta__nome">{sessao.nome ?? sessao.email ?? "Conta"}</span>
              <span className="conta__org">{sessao.orgNome}</span>
            </span>
          </Link>
          <div className="lado__ferramentas">
            <SeletorDeTema />
            <a className="assinatura" href={HUB_URL} title="Absolute ZRO" target="_blank" rel="noreferrer">
              <ZroSimbolo size={20} />
              <span className="sr-only">Absolute ZRO</span>
            </a>
          </div>
        </div>
      </aside>
      {/* Celular: a marca e a conta no topo; as seções na barra de baixo. */}
      <header className="topo">
        <Link className="topo__marca" href="/app/z" aria-label="Maestro, início">
          <MaestroSimbolo width={36} />
          <span>Maestro</span>
        </Link>
        <div className="topo__fim">
          {selo}
          <SeletorDeTema />
          <Link className="conta" href="/app/ajustes" title={sessao.orgNome}>
            <Avatar sessao={sessao} />
            <span className="sr-only">{sessao.nome ?? sessao.email ?? "Conta"}</span>
          </Link>
        </div>
      </header>
      <main id="conteudo" className="conteudo">
        {children}
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
