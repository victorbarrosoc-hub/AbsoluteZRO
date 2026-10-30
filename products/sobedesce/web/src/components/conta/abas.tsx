import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** O anel da Z, fino, no traço dos ícones do site (o mesmo desenho do app do celular e do de computador). */
export function IconeZ({ className }: { className?: string }) {
  return (
    <svg className={cn("size-[18px] shrink-0", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7.75" />
    </svg>
  );
}

/**
 * A entrada da Z na área logada (titular, 29/10/2026; Plano de Integração §7–8): um anel pequeno no cabeçalho, ao lado
 * das ações. Não é aba nem a tela de entrada (quem entra cai em /conta); abre a Z só quando a pessoa toca. Ao lado dela
 * fica o Set da Absolute ZRO (aba-set.tsx › BotaoSet), que abre a folha dele sem trocar de página.
 */
export function LinkZ({ atual = false }: { atual?: boolean }) {
  return (
    <Link
      href="/z"
      title="Z, a IA da Absolute ZRO"
      aria-label="Z, a IA da Absolute ZRO"
      aria-current={atual ? "page" : undefined}
      className={buttonClasses({ variant: "ghost", size: "sm", className: cn("px-2.5", atual ? "text-ink" : "text-ink-2") })}
    >
      <IconeZ />
    </Link>
  );
}

/** Na página da Z, o caminho de volta para a conta (a área logada de verdade). */
export function VoltarConta() {
  return (
    <nav aria-label="Área logada" className="largura pt-1 sm:pt-2">
      <Link href="/conta" className="toque inline-flex h-9 items-center gap-1 rounded-full pr-3 text-[15px] font-medium text-ink-2 hover:text-ink">
        <ChevronLeft className="size-[18px]" aria-hidden="true" />
        Sua conta
      </Link>
    </nav>
  );
}
