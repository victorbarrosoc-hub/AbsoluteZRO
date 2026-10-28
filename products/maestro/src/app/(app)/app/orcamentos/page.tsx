import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarOrcamentos } from "@/lib/orcamento/orcamentos";
import { avisoDeValidade, nomeStatus, STATUS_ORCAMENTO } from "@/lib/orcamento/motor";
import { brl, dataCurta, hojeBr } from "@/lib/dinheiro";
import { podeEscrever } from "@/lib/papeis";
import { Busca } from "@/components/busca";
import { Pilulas } from "@/components/crm";
import { Icone } from "@/components/icones";
import { Cifra, Cifras, SeloStatus } from "@/components/painel";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Orçamentos" };

/** Orçamentos: a versão mais recente de cada número, com total, validade e status. */
export default async function Orcamentos({ searchParams }: PageProps<"/app/orcamentos">) {
  const sessao = await exigirAcessoNaPagina("/app/orcamentos");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" && STATUS_ORCAMENTO.some((s) => s.k === sp.status) ? sp.status : "todos";
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const hoje = hojeBr();
  const todos = await listarOrcamentos(ctx, {}, hoje);
  const lista = todos.filter(
    (o) => (status === "todos" || o.efetivo === status) && (!q || `${o.titulo} ${o.numero} ${o.cliente ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  const escreve = podeEscrever(sessao.papel);
  const abertos = todos.filter((o) => o.efetivo === "enviado");
  const aprovados = todos.filter((o) => o.efetivo === "aprovado");
  const decididos = todos.filter((o) => o.efetivo === "aprovado" || o.efetivo === "recusado");
  const href = (s: string) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (s !== "todos") u.set("status", s);
    const t = u.toString();
    return t ? `/app/orcamentos?${t}` : "/app/orcamentos";
  };

  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Seus <strong>orçamentos.</strong>
        </h1>
        {escreve ? (
          <Link className="glass-btn glass-btn--ink" href="/app/orcamentos/novo">
            <Icone nome="mais" size={18} /> Novo orçamento
          </Link>
        ) : null}
      </header>

      {!todos.length ? (
        <EstadoVazio
          icone="orcamento"
          titulo="Nenhum orçamento ainda"
          apoio="Monte com a tabela de preços, mande o timbrado e aprove: vira projeto e cobrança."
        >
          {escreve ? (
            <div className="vazio__acoes">
              <Link className="glass-btn glass-btn--ink" href="/app/orcamentos/novo">
                <Icone nome="mais" size={18} /> Novo orçamento
              </Link>
              <Link className="glass-btn" href="/app/ajustes/precos">
                Tabela de preços
              </Link>
            </div>
          ) : null}
        </EstadoVazio>
      ) : (
        <>
          <Cifras>
            <Cifra rotulo="Em negociação" valor={brl(abertos.reduce((s, o) => s + o.totais.total, 0))} apoio={`${abertos.length} enviados`} />
            <Cifra rotulo="Aprovados" valor={brl(aprovados.reduce((s, o) => s + o.totais.total, 0))} apoio={`${aprovados.length} orçamentos`} tom="ok" />
            <Cifra
              rotulo="Taxa de aprovação"
              valor={decididos.length ? `${Math.round((aprovados.length / decididos.length) * 100)}%` : "—"}
              apoio={`${decididos.length} decididos`}
            />
          </Cifras>
          <div className="filtros">
            <Busca placeholder="Buscar título, número ou cliente" />
            <Pilulas
              ativo={status}
              itens={[{ valor: "todos", nome: "Todos", href: href("todos") }, ...STATUS_ORCAMENTO.map((s) => ({ valor: s.k, nome: s.nome, href: href(s.k) }))]}
            />
          </div>
          {lista.length ? (
            <ul className="lista" aria-label="Orçamentos">
              {lista.map((o) => {
                const v = avisoDeValidade(o.validade, hoje, o.status);
                return (
                  <li key={o.id}>
                    <Link className="item" href={`/app/orcamentos/${o.id}`}>
                      <span className="codigo">{o.numero}</span>
                      <span className="item__miolo">
                        <span className="item__nome">{o.titulo}</span>
                        <span className="item__apoio">
                          {[o.cliente ?? "Sem cliente", o.versoes > 1 ? `v${o.versao}` : null, v?.tom ? v.rotulo : `emitido ${dataCurta(o.emissao)}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="item__valor">{brl(o.totais.total)}</span>
                      <SeloStatus status={o.efetivo}>{nomeStatus(o.efetivo)}</SeloStatus>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="nada">Nenhum orçamento com esse filtro.</p>
          )}
        </>
      )}
    </div>
  );
}
