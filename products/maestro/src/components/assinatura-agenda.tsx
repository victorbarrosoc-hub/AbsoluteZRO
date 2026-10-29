"use client";
/**
 * O endereço secreto da agenda (.ics): gerar (aparece uma vez, com copiar e os passos de cada aplicativo), trocar e
 * desligar. O banco guarda só o sha256; perdeu o endereço, gera outro (o antigo para na hora).
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { gerarAssinaturaAcao, revogarAssinaturaAcao, type EstadoAgenda } from "@/app/(app)/app/ajustes/agenda/acoes";
import { Icone } from "./icones";

function Botao({ rotulo, classe }: { rotulo: string; classe: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending}>
      {pending ? "…" : rotulo}
    </button>
  );
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="glass-btn glass-btn--sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          setOk(false);
        }
      }}
    >
      <Icone nome={ok ? "check" : "copiar"} size={15} /> {ok ? "Copiado" : "Copiar"}
    </button>
  );
}

export function AssinaturaAgenda({ ativa }: { ativa: boolean }) {
  const [gerado, gerar] = useActionState<EstadoAgenda, FormData>(gerarAssinaturaAcao, undefined);
  const [revogado, revogar] = useActionState<EstadoAgenda, FormData>(revogarAssinaturaAcao, undefined);
  // O último que aconteceu manda: gerou depois de desligar mostra o endereço; desligou depois de gerar, o aviso.
  const desligou = (revogado?.em ?? 0) > (gerado?.em ?? 0);
  const url = desligou ? undefined : gerado?.url;
  const webcal = url?.replace(/^https?:/, "webcal:");
  return (
    <div className="assinatura">
      {url ? (
        <div className="assinatura__url" role="status">
          <p className="sutil">Copie agora: por segurança, este endereço não aparece de novo.</p>
          <code data-testid="endereco-agenda">{url}</code>
          <div className="acoes">
            <Copiar texto={url} />
            <a className="glass-btn glass-btn--sm glass-btn--ink" href={webcal}>
              <Icone nome="agenda" size={15} /> Abrir no calendário
            </a>
          </div>
        </div>
      ) : null}
      <div className="acoes">
        <form action={gerar}>
          <Botao
            rotulo={(ativa && !desligou) || url ? "Trocar endereço" : "Gerar endereço"}
            classe={(ativa && !desligou) || url ? "glass-btn" : "glass-btn glass-btn--ink"}
          />
        </form>
        {(ativa && !desligou) || url ? (
          <form action={revogar}>
            <Botao rotulo="Desligar" classe="q-perigo" />
          </form>
        ) : null}
        <a className="glass-btn" href="/api/agenda/minha" download>
          <Icone nome="baixar" size={16} /> Baixar .ics
        </a>
      </div>
      {gerado?.mensagem || revogado?.mensagem ? (
        <p className="erro" role="alert">
          {gerado?.mensagem ?? revogado?.mensagem}
        </p>
      ) : null}
      {revogado?.aviso && desligou ? (
        <p className="aviso-ok" role="status">
          <Icone nome="check" size={15} /> {revogado.aviso}
        </p>
      ) : null}
    </div>
  );
}
