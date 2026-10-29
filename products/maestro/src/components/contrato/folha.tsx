/**
 * A folha do contrato (papel branco, A4 na impressão): o texto preenchido e, depois do aceite, o registro (quem, quando,
 * documento, hash). O HTML vem de `desenharContrato` (tudo escapado; sem script nem atributo vindo do texto), gravado
 * no aceite. Sem estado: serve à equipe (/app/contratos) e ao cliente (/o).
 */
import { AVISO_ACEITE, formatarDocumento } from "@/lib/contrato/modelo";
import { Icone } from "@/components/icones";

export type RegistroDoAceite = {
  nome: string;
  documento?: string | null;
  endereco?: string | null;
  em: string;
  hash: string;
  /** null = não conferido nesta tela (o cliente vê o hash; a equipe vê a conferência). */
  conferido?: boolean | null;
  navegador?: string | null;
  ipRegistrado?: boolean;
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

export function FolhaContrato({ html, registro, rotulo = "Contrato" }: { html: string; registro?: RegistroDoAceite | null; rotulo?: string }) {
  return (
    <article className="ct-folha ct-folha--papel imprimivel" aria-label={rotulo}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {registro ? (
        <section className="ct-registro" aria-label="Registro do aceite">
          <h2>Registro do aceite eletrônico</h2>
          <dl>
            <dt>Aceito por</dt>
            <dd>{registro.nome}</dd>
            {registro.documento ? (
              <>
                <dt>CPF/CNPJ</dt>
                <dd className="num">{formatarDocumento(registro.documento)}</dd>
              </>
            ) : null}
            {registro.endereco ? (
              <>
                <dt>Endereço</dt>
                <dd>{registro.endereco}</dd>
              </>
            ) : null}
            <dt>Data e hora</dt>
            <dd>{quando(registro.em)} (horário de Brasília)</dd>
            {registro.ipRegistrado != null ? (
              <>
                <dt>Origem</dt>
                <dd>{registro.ipRegistrado ? "IP registrado como hash" : "sem IP"}</dd>
              </>
            ) : null}
            {registro.navegador ? (
              <>
                <dt>Navegador</dt>
                <dd className="ct-registro__ua">{registro.navegador}</dd>
              </>
            ) : null}
            <dt>Integridade (SHA-256)</dt>
            <dd className="ct-registro__hash num">{registro.hash}</dd>
          </dl>
          {registro.conferido != null ? (
            <p className={registro.conferido ? "aviso-ok" : "erro"} role="status">
              <Icone nome={registro.conferido ? "check" : "alerta"} size={16} />{" "}
              {registro.conferido ? "Texto conferido: o hash bate com o que foi aceito." : "O hash não bate com o texto gravado."}
            </p>
          ) : null}
          <p className="ct-registro__nota">{AVISO_ACEITE}</p>
        </section>
      ) : null}
    </article>
  );
}
