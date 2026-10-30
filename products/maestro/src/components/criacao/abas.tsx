import Link from "next/link";

/**
 * O seletor Roteiros · Fluxos da Criação (plano da Criação §3): duas rotas irmãs, `/app/criacao` (roteiros) e
 * `/app/criacao/fluxos`, com o mesmo título, para a Criação na navegação levar às duas sem entrada repetida.
 */
export function AbasCriacao({ atual }: { atual: "roteiros" | "fluxos" }) {
  return (
    <nav className="q-segmentos cr-abas" aria-label="Criação">
      <Link href="/app/criacao" aria-current={atual === "roteiros" ? "page" : undefined}>
        Roteiros
      </Link>
      <Link href="/app/criacao/fluxos" aria-current={atual === "fluxos" ? "page" : undefined}>
        Fluxos
      </Link>
    </nav>
  );
}
