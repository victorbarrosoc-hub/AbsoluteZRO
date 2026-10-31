import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { type ItemLixeira } from "@/lib/criacao/lixeira";
import { podeApagarDeVezCriacao, podeEditarCriacao } from "@/lib/criacao/permissoes";
import { type FluxoLista, listarFluxos } from "@/lib/criacao/fluxo/servidor";
import { AbasCriacao } from "@/components/criacao/abas";
import { CartaoApagavel, CartaoNaLixeira, ListaLixeira } from "@/components/criacao/lixeira";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";
import { NovoFluxo } from "@/components/criacao/fluxo/novo";
import "../../../../fluxo.css";
import "../../../../lixeira.css";

export const metadata = { title: "Fluxos" };

const QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
/** "2026-10-29 21:04:05.123+00" (texto do Postgres) → Date. */
function quando(t: string): string | null {
  const d = new Date(t.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? null : QUANDO.format(d).replace(".", "");
}
const itens = (n: number) => (n === 1 ? "1 item" : `${n} itens`);
const itemDe = (f: FluxoLista): ItemLixeira => ({
  tipo: "fluxo",
  id: f.id,
  titulo: f.titulo,
  card: f.cardId ? (f.card ?? "Card") : null,
  links: f.linksVivos,
  versoes: 0,
});
const um = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Criação → Fluxos (plano da Criação §3 e §6): a aba irmã de Roteiros, com o mesmo título e o mesmo seletor; os fluxos
 * da produtora em cartões grandes, do que mudou por último; a lixeira à parte. Apagar igual aos Roteiros
 * (`components/criacao/lixeira.tsx`: deslizar, segurar, "•••", Desfazer; na lixeira, Restaurar e Apagar de vez).
 */
export default async function Fluxos({ searchParams }: PageProps<"/app/criacao/fluxos">) {
  const sessao = await exigirAcessoNaPagina("/app/criacao/fluxos");
  const sp = await searchParams;
  const lixeira = sp.lixeira === "1";
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [fluxos, naLixeira] = await Promise.all([listarFluxos(ctx, { lixeira }), lixeira ? Promise.resolve([]) : listarFluxos(ctx, { lixeira: true })]);
  const edita = podeEditarCriacao(sessao.papel);
  const deVez = podeApagarDeVezCriacao(sessao.papel);
  const apagou = naLixeira.find((f) => f.id === um(sp.apagou));

  const cartao = (f: FluxoLista) => (
    <Link className="fx-cartao" href={`/app/criacao/fluxos/${f.id}`}>
      <span className="fx-cartao__miniatura" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="fx-cartao__titulo">{f.titulo}</span>
      <span className="fx-cartao__apoio">{[itens(f.itens), f.projeto ?? f.card ?? null, quando(f.mudouEm)].filter(Boolean).join(" · ")}</span>
    </Link>
  );

  return (
    <ListaLixeira key={lixeira ? "lixeira" : "lista"} apagouAgora={apagou && edita ? itemDe(apagou) : null}>
      <div className="pagina pagina--larga cr-pagina fx-pagina">
        <header className="pagina__cabeca pagina__cabeca--acao">
          {lixeira ? (
            <h1 className="atitle">
              Fluxos na <strong>lixeira.</strong>
            </h1>
          ) : (
            <div>
              <h1 className="atitle">
                <strong>Criação.</strong>
              </h1>
              <AbasCriacao atual="fluxos" />
            </div>
          )}
          {lixeira ? (
            <Link className="glass-btn glass-btn--sm" href="/app/criacao/fluxos">
              <Icone nome="voltar" size={16} /> Fluxos
            </Link>
          ) : edita && fluxos.length ? (
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
              icone="fluxo"
              titulo="Nenhum fluxo ainda."
              apoio={edita ? "Cole imagens, links e notas num canvas e ligue as ideias." : "Quando a equipe criar fluxos, eles aparecem aqui."}
            >
              {edita ? <NovoFluxo /> : null}
            </EstadoVazio>
          )
        ) : (
          <ul className="fx-cartoes" aria-label={lixeira ? "Fluxos na lixeira" : "Fluxos"}>
            {fluxos.map((f) =>
              lixeira ? (
                <CartaoNaLixeira key={f.id} item={itemDe(f)} podeRestaurar={edita} podeDeVez={deVez}>
                  {cartao(f)}
                </CartaoNaLixeira>
              ) : (
                <CartaoApagavel key={f.id} item={itemDe(f)} href={`/app/criacao/fluxos/${f.id}`} podeApagar={edita} className="lx-cartao--fluxo">
                  {cartao(f)}
                </CartaoApagavel>
              ),
            )}
          </ul>
        )}

        {!lixeira && naLixeira.length ? (
          <Link className="lx-entrada" href="/app/criacao/fluxos?lixeira=1">
            <Icone nome="lixo" size={15} /> Lixeira · {naLixeira.length}
          </Link>
        ) : null}
      </div>
    </ListaLixeira>
  );
}
