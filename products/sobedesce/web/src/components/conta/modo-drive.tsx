/**
 * Ajustes da conta: o modo do Drive numa linha ("Acesso total" ou "Arquivos escolhidos"), com o que muda recolhido.
 * Os mesmos textos estão no app do celular (public/app/lib/modo-drive.js).
 */
import { buttonClasses } from "@/components/ui/button";
import type { ModoDrive } from "@/lib/google/config";

export const NOME_MODO: Record<ModoDrive, string> = { total: "Acesso total", arquivos: "Arquivos escolhidos" };

export function LinhaModoDrive({ inteiro, ativar = null }: { inteiro: boolean; ativar?: string | null }) {
  // O modo de verdade (o que o Google deu a algum Drive da conta), não a permissão: liberado sem o Drive inteiro
  // conectado mostra "Arquivos escolhidos" com o "Ativar Drive inteiro" (08/11/2026).
  const modo: ModoDrive = inteiro ? "total" : "arquivos";
  return (
    <div className="rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-line ring-inset" data-modo-drive={modo}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[14px] whitespace-nowrap text-ink-2">Acesso ao Drive</span>
        <span className="inline-flex shrink-0 items-center gap-2 text-[15px] font-medium whitespace-nowrap">
          <span aria-hidden className={`size-1.5 rounded-full ${inteiro ? "bg-ok" : "bg-ink/35"}`} />
          {NOME_MODO[modo]}
        </span>
      </div>
      {ativar ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ink">O Drive inteiro está liberado para você.</p>
          <a href={ativar} className={buttonClasses({ variant: "primary", size: "sm" })}>
            Ativar Drive inteiro
          </a>
        </div>
      ) : null}
      <details className="group mt-1">
        <summary className="cursor-pointer list-none text-[13px] text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">O que muda</span>
          <span className="hidden group-open:inline">Fechar</span>
        </summary>
        {inteiro ? (
          <p className="mt-2 text-[13px] leading-relaxed text-pretty text-ink-2">O SOBEDESCE vê o Drive inteiro: navegar, comparar e fazer backup de qualquer pasta.</p>
        ) : (
          <ul className="mt-2 grid list-disc gap-1 pl-4 text-[13px] leading-relaxed text-pretty text-ink-2">
            <li>O SOBEDESCE vê o que você enviou ou criou por ele e o que você escolher em Escolher do Drive. Escolheu uma vez, fica liberado.</li>
            <li>Navegar, comparar e fazer backup ficam completos nas pastas criadas pelo SOBEDESCE. Nas outras, pedem acesso total.</li>
            <li>Arquivos do SOBEDESCE antigo também precisam ser escolhidos uma vez.</li>
          </ul>
        )}
      </details>
    </div>
  );
}
