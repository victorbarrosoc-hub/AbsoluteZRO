"use client";
/**
 * Ficha da pessoa no admin: o botão "Acesso total" ao Drive (escopo `drive`), com confirmação curta. Cada conta Google
 * que recebe o `drive` gasta uma vaga do projeto Google para sempre (lib/google/vagas.ts).
 */
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { acaoAcessoTotal, type EstadoForm } from "@/app/(conta)/acoes";

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

export function BotaoAcessoTotal({
  usuarioId,
  ligado,
  jaUsouVaga,
  vagas,
  confirmarDeInicio = false,
}: {
  usuarioId: string;
  ligado: boolean;
  /** Uma conta Google desta pessoa já recebeu o `drive`: ligar de novo não gasta outra vaga. */
  jaUsouVaga: boolean;
  vagas: VagasTela;
  /** Só para as capturas: abre já na confirmação. */
  confirmarDeInicio?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(confirmarDeInicio);
  const [estado, enviar, pendente] = useActionState<EstadoForm, FormData>(acaoAcessoTotal, null);
  const semVaga = !ligado && !jaUsouVaga && vagas.livres <= 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="grid gap-0.5">
          <span className="inline-flex items-center gap-2 text-[15px] font-medium">
            <span aria-hidden className={cn("size-2 rounded-full", ligado ? "bg-ok" : "bg-ink/30")} />
            {ligado ? "Acesso total" : "Arquivos escolhidos"}
          </span>
          <span className="text-[13px] text-ink-3">{ligado ? "O Drive inteiro, como sempre foi." : "Só o que passou pelo SOBEDESCE e o que a pessoa escolher."}</span>
        </span>
        {!confirmando ? (
          <Button
            variant={ligado ? "secondary" : "primary"}
            size="sm"
            disabled={semVaga}
            aria-pressed={ligado}
            onClick={() => setConfirmando(true)}
            title={semVaga ? `As ${vagas.limite} vagas já estão ocupadas.` : undefined}
          >
            {ligado ? "Desligar acesso total" : "Acesso total"}
          </Button>
        ) : null}
      </div>

      {confirmando ? (
        <form
          action={(fd) => {
            enviar(fd);
            setConfirmando(false);
          }}
          className="grid gap-3 rounded-xl bg-surface px-4 py-3.5 ring-1 ring-line sm:flex sm:items-center sm:justify-between"
          role="group"
          aria-label="Confirmar"
        >
          <input type="hidden" name="usuarioId" value={usuarioId} />
          <input type="hidden" name="ligar" value={ligado ? "0" : "1"} />
          <p className="text-[14px] leading-relaxed text-pretty text-ink-2">
            {ligado ? (
              <>
                <strong className="font-semibold text-ink">Desligar?</strong> A vaga não volta. O Drive dela pede para reconectar, já com os arquivos escolhidos.
              </>
            ) : jaUsouVaga ? (
              <>
                <strong className="font-semibold text-ink">Ligar de novo?</strong> Esta pessoa já usou a vaga dela: não gasta outra.
              </>
            ) : (
              <>
                <strong className="font-semibold text-ink">
                  Usar 1 das {vagas.livres} vagas que sobram?
                </strong>{" "}
                Vaga usada não volta, nem se desligar depois.
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => setConfirmando(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" variant={ligado ? "danger" : "primary"} size="sm" className="flex-1 sm:flex-none" disabled={pendente}>
              {pendente ? "Salvando…" : ligado ? "Desligar" : "Liberar"}
            </Button>
          </div>
        </form>
      ) : null}

      {semVaga ? <p className="text-[13px] font-medium text-warn-text">As {vagas.limite} vagas já estão ocupadas.</p> : null}
      {estado?.erro ? (
        <p role="alert" className="text-[13px] font-medium text-err-text">
          {estado.erro}
        </p>
      ) : estado?.ok ? (
        <p role="status" className="text-[13px] text-ink-2">
          {estado.ok}
        </p>
      ) : null}
    </div>
  );
}
