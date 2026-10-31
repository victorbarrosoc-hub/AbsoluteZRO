/**
 * Ajustes da conta: o modo do Drive numa linha ("Acesso total" ou "Arquivos escolhidos"), com o que muda recolhido.
 * Os mesmos textos estão no app do celular (public/app/lib/modo-drive.js).
 */
import { BotaoGoogle } from "@/components/conta/google";
import type { ModoDrive } from "@/lib/google/config";

export const NOME_MODO: Record<ModoDrive, string> = { total: "Acesso total", arquivos: "Arquivos escolhidos" };

export function LinhaModoDrive({ acessoTotal, reconectarParaTotal = false }: { acessoTotal: boolean; reconectarParaTotal?: boolean }) {
  const modo: ModoDrive = acessoTotal ? "total" : "arquivos";
  return (
    <div className="rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-line ring-inset" data-modo-drive={modo}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[14px] whitespace-nowrap text-ink-2">Acesso ao Drive</span>
        <span className="inline-flex shrink-0 items-center gap-2 text-[15px] font-medium whitespace-nowrap">
          <span aria-hidden className={`size-1.5 rounded-full ${acessoTotal ? "bg-ok" : "bg-ink/35"}`} />
          {NOME_MODO[modo]}
        </span>
      </div>
      {reconectarParaTotal ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ink">Reconecte para usar o Drive inteiro.</p>
          <BotaoGoogle modo="vincular" variant="primary" size="sm">
            Reconectar
          </BotaoGoogle>
        </div>
      ) : null}
      <details className="group mt-1">
        <summary className="cursor-pointer list-none text-[13px] text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">O que muda</span>
          <span className="hidden group-open:inline">Fechar</span>
        </summary>
        {acessoTotal ? (
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
