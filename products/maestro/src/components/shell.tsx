/**
 * O shell do app: cabeçalho com a logo do Maestro, as abas, a conta e o símbolo da Absolute ZRO pequeno, como
 * assinatura. Componente de servidor: recebe a sessão já conferida pela página.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Sessao } from "@/lib/auth/sessao";
import { HUB_URL } from "@/lib/site";
import { Icone } from "./icones";
import { MaestroSimbolo, ZroSimbolo } from "./marca";
import { Abas } from "./nav";
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
  return (
    <div className="shell">
      <header className="topo">
        <Link className="topo__marca" href="/app/z" aria-label="Maestro, início">
          <MaestroSimbolo width={44} />
          <span>Maestro</span>
        </Link>
        <Abas />
        <div className="topo__fim">
          {demo ? (
            <Link className="selo selo--aviso selo--demo" href="/app/ajustes#demonstracao" title="Dados de exemplo. Remova em Ajustes.">
              <i aria-hidden="true" />
              Demonstração
            </Link>
          ) : null}
          <Link className="conta" href="/app/ajustes" title={sessao.orgNome}>
            <span className="conta__nome">{sessao.nome ?? sessao.email ?? "Conta"}</span>
            <Avatar sessao={sessao} />
          </Link>
          <SeletorDeTema />
          <a className="assinatura" href={HUB_URL} title="Absolute ZRO" target="_blank" rel="noreferrer">
            <ZroSimbolo size={20} />
            <span className="sr-only">Absolute ZRO</span>
          </a>
        </div>
      </header>
      <main id="conteudo" className="conteudo">
        {children}
      </main>
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
