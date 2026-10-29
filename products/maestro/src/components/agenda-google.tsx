"use client";
/**
 * Ajustes → Agenda → Google Agenda (ADR 0026 do HUB): ligar o envio, escolher o que vai e "Sincronizar agora". A
 * conexão em si é da conta Absolute ZRO (a página Conexões); aqui só a escolha desta pessoa no Maestro.
 */
import { useActionState } from "react";
import { salvarGoogleAcao, sincronizarAgoraAcao, type EstadoGoogleForm } from "@/app/(app)/app/ajustes/agenda/acoes";
import { TIPOS_GOOGLE } from "@/lib/agenda/tipos-google";
import { Icone } from "./icones";

export function AgendaGoogle({ ligado, tipos }: { ligado: boolean; tipos: string[] }) {
  const [salvo, salvar, salvando] = useActionState<EstadoGoogleForm, FormData>(salvarGoogleAcao, undefined);
  const [sinc, sincronizar, sincronizando] = useActionState<EstadoGoogleForm, FormData>(sincronizarAgoraAcao, undefined);
  const ultimo = (sinc?.em ?? 0) > (salvo?.em ?? 0) ? sinc : salvo;
  return (
    <div className="agenda-google">
      <form action={salvar} className="agenda-google__form" id="agenda-google-salvar">
        <label className="agenda-google__ligar">
          <span>
            <strong>Enviar para o Google</strong>
            <span className="sutil">Diárias, entregas e prazos que você vê.</span>
          </span>
          <input type="checkbox" className="ag-switch" name="ligado" defaultChecked={ligado} />
        </label>
        <fieldset className="agenda-google__tipos">
          <legend className="sutil">O que vai</legend>
          {TIPOS_GOOGLE.map((t) => (
            <label key={t.k} className="agenda-google__tipo">
              <input type="checkbox" name="tipo" value={t.k} defaultChecked={tipos.includes(t.k)} />
              <span>{t.nome}</span>
            </label>
          ))}
        </fieldset>
      </form>
      <div className="acoes">
        <button type="submit" form="agenda-google-salvar" className="glass-btn glass-btn--ink" disabled={salvando} aria-busy={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {ligado ? (
          <form action={sincronizar}>
            <button type="submit" className="glass-btn" disabled={sincronizando} aria-busy={sincronizando}>
              {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
            </button>
          </form>
        ) : null}
      </div>
      {ultimo?.mensagem ? (
        <p className="erro" role="alert">
          {ultimo.mensagem}
        </p>
      ) : ultimo?.aviso ? (
        <p className="sutil" role="status">
          <Icone nome="check" size={14} /> {ultimo.aviso}
        </p>
      ) : null}
    </div>
  );
}
