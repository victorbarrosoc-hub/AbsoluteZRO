/**
 * Ficha da pessoa no admin: o Acesso total ao Drive (escopo `drive`) e o contador de vagas, só para ler. Ligar e
 * desligar ficam no console da Absolute ZRO (lib/zro/console-drive.ts). Cada conta Google que recebe o `drive` gasta
 * uma vaga do projeto Google para sempre (lib/google/vagas.ts).
 */
import { cn } from "@/lib/cn";

/** Onde o Acesso total é decidido (titular, 31/10/2026): Console da Absolute ZRO › Apps › SOBEDESCE. */
export const CONSOLE_DRIVE = "https://absolutezro.com/admin/apps/sobedesce";

export type VagasTela = { usadas: number; limite: number; liberadasSemUso: number; livres: number };

/** "12 de 90 vagas": a barra enche com as usadas e, mais clara, as liberadas que ainda não conectaram. */
export function ContadorVagas({ v, className }: { v: VagasTela; className?: string }) {
  const pct = (n: number) => `${Math.min(100, (n / Math.max(1, v.limite)) * 100)}%`;
  const cheio = v.livres <= 0;
  return (
    <div
      className={cn("grid gap-2 rounded-2xl bg-surface-2 px-4 py-3.5 ring-1 ring-line ring-inset", className)}
      title={`Vaga usada: conta Google que já recebeu o Drive inteiro. Não volta, nem se desconectar. O Google aceita 100 na vida do projeto; o limite aqui é ${v.limite}.`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] text-ink-2">Vagas de acesso total</p>
        <p className="font-display text-[22px] leading-none font-bold tracking-[-0.02em] tabular-nums">
          {v.usadas}
          <span className="text-[15px] font-medium text-ink-3"> / {v.limite}</span>
        </p>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink/25" style={{ width: pct(v.usadas + v.liberadasSemUso) }} />
        <span className={cn("absolute inset-y-0 left-0 rounded-full", cheio ? "bg-warn" : "bg-ink")} style={{ width: pct(v.usadas) }} />
      </div>
      <p className={cn("text-[12px]", cheio ? "font-medium text-warn-text" : "text-ink-3")}>
        {cheio ? "Sem vaga para liberar" : `${v.livres} para liberar`}
        {v.liberadasSemUso ? ` · ${v.liberadasSemUso} liberada${v.liberadasSemUso > 1 ? "s" : ""} sem uso` : ""}
      </p>
    </div>
  );
}

/** O Acesso total da pessoa, só para ler: quem liga e desliga é o console da Absolute ZRO (lib/zro/console-drive.ts). */
export function EstadoAcessoTotal({ ligado }: { ligado: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="grid gap-0.5">
        <span className="inline-flex items-center gap-2 text-[15px] font-medium">
          <span aria-hidden className={cn("size-2 rounded-full", ligado ? "bg-ok" : "bg-ink/30")} />
          {ligado ? "Acesso total" : "Arquivos escolhidos"}
        </span>
        <span className="text-[13px] text-ink-3">{ligado ? "O Drive inteiro, como sempre foi." : "Só o que passou pelo SOBEDESCE e o que a pessoa escolher."}</span>
      </span>
      <a href={CONSOLE_DRIVE} className="text-[13px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
        Muda no console da Absolute ZRO
      </a>
    </div>
  );
}
