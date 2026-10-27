import Link from "next/link";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

/** O anel da Z, fino, no traço dos ícones do site (o mesmo desenho da aba Z no app do celular e no de computador). */
export function IconeZ({ className }: { className?: string }) {
  return (
    <svg className={cn("size-[18px] shrink-0", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7.75" />
    </svg>
  );
}

const ABAS = [
  { id: "z", href: "/z", rotulo: "Z", titulo: "A Z, a IA da Absolute ZRO", Icone: IconeZ },
  { id: "conta", href: "/conta", rotulo: "Conta", titulo: "Sua conta", Icone: UserRound },
] as const;

/**
 * As abas da área logada (pedido do titular, 27/10/2026): a Z é a primeira e a tela de entrada; a conta vem ao lado.
 * Controle segmentado, como os do iOS: uma pílula só, a aba aberta em destaque.
 */
export function AbasConta({ atual }: { atual: "z" | "conta" }) {
  return (
    <nav aria-label="Área logada" className="flex justify-center px-5 pt-1 sm:pt-2">
      <div className="inline-flex gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-line">
        {ABAS.map(({ id, href, rotulo, titulo, Icone }) => {
          const aqui = id === atual;
          return (
            <Link
              key={id}
              href={href}
              title={titulo}
              aria-current={aqui ? "page" : undefined}
              className={cn(
                "toque inline-flex h-9 min-w-[88px] items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors",
                aqui ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-ink-2 hover:text-ink",
              )}
            >
              <Icone className="size-[17px]" />
              {rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
