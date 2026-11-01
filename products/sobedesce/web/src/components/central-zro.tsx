import { LogoZro } from "@/components/conta/zro";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CENTRAL_ZRO } from "@/lib/site";

/**
 * "Use no computador com a Absolute ZRO" (pedido do titular, 01/11/2026): o app de computador é instalado e atualizado
 * só pela central Absolute ZRO. Nada de instalador aqui: os três passos e o botão para a página da central.
 */
export const PASSOS_CENTRAL = ["Baixe a Absolute ZRO", "Entre com a sua conta", "Instale o SOBEDESCE por ela"] as const;

export function CentralZro({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  return (
    <div className={cn("grid content-start gap-5", className)}>
      <div className="flex items-center gap-3">
        <LogoZro className="size-9 text-ink" />
        <h3 className={cn("font-display font-semibold tracking-[-0.02em] text-balance text-ink", compacto ? "text-[17px]" : "text-[22px]")}>
          Use no computador com a Absolute ZRO
        </h3>
      </div>
      <ol className="grid gap-2.5">
        {PASSOS_CENTRAL.map((passo, i) => (
          <li key={passo} className="flex items-center gap-3 text-[15px] text-ink">
            <span className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-ink-2 ring-1 ring-line ring-inset tabular-nums">
              {i + 1}
            </span>
            {passo}
          </li>
        ))}
      </ol>
      <a href={CENTRAL_ZRO} className={buttonClasses({ variant: "primary", size: "md", className: "w-full sm:w-auto sm:justify-self-start" })}>
        Baixar a Absolute ZRO
      </a>
    </div>
  );
}
