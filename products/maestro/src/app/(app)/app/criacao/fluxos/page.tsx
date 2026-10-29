import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEditarCriacao } from "@/lib/criacao/permissoes";
import { listarFluxos } from "@/lib/criacao/fluxo/servidor";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";
import { NovoFluxo, RestaurarFluxo } from "@/components/criacao/fluxo/novo";
import "../../../../fluxo.css";

export const metadata = { title: "Fluxos" };

const QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
/** "2026-10-29 21:04:05.123+00" (texto do Postgres) → Date. */
function quando(t: string): string | null {
  const d = new Date(t.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? null : QUANDO.format(d).replace(".", "");
}
const itens = (n: number) => (n === 1 ? "1 item" : `${n} itens`);

/** Os fluxos da produtora (plano da Criação §6): cartões grandes, do que mudou por último; a lixeira à parte. */
export default async function Fluxos({ searchParams }: PageProps<"/app/criacao/fluxos">) {
  const sessao = await exigirAcessoNaPagina("/app/criacao/fluxos");
  const sp = await searchParams;
  const lixeira = sp.lixeira === "1";
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [fluxos, naLixeira] = await Promise.all([listarFluxos(ctx, { lixeira }), lixeira ? Promise.resolve([]) : listarFluxos(ctx, { lixeira: true })]);
  const edita = podeEditarCriacao(sessao.papel);

  return (
    <div className="pagina fx-pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          {lixeira ? (
            <>
              Fluxos na <strong>lixeira.</strong>
            </>
          ) : (
            <>
              Ideias em <strong>fluxo.</strong>
            </>
          )}
        </h1>
        {lixeira ? (
          <Link className="glass-btn glass-btn--sm" href="/app/criacao/fluxos">
            <Icone nome="voltar" size={16} /> Fluxos
          </Link>
        ) : edita ? (
          <div className="fx-pagina__acao">
            <NovoFluxo />
          </div>
        ) : null}
      </header>

      {!fluxos.length ? (
        lixeira ? (
          <EstadoVazio icone="lixo" titulo="Lixeira vazia" />
        ) : (
          <EstadoVazio
            icone="grade"
            titulo="Nenhum fluxo ainda"
            apoio={edita ? "Cole imagens, links e notas num canvas e ligue as ideias." : "Quando a equipe criar fluxos, eles aparecem aqui."}
          >
            {edita ? <NovoFluxo /> : null}
          </EstadoVazio>
        )
      ) : (
        <ul className="fx-cartoes" aria-label={lixeira ? "Fluxos na lixeira" : "Fluxos"}>
          {fluxos.map((f) => (
            <li key={f.id}>
              <Link className="fx-cartao" href={`/app/criacao/fluxos/${f.id}`}>
                <span className="fx-cartao__miniatura" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="fx-cartao__titulo">{f.titulo}</span>
                <span className="fx-cartao__apoio">{[itens(f.itens), f.projeto ?? f.card ?? null, quando(f.mudouEm)].filter(Boolean).join(" · ")}</span>
              </Link>
              {lixeira && edita ? <RestaurarFluxo id={f.id} /> : null}
            </li>
          ))}
        </ul>
      )}

      {!lixeira && naLixeira.length ? (
        <Link className="fx-lixeira" href="/app/criacao/fluxos?lixeira=1">
          <Icone nome="lixo" size={15} /> Lixeira · {naLixeira.length}
        </Link>
      ) : null}
    </div>
  );
}
